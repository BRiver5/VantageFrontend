import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { markPortraitOpenNames, runShellTransition } from '../portraitTransition'
import {
  Award,
  Backpack,
  BookMarked,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gem,
  Landmark,
  Search,
  Skull,
  Sparkles,
  Swords,
  VenetianMask,
  X,
} from 'lucide-react'
import { APP_SHELL_QUERY, useAppShell } from '../shell'
import {
  cacheEntity,
  fetchAll,
  fetchPage,
  getBookMap,
  getMetaEnums,
  splitTitle,
} from '../api'
import type {
  Book,
  BookMap,
  Creature,
  Equipment,
  Feat,
  GameClass,
  Background,
  Item,
  MetaEnums,
  Race,
  Spell,
  Termin,
} from '../api'
import { Divider } from '../ornaments'
import { useEquipmentDrawer } from '../equipmentDrawer'
import { type VTDocument } from './catalog/transitions'
import { type CatalogConfig, PAGE_SIZE, type SwitchRoles, bookCmp, pageFromSearch, toggleIn } from './catalog/config'
import { backgroundFilters, creatureFilters, equipmentFilters, featFilters, itemFilters, spellFilters } from './catalog/filters'
import { creatureSorts, equipmentSorts, itemSorts, spellSorts } from './catalog/sorts'
import { CardLink } from './catalog/shared'
import { FilterMenu } from './catalog/FilterMenu'
import { SortMenu } from './catalog/SortMenu'
import { ItemSplitView } from './catalog/ItemSplitView'
import { classCard, raceCard, featCard, backgroundCard, spellCard, creatureCard, equipmentCard, terminCard, itemCard } from './catalog/cards/renderers'

/* ---------- Фильтры предысторий ---------- */

/**
 * Характеристику предыстория напрямую не повышает — её «профиль» задают навыки,
 * которые она даёт (Акробатика → ЛОВ, Выступление → ХАР). По ним и фильтруем.
 */

function CatalogPage<T extends { id: string }>({ cfg }: { cfg: CatalogConfig<T> }) {
  const navigate = useNavigate()
  const drawer = useEquipmentDrawer()
  const params = useParams<{ id?: string }>()
  const pathId = cfg.inlineUrl === 'path' ? params.id : undefined
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<T[]>([])
  // весь раздел ДО фильтрации — из него меню фильтров берёт список книг
  const [allItems, setAllItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  // лист каталога в адресе (?page=2) — переживает перезагрузку
  const [page, setPage] = useState(() => (cfg.noPaging ? 0 : pageFromSearch(searchParams)))
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState(() =>
    cfg.mobileDefaultSort && window.matchMedia(APP_SHELL_QUERY).matches ? cfg.mobileDefaultSort : 'none',
  )
  const { app } = useAppShell()
  // выбранные фильтры: ключ группы → выбранные варианты (можно несколько)
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookMap, setBookMap] = useState<BookMap>({})
  const bookMapRef = useRef<BookMap>({})
  // раскрытая деталь прямо в списке (для предметов / path-inline классов).
  // UI всегда от selected; pathId только синхронизирует selected (deep link / Back).
  const [selected, setSelected] = useState<T | null>(() =>
    cfg.inlineUrl === 'path' && params.id ? ({ id: params.id } as T) : null,
  )
  // роли на время перелёта карточки: кто прилетает, кто улетает
  const [switching, setSwitching] = useState<SwitchRoles>(null)
  // открытый предмет сохраняем в адресе (?open=id) — переживает перезагрузку
  const initialOpenRef = useRef(cfg.inlineUrl === 'path' ? null : searchParams.get('open'))
  // пользовательский open/close сам ставит selected + navigate — URL→state не трогаем,
  // пока адрес не догонит (иначе pathId снова откроет detail после close).
  const skipUrlSyncRef = useRef(false)
  // не сбрасывать лист при первом прогоне эффектов и при подъёме фильтров из адреса
  const skipSortPageResetRef = useRef(true)
  const skipFilterPageResetRef = useRef(true)

  // предзаполнение фильтров из адреса (переход со страницы класса/подкласса):
  // /spells?class=колдун или ?subclass=…&level=1 — применяем один раз при входе
  const filtersFromUrl = useRef(false)
  useEffect(() => {
    if (filtersFromUrl.current || !cfg.filters) return
    filtersFromUrl.current = true
    const next: Record<string, string[]> = {}
    for (const g of cfg.filters) {
      const vals = searchParams.getAll(g.key).flatMap((v) => v.split(',')).filter(Boolean)
      if (vals.length) next[g.key] = vals
    }
    if (Object.keys(next).length) {
      skipFilterPageResetRef.current = true
      setFilterSel(next)
    }
  }, [cfg.filters, searchParams])

  const withVT = (fn: () => void) => {
    const doc = document as VTDocument
    if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn))
    else fn()
  }

  /**
   * Переход с ролями. Роли надо расставить ДО снимка, иначе браузер снимет
   * «старый» кадр со старыми именами: тогда карточка морфится целиком и её
   * содержимое кросс-фейдится с новым — видно дубли названия и картинки.
   */
  const runVT = (roles: SwitchRoles, apply: () => void) => {
    const doc = document as VTDocument
    if (!doc.startViewTransition) {
      apply()
      return
    }
    flushSync(() => setSwitching(roles))
    const t = doc.startViewTransition(() => flushSync(apply))
    const done = () => setSwitching(null)
    t.finished.then(done, done)
  }

  // path-inline: deep link / Back / nav-scroll — selected следует за :id без анимации
  useEffect(() => {
    if (cfg.inlineUrl !== 'path' || !cfg.inlineDetail) return
    if (skipUrlSyncRef.current) {
      // open: ждём pathId === selected.id; close: ждём pathId === undefined
      if (selected ? pathId === selected.id : !pathId) skipUrlSyncRef.current = false
      else return
    }
    if (pathId) {
      if (selected?.id === pathId) {
        // подтянуть полную запись из списка, если был только `{ id }`
        const found = items.find((it) => it.id === pathId)
        if (found && Object.keys(selected as object).length === 1) setSelected(found)
        return
      }
      const found = items.find((it) => it.id === pathId)
      setSelected(found ?? ({ id: pathId } as T))
    } else if (selected) {
      setSelected(null)
    }
  }, [pathId, items, cfg.inlineUrl, cfg.inlineDetail, selected])

  // Открытие / закрытие. path — портрет-морф (как у рас) + fade оболочки; query — морф предметов.
  const selectItem = (item: T, slot?: HTMLElement) => {
    if (!cfg.inlineDetail) {
      withVT(() => setSelected(item))
      return
    }
    if (cfg.inlineUrl === 'path') {
      // «портрет летит в деталь» — тот же принцип, что у рас (heroNav): помечаем
      // портрет/имя/кость выбранной карточки общими с деталью view-transition-name,
      // остальные карточки разлетаются. Деталь рисуется по selected (flushSync),
      // поэтому морф ловит новый кадр надёжно.
      if (slot) markPortraitOpenNames(slot)
      runShellTransition(
        () => {
          skipUrlSyncRef.current = true
          setSelected(item)
          navigate(`${cfg.base}/${item.id}`)
          queueMicrotask(() => {
            skipUrlSyncRef.current = false
          })
        },
        { scrollTop: true },
      )
      return
    }
    const prev = selected
    const outgoingId = prev && prev.id !== item.id ? prev.id : null
    runVT({ incomingId: item.id, outgoingId }, () => setSelected(item))
    // при переключении окно уезжает вверх — чуть позже начала перелёта, чтобы
    // прокрутка шла следом за анимацией, а не одновременно с ней
    if (outgoingId) window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 260)
  }

  const closeSelected = () => {
    if (!cfg.inlineDetail || !selected) {
      withVT(() => setSelected(null))
      return
    }
    if (cfg.inlineUrl === 'path') {
      runShellTransition(() => {
        skipUrlSyncRef.current = true
        setSelected(null)
        navigate(cfg.base)
        queueMicrotask(() => {
          skipUrlSyncRef.current = false
        })
      })
      return
    }
    runVT({ incomingId: selected.id, outgoingId: null }, () => setSelected(null))
  }

  // восстановление открытого предмета из адреса, когда список подгрузился
  useEffect(() => {
    if (!cfg.inlineDetail || cfg.inlineUrl === 'path' || selected) return
    const openId = initialOpenRef.current
    if (!openId) return
    const found = items.find((it) => it.id === openId)
    if (found) {
      initialOpenRef.current = null
      setSelected(found)
    }
  }, [items, cfg.inlineDetail, cfg.inlineUrl, selected])

  // выбранный предмет ⇄ адрес (?open=id); лист ⇄ ?page=N — оба переживают перезагрузку
  useEffect(() => {
    if (cfg.inlineDetail && cfg.inlineUrl !== 'path' && initialOpenRef.current && !selected) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (cfg.inlineDetail && cfg.inlineUrl !== 'path') {
          if (selected) next.set('open', selected.id)
          else next.delete('open')
        }
        if (!cfg.noPaging) {
          if (page > 0) next.set('page', String(page + 1))
          else next.delete('page')
        }
        return next.toString() === prev.toString() ? prev : next
      },
      { replace: true },
    )
  }, [selected, page, cfg.inlineDetail, cfg.inlineUrl, cfg.noPaging, setSearchParams])

  // книги нужны и для бейджей источника, и для сортировки «по книге»
  useEffect(() => {
    getBookMap()
      .then((m) => {
        bookMapRef.current = m
        setBookMap(m)
      })
      .catch(() => {})
  }, [])

  // задержка поиска, чтобы не дёргать API на каждый символ
  const prevQueryRef = useRef<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim()
      if (prevQueryRef.current !== null && prevQueryRef.current !== next) setPage(0)
      prevQueryRef.current = next
      setQuery(next)
    }, 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (skipSortPageResetRef.current) {
      skipSortPageResetRef.current = false
      return
    }
    setPage(0)
  }, [sortKey])

  // смена фильтров возвращает на первую страницу (кроме подъёма из адреса)
  useEffect(() => {
    if (skipFilterPageResetRef.current) {
      skipFilterPageResetRef.current = false
      return
    }
    setPage(0)
  }, [filterSel])

  const activeFilterCount = Object.values(filterSel).reduce((n, v) => n + v.length, 0)
  const toggleFilter = (groupKey: string, optKey: string) =>
    setFilterSel((cur) => toggleIn(cur, groupKey, optKey))

  useEffect(() => {
    let stale = false
    setLoading(true)
    const activeSort = cfg.sorts?.find((s) => s.key === sortKey)
    const groups = cfg.filters ?? []
    const activeGroups = groups.filter((g) => (filterSel[g.key]?.length ?? 0) > 0)

    if (!cfg.noPaging && !activeSort && activeGroups.length === 0) {
      fetchPage<T>(cfg.resource, { skip: page * PAGE_SIZE, limit: PAGE_SIZE, q: query || undefined })
        .then((res) => {
          if (stale) return
          setItems(res.items)
          setAllItems(res.items)
          setTotal(res.total)
          setError(null)
        })
        .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !stale && setLoading(false))
    } else {
      // ни сортировка, ни фильтры не поддерживаются сервером — тянем весь список
      // и обрабатываем на клиенте, иначе фильтр видел бы только текущую страницу
      fetchAll<T>(cfg.resource, { q: query || undefined })
        .then((all) => {
          if (stale) return
          setAllItems(all)
          const bm = bookMapRef.current
          // группы складываются по И, варианты внутри группы — по ИЛИ
          let list = activeGroups.length
            ? all.filter((it) => activeGroups.every((g) => g.match(it, filterSel[g.key], bm)))
            : all
          if (activeSort) list = [...list].sort((a, b) => activeSort.cmp(a, b, bm))
          setTotal(list.length)
          setItems(cfg.noPaging ? list : list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE))
          setError(null)
        })
        .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !stale && setLoading(false))
    }
    return () => {
      stale = true
    }
  }, [cfg.resource, cfg.sorts, cfg.filters, cfg.noPaging, page, query, sortKey, filterSel])

  // кладём загруженные записи в кэш — деталь откроется мгновенно (нужно морфу)
  useEffect(() => {
    items.forEach((it) => cacheEntity(cfg.resource, it.id, it))
  }, [items, cfg.resource])

  const pages = cfg.noPaging ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE))
  const EmptyIcon = cfg.emptyIcon
  const sorting = sortKey !== 'none'

  // если после фильтра/поиска листов стало меньше — подтянуть номер из адреса
  useEffect(() => {
    if (cfg.noPaging || loading || total === 0) return
    if (page >= pages) setPage(pages - 1)
  }, [cfg.noPaging, loading, total, page, pages])

  // группы по книгам: порядок книг — как у сортировки «по книге», без книги — в конец
  const groupByBook = cfg.groupByBook
  const bookGroups = useMemo(() => {
    if (!groupByBook) return null
    const byBook = new Map<string, T[]>()
    for (const item of items) {
      const id = groupByBook(item) ?? ''
      const list = byBook.get(id)
      if (list) list.push(item)
      else byBook.set(id, [item])
    }
    // «Книга игрока» — всегда первой группой, остальные по коду книги
    const phbRank = (book: Book | undefined) => (book?.book_code === 'PHB' ? 0 : 1)
    return [...byBook.entries()]
      .map(([id, list]) => ({ id, book: id ? bookMap[id] : undefined, items: list }))
      .sort(
        (a, b) =>
          phbRank(a.book) - phbRank(b.book) || bookCmp(a.id || null, b.id || null, bookMap),
      )
  }, [groupByBook, items, bookMap])

  const renderCard = (item: T) => (
    <CardLink
      key={item.id}
      to={`${cfg.base}/${item.id}`}
      // у предметов рамка безымянная у incoming; path-portrait летит через class-hero-*
      vtName={
        cfg.inlineDetail && cfg.inlineUrl !== 'path' && switching?.incomingId !== item.id
          ? `card-${item.id}`
          : undefined
      }
      onOpen={
        cfg.inlineDetail
          ? (slot) => selectItem(item, slot)
          : cfg.resource === 'equipment'
            ? () => drawer.open(item.id)
            : undefined
      }
      heroNav={cfg.heroNav}
    >
      {cfg.card(item, bookMap, switching?.incomingId === item.id ? 'incoming' : undefined)}
    </CardLink>
  )

  // раскрытая деталь в оболочке — только selected (не pathId: он отстаёт от navigate)
  if (cfg.inlineDetail && selected) {
    return (
      <section className={`catalog${cfg.wide ? ' catalog--wide' : ''}`}>
        {cfg.inlineDetail({
          selected,
          items,
          onSelect: selectItem,
          onClose: closeSelected,
          bookMap,
          switching,
        })}
      </section>
    )
  }

  return (
    <section className={`catalog${cfg.wide ? ' catalog--wide' : ''}`}>
      {/* шапка раздела уезжает под масthead при раскрытии предмета (см. CSS) */}
      <div className="section-head">
        <h1 className="section-title gold-text">{cfg.title}</h1>
        <p className="section-sub">{cfg.sub}</p>
      </div>

      <div className="quest-bar">
        <label className="quest-input">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Искать в архивах…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button type="button" className="quest-clear" onClick={() => setQ('')} aria-label="Очистить поиск">
              <X aria-hidden="true" />
            </button>
          )}
        </label>

        {cfg.filters && cfg.filters.length > 0 && (
          <FilterMenu
            groups={cfg.filters}
            sel={filterSel}
            onToggle={toggleFilter}
            onReset={() => setFilterSel({})}
            bookMap={bookMap}
            items={allItems}
          />
        )}

        {app && cfg.sorts && cfg.sorts.length > 0 && (
          <SortMenu sorts={cfg.sorts} value={sortKey} onChange={setSortKey} />
        )}

        <span className="quest-total">
          {loading
            ? activeFilterCount > 0
              ? 'просеиваем архив…'
              : sorting
                ? 'сортируем архив…'
                : 'листаем страницы…'
            : `найдено записей: ${total.toLocaleString('ru')}`}
        </span>
      </div>

      {!app && cfg.sorts && cfg.sorts.length > 0 && (
        <div className="sort-bar" role="group" aria-label="Сортировка">
          <span className="sort-label">Сортировать:</span>
          {cfg.sorts.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`sort-btn${sortKey === key ? ' is-active' : ''}`}
              onClick={() => setSortKey((cur) => (cur === key ? 'none' : key))}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="status-line is-error">Архив недоступен: {error}</p>}

      {!error && !bookGroups && (
        <div className="card-grid" data-loading={loading || undefined}>
          {items.map(renderCard)}
        </div>
      )}

      {!error && bookGroups && (
        <div className="catalog-groups" data-loading={loading || undefined}>
          {bookGroups.map((group) => {
            const { ru, en } = group.book ? splitTitle(group.book.title) : { ru: 'Прочие источники', en: null }
            const plate = (
              <>
                <BookMarked aria-hidden="true" />
                {ru}
                {group.book?.book_code && <i>{group.book.book_code}</i>}
                <b>{group.items.length}</b>
              </>
            )
            return (
              <section className="catalog-group" key={group.id || 'none'}>
                <header className="catalog-group-head">
                  <span className="catalog-group-rule" aria-hidden="true" />
                  {group.book ? (
                    <Link
                      to={`/books/${group.book.id}`}
                      className="catalog-group-plate catalog-group-plate--link"
                      title={en ? `${en} — открыть том` : 'Открыть том'}
                    >
                      {plate}
                    </Link>
                  ) : (
                    <span className="catalog-group-plate">{plate}</span>
                  )}
                  <span className="catalog-group-rule" aria-hidden="true" />
                </header>
                <div className="card-grid">{group.items.map(renderCard)}</div>
              </section>
            )
          })}
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <p className="hive-empty">
          <EmptyIcon aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 8 }} />
          По такому запросу в архивах пусто…
        </p>
      )}

      {!error && pages > 1 && (
        <nav className="pager" aria-label="Страницы">
          <button
            type="button"
            className="car-arrow pager-arrow"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Назад"
          >
            <span><ChevronLeft /></span>
          </button>
          <span className="pager-label">
            лист <b className="gold-text">{page + 1}</b> из {pages}
          </span>
          <button
            type="button"
            className="car-arrow pager-arrow"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Вперёд"
          >
            <span><ChevronRight /></span>
          </button>
        </nav>
      )}

      <Divider />
    </section>
  )
}

/* ---------- Готовые страницы разделов ---------- */

/** Оболочка каталога классов; `inlineDetail` задаётся снаружи (ClassDetailView). */
export function ClassesCatalog({
  inlineDetail,
}: {
  inlineDetail: NonNullable<CatalogConfig<GameClass>['inlineDetail']>
}) {
  return (
    <CatalogPage<GameClass>
      cfg={{
        resource: 'classes',
        base: '/classes',
        title: 'Классы',
        sub: 'Пути воинов, магов и плутов — выбери своё призвание',
        emptyIcon: Swords,
        card: classCard,
        inlineUrl: 'path',
        inlineDetail,
      }}
    />
  )
}

export const RacesPage = () => (
  <CatalogPage<Race>
    cfg={{
      resource: 'races',
      base: '/races',
      title: 'Расы и Виды',
      sub: 'Народы и существа, населяющие миры мультивселенной',
      emptyIcon: VenetianMask,
      card: raceCard,
      heroNav: true,
      noPaging: true,
    }}
  />
)

export const FeatsPage = () => (
  <CatalogPage<Feat>
    cfg={{
      resource: 'feats',
      base: '/feats',
      title: 'Черты',
      sub: 'Особые таланты и способности, доступные при развитии персонажа',
      emptyIcon: Award,
      card: featCard,
      filters: featFilters,
      groupByBook: (f) => f.book_source_id,
      noPaging: true,
    }}
  />
)

export const BackgroundsPage = () => (
  <CatalogPage<Background>
    cfg={{
      resource: 'backgrounds',
      base: '/backgrounds',
      title: 'Предыстории',
      sub: 'Прошлое героя — навыки, инструменты и особая черта',
      emptyIcon: Landmark,
      card: backgroundCard,
      filters: backgroundFilters,
      groupByBook: (bg) => bg.book_source_id,
      noPaging: true,
    }}
  />
)

export const SpellsPage = () => (
  <CatalogPage<Spell>
    cfg={{
      resource: 'spells',
      base: '/spells',
      title: 'Заклинания',
      sub: 'Гримуар чар — от заговоров до девятого круга',
      emptyIcon: Sparkles,
      card: spellCard,
      sorts: spellSorts,
      mobileDefaultSort: 'level',
      filters: spellFilters,
    }}
  />
)

export const BestiaryPage = () => (
  <CatalogPage<Creature>
    cfg={{
      resource: 'creatures',
      base: '/bestiary',
      title: 'Бестиарий',
      sub: 'Существа и чудовища — от безобидных до легендарных',
      emptyIcon: Skull,
      card: creatureCard,
      sorts: creatureSorts,
      filters: creatureFilters,
      heroNav: true,
    }}
  />
)

export const TerminsPage = () => (
  <CatalogPage<Termin>
    cfg={{
      resource: 'termins',
      base: '/termins',
      title: 'Термины',
      sub: 'Ключевые понятия правил — действия, броски, освещение и другое',
      emptyIcon: BookOpen,
      card: terminCard,
    }}
  />
)

/**
 * Раздел не константа, как остальные: варианты фильтров приходят из
 * `/api/meta/enums`, поэтому нужен стейт. `filters` мемоизируем — массив входит
 * в зависимости эффекта загрузки внутри CatalogPage, и новая ссылка на каждый
 * рендер зациклила бы запросы.
 */
export function EquipmentPage() {
  const [enums, setEnums] = useState<MetaEnums | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    getMetaEnums()
      .then(setEnums)
      .finally(() => setReady(true))
  }, [])
  const filters = useMemo(() => equipmentFilters(enums), [enums])

  // Каталог монтируем только со готовыми справочниками: фильтры из адреса он
  // поднимает ОДИН раз при первом рендере, и без нужных групп ссылка «выбрать»
  // со страницы класса открыла бы список без фильтров.
  if (!ready) return <p className="status-line">Раскладываем снаряжение…</p>

  return (
    <CatalogPage<Equipment>
      cfg={{
        resource: 'equipment',
        base: '/equipment',
        title: 'Снаряжение',
        sub: 'Оружие, доспехи и походный скарб — от стрел до вьючных мулов',
        emptyIcon: Backpack,
        card: equipmentCard,
        sorts: equipmentSorts,
        filters,
        wide: true,
      }}
    />
  )
}

export const ItemsPage = () => (
  <CatalogPage<Item>
    cfg={{
      resource: 'items',
      base: '/items',
      title: 'Магические Предметы',
      sub: 'Реликвии, артефакты и сокровища подземелий',
      emptyIcon: Gem,
      card: itemCard,
      filters: itemFilters,
      wide: true,
      sorts: itemSorts,
      inlineUrl: 'query',
      inlineDetail: (ctx) => <ItemSplitView {...ctx} />,
    }}
  />
)
