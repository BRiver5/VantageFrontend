import { applySmartSearch, smartSearchRanks } from '../search/sectionSearch'
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
  Skull,
  Sparkles,
  Swords,
  VenetianMask,
} from 'lucide-react'
import { APP_SHELL_QUERY } from '../shell'
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
import { type CatalogConfig, PAGE_SIZE, type SwitchRoles, bookCmp, catalogSearch, filtersFromSearch, pageFromSearch, toggleIn } from './catalog/config'
import { backgroundFilters, creatureFilters, equipmentFilters, featFilters, itemFilters, spellFilters } from './catalog/filters'
import { creatureSorts, equipmentSorts, itemSorts, spellSorts } from './catalog/sorts'
import { CardLink } from './catalog/shared'
import { CatalogToolbar } from './catalog/CatalogToolbar'
import { ItemSplitView } from './catalog/ItemSplitView'
import { OtherEditionNote, SectionEditionToggle } from '../editions/EditionControls'
import { otherEditionOf, preferredEditionFirst, withRecordEdition } from '../editions/edition'
import { useEdition } from '../editions/useEdition'
import { classCard, raceCard, featCard, backgroundCard, spellCard, creatureCard, equipmentCard, terminCard, itemCard } from './catalog/cards/renderers'

/** Поле названия записи раздела — для локального совпадения умного поиска */
const NAME_FIELD: Record<string, string> = {
  classes: 'class_name',
  races: 'race_name',
  feats: 'feat_name',
  backgrounds: 'background_name',
  spells: 'spell_name',
  creatures: 'name',
  termins: 'name',
  equipment: 'equipment_name',
  items: 'item_name',
}

/** Полный список раздела в редакции — один запрос на время сессии (поиск по нему идёт часто) */
const allCache = new Map<string, Promise<unknown[]>>()
function allOfEdition<T>(resource: string, edition: string): Promise<T[]> {
  const key = `${resource}:${edition}`
  let p = allCache.get(key)
  if (!p) {
    p = fetchAll<T>(resource, { edition: edition as '2014' | '2024' }).catch((e: unknown) => {
      allCache.delete(key)
      throw e
    })
    allCache.set(key, p)
  }
  return p as Promise<T[]>
}

/** ширина карточки и зазор сетки каталога (.card-grid: minmax(290px, 1fr), gap 18px) */
const CARD_MIN = 290
const CARD_GAP = 18

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
  // поиск, сортировка и фильтры живут и в адресе: «назад» со страницы записи возвращает их как были
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [query, setQuery] = useState(() => (searchParams.get('q') ?? '').trim())
  const [sortKey, setSortKey] = useState(
    () =>
      searchParams.get('sort') ??
      (cfg.mobileDefaultSort && window.matchMedia(APP_SHELL_QUERY).matches ? cfg.mobileDefaultSort : 'none'),
  )
  // редакция раздела: своя или общая; смена — перезапрос с первого листа
  const { edition } = useEdition(cfg.resource)
  const prevEditionRef = useRef(edition)
  useEffect(() => {
    if (prevEditionRef.current === edition) return
    prevEditionRef.current = edition
    setPage(0)
  }, [edition])
  // размер листа — целое число рядов: при 5 колонках 25 карточек, при 2/3/4/6 — 24
  // (иначе в последнем ряду широкого экрана не хватает одной карточки)
  const sectionRef = useRef<HTMLElement>(null)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  useEffect(() => {
    const el = sectionRef.current
    if (!el || cfg.noPaging) return
    const ro = new ResizeObserver(() => {
      const cols = Math.max(1, Math.floor((el.clientWidth + CARD_GAP) / (CARD_MIN + CARD_GAP)))
      setPageSize(cols * Math.ceil(PAGE_SIZE / cols))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [cfg.noPaging])
  // выбранные фильтры: ключ группы → выбранные варианты (можно несколько)
  const filterKeys = useMemo(() => (cfg.filters ?? []).map((g) => g.key), [cfg.filters])
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>(() => filtersFromSearch(searchParams, filterKeys))
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

  // фильтры из адреса (переход со страницы класса — /spells?class=колдун&level=9 — или «назад»
  // со страницы записи) берутся сразу при входе: см. useState(filtersFromSearch) выше

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
          navigate(withRecordEdition(`${cfg.base}/${item.id}`, item))
          queueMicrotask(() => {
            skipUrlSyncRef.current = false
          })
        },
        { scrollTop: true },
      )
      return
    }
    // запись другой редакции (из поиска) открывается в своей: ?ed= — как у ссылки на запись.
    // Своё ?ed= не трогаем: его ставит переключатель редакции записи перед выбором варианта.
    const itemEd = otherEditionOf(item)
    if (itemEd) {
      setSearchParams(
        (prevParams) => {
          const next = new URLSearchParams(prevParams)
          next.set('ed', itemEd)
          return next
        },
        { replace: true },
      )
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
  // Адрес трогаем, только если он и правда меняется: setSearchParams — это всегда
  // navigate(replace) относительно ТЕКУЩЕГО (по рендеру) пути. Открытие класса «на месте»
  // ставит selected синхронно, а переход на /classes/:id роутер применяет позже (transition) —
  // холостой вызов отсюда заменял бы только что открытый /classes/:id обратно на /classes,
  // и переключатель редакции записи не находил бы id в адресе.
  const selectedId = selected?.id ?? null
  // последние параметры адреса — без них в зависимостях (Back по ?page= не должен
  // возвращать прежний лист обратно)
  const searchRef = useRef(searchParams)
  searchRef.current = searchParams
  useEffect(() => {
    if (cfg.inlineDetail && cfg.inlineUrl !== 'path' && initialOpenRef.current && !selectedId) return
    const next = catalogSearch(searchRef.current, {
      open: cfg.inlineDetail && cfg.inlineUrl !== 'path' ? selectedId : undefined,
      page: cfg.noPaging ? undefined : page,
      filters: { keys: filterKeys, sel: filterSel },
      sort: sortKey,
      q: query,
    })
    if (next) setSearchParams(next, { replace: true })
  }, [selectedId, page, cfg.inlineDetail, cfg.inlineUrl, cfg.noPaging, setSearchParams, filterKeys, filterSel, sortKey, query])

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

  const toggleFilter = (groupKey: string, optKey: string) => setFilterSel((cur) => toggleIn(cur, groupKey, optKey))

  useEffect(() => {
    let stale = false
    setLoading(true)
    const activeSort = cfg.sorts?.find((s) => s.key === sortKey)
    const groups = cfg.filters ?? []
    const activeGroups = groups.filter((g) => (filterSel[g.key]?.length ?? 0) > 0)

    if (!cfg.noPaging && !activeSort && activeGroups.length === 0 && !query) {
      // поиск находит и записи другой редакции — после записей выбранной, с подписью
      fetchPage<T>(cfg.resource, { skip: page * pageSize, limit: pageSize, q: query || undefined, edition, otherEditions: true })
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
      // поиск — умный, как на главной (опечатки, неверная раскладка, части слов), но по разделу:
      // сервер даёт порядок релевантности, записи берутся из полного списка редакции;
      // записи другой редакции (по подстроке) — после своих, с подписью
      const nameOf = (it: T) => String((it as Record<string, unknown>)[NAME_FIELD[cfg.resource] ?? 'name'] ?? '')
      const idOf = (it: T) => String((it as { id?: string }).id ?? '')
      Promise.all([
        allOfEdition<T>(cfg.resource, edition),
        query ? smartSearchRanks(cfg.resource, query) : Promise.resolve(null),
        query ? fetchAll<T>(cfg.resource, { q: query, edition, otherEditions: true }).catch(() => [] as T[]) : Promise.resolve([] as T[]),
      ])
        .then(([base, ranks, byText]) => {
          if (stale) return
          const own = new Set(base.map(idOf))
          const others = byText.filter((it) => otherEditionOf(it) && !own.has(idOf(it)))
          const all = query ? [...applySmartSearch(base, query, ranks, idOf, nameOf), ...others] : base
          setAllItems(all)
          const bm = bookMapRef.current
          // группы складываются по И, варианты внутри группы — по ИЛИ
          let list = activeGroups.length
            ? all.filter((it) => activeGroups.every((g) => g.match(it, filterSel[g.key], bm)))
            : all
          if (activeSort) list = [...list].sort((a, b) => activeSort.cmp(a, b, bm))
          // сортировка не смешивает редакции: записи другой (поиск) — всё равно после своих
          list = preferredEditionFirst(list)
          setTotal(list.length)
          setItems(cfg.noPaging ? list : list.slice(page * pageSize, page * pageSize + pageSize))
          setError(null)
        })
        .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !stale && setLoading(false))
    }
    return () => {
      stale = true
    }
  }, [cfg.resource, cfg.sorts, cfg.filters, cfg.noPaging, page, query, sortKey, filterSel, edition, pageSize])

  // кладём загруженные записи в кэш — деталь откроется мгновенно (нужно морфу)
  useEffect(() => {
    items.forEach((it) => cacheEntity(cfg.resource, it.id, it))
  }, [items, cfg.resource])

  const pages = cfg.noPaging ? 1 : Math.max(1, Math.ceil(total / pageSize))
  const EmptyIcon = cfg.emptyIcon

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
    // «Книга игрока» (2014 и 2024) — всегда первой группой, остальные по коду книги
    const phbRank = (book: Book | undefined) => (book?.book_code === 'PHB' || book?.book_code === 'PHB24' ? 0 : 1)
    return [...byBook.entries()]
      .map(([id, list]) => ({ id, book: id ? bookMap[id] : undefined, items: list }))
      .sort(
        (a, b) =>
          phbRank(a.book) - phbRank(b.book) || bookCmp(a.id || null, b.id || null, bookMap),
      )
  }, [groupByBook, items, bookMap])

  const renderCard = (item: T) => {
    const otherEd = otherEditionOf(item)
    return (
    <CardLink
      key={item.id}
      to={withRecordEdition(`${cfg.base}/${item.id}`, item)}
      className={otherEd ? 'card-slot--other-edition' : undefined}
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
      <OtherEditionNote edition={otherEd} />
    </CardLink>
    )
  }

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
    <section ref={sectionRef} className={`catalog${cfg.wide ? ' catalog--wide' : ''}`}>
      {/* шапка раздела уезжает под масthead при раскрытии предмета (см. CSS) */}
      <div className="section-head">
        <h1 className="section-title gold-text">{cfg.title}</h1>
        <p className="section-sub">{cfg.sub}</p>
        <SectionEditionToggle section={cfg.resource} />
      </div>

      <CatalogToolbar
        q={q}
        onQ={setQ}
        busy={loading || q.trim() !== query}
        total={total}
        filters={cfg.filters}
        filterSel={filterSel}
        onToggleFilter={toggleFilter}
        onResetFilters={() => setFilterSel({})}
        bookMap={bookMap}
        allItems={allItems}
        sorts={cfg.sorts}
        sortKey={sortKey}
        onSort={setSortKey}
      />

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
