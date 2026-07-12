import { isValidElement, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownAZ,
  Award,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Coins,
  Eye,
  Flame,
  Footprints,
  Gem,
  Heart,
  Hourglass,
  Landmark,
  Ruler,
  Search,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Target,
  VenetianMask,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  cleanDescription,
  fetchAll,
  fetchPage,
  formatCR,
  getBookMap,
  realImage,
  splitTitle,
} from '../api'
import type { Book, BookMap, Creature, Feat, GameClass, Background, Item, Race, Spell } from '../api'
import { Divider } from '../ornaments'
import { DieChipIcon, hitDieType } from '../dice/diceAssets'

const PAGE_SIZE = 24

/* ---------- Мелкие детали карточек ---------- */

function Chip({ icon, children }: { icon: LucideIcon | ReactNode; children: ReactNode }) {
  // icon может быть готовым элементом (<DieChipIcon/>) ИЛИ компонентом-иконкой.
  // lucide-иконки — это forwardRef-объекты (typeof === 'object', НЕ 'function'),
  // поэтому различаем по isValidElement, а не по typeof — иначе объект уходит в
  // дети и React падает: «Objects are not valid as a React child».
  const Icon = icon as LucideIcon
  return (
    <span className="chip">
      {isValidElement(icon) ? icon : <Icon aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Гекс-жетон со значением (уровень заклинания, CR существа) */
function HexBadge({ value, label }: { value: string; label: string }) {
  return (
    <span className="hex-badge" title={label}>
      <span className="hex-badge-inner">
        <b>{value}</b>
        <i>{label}</i>
      </span>
    </span>
  )
}

/** Аббревиатура книги-источника; полное название всплывает при наведении */
export function SourceBadge({ book }: { book: Book | undefined }) {
  if (!book) return null
  const { ru, en } = splitTitle(book.title)
  return (
    <span className="chip source-chip" title={en ? `${ru} — ${en}` : ru}>
      <BookMarked aria-hidden="true" />
      {book.book_code}
    </span>
  )
}

function CardImage({ src, alt, fallback: Fallback }: { src: string | null; alt: string; fallback: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="card-img">
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Fallback className="card-img-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

/* ---------- Конфигурация раздела ---------- */

interface SortOption<T> {
  key: string
  label: string
  icon: LucideIcon
  cmp: (a: T, b: T, bookMap: BookMap) => number
}

interface CatalogConfig<T> {
  resource: string
  /** базовый маршрут детальной страницы записи */
  base: string
  title: string
  sub: string
  emptyIcon: LucideIcon
  card: (item: T, bookMap: BookMap) => ReactNode
  /** если задано — под поиском появляется переключатель сортировки */
  sorts?: SortOption<T>[]
}

/* ---------- Вспомогательное для сортировок ---------- */

/** Записи без источника или ненайденной книги уходят в конец списка */
function bookCmp(idA: string | null | undefined, idB: string | null | undefined, bookMap: BookMap): number {
  const ca = (idA && bookMap[idA]?.book_code) || ''
  const cb = (idB && bookMap[idB]?.book_code) || ''
  if (!ca && !cb) return 0
  if (!ca) return 1
  if (!cb) return -1
  return ca.localeCompare(cb, 'ru')
}

const RARITY_ORDER = ['обычный', 'необычный', 'редкий', 'очень редкий', 'легендарный', 'артефакт']
function rarityRank(r: string | null): number {
  if (!r) return 999
  const i = RARITY_ORDER.indexOf(r.toLowerCase())
  return i === -1 ? 999 : i
}

/* ---------- Карточки по типам ---------- */

const RARITY_KEY: Record<string, string> = {
  'обычный': 'common',
  'необычный': 'uncommon',
  'редкий': 'rare',
  'очень редкий': 'very-rare',
  'легендарный': 'legendary',
  'артефакт': 'artifact',
}

function classCard(c: GameClass) {
  return (
    <article className="card">
      <CardImage src={realImage(c.image_gallery)} alt={c.class_name} fallback={Swords} />
      <h3 className="card-name">{c.class_name}</h3>
      <div className="card-chips">
        <Chip icon={<DieChipIcon type={hitDieType(c.hit_dice)} />}>к{c.hit_dice} хитов</Chip>
        {c.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
        {c.saving_throw_proficiencies && c.saving_throw_proficiencies.length > 0 && (
          <Chip icon={Shield}>{c.saving_throw_proficiencies.join(', ')}</Chip>
        )}
      </div>
      <p className="card-desc">{cleanDescription(c.description)}</p>
    </article>
  )
}

function raceCard(r: Race) {
  const abilities = Object.entries(r.increase_ability_scores ?? {})
    .map(([k, v]) => `${ABILITY_RU[k] ?? k} +${v}`)
    .join(', ')
  return (
    <article className="card">
      <CardImage src={realImage(r.image_gallery)} alt={r.race_name} fallback={VenetianMask} />
      <h3 className="card-name">{r.race_name}</h3>
      <div className="card-chips">
        {r.size && <Chip icon={Ruler}>{r.size}</Chip>}
        <Chip icon={Footprints}>{r.speed} фт.</Chip>
        {r.darkvision > 0 && <Chip icon={Eye}>тьма {r.darkvision} фт.</Chip>}
        {abilities && <Chip icon={Star}>{abilities}</Chip>}
      </div>
      <p className="card-desc">{cleanDescription(r.description)}</p>
    </article>
  )
}

function featCard(f: Feat, bookMap: BookMap) {
  const abilities = Object.entries(f.increase_ability_scores ?? {})
    .map(([k, v]) => `${ABILITY_RU[k] ?? k} +${v}`)
    .join(', ')
  return (
    <article className="card">
      <h3 className="card-name">{f.feat_name}</h3>
      <div className="card-chips">
        <SourceBadge book={f.book_source_id ? bookMap[f.book_source_id] : undefined} />
        {f.prerequisite && <Chip icon={Shield}>треб.: {f.prerequisite}</Chip>}
        {abilities && <Chip icon={Star}>{abilities}</Chip>}
      </div>
      <p className="card-desc">{cleanDescription(f.description)}</p>
    </article>
  )
}

function backgroundCard(bg: Background, bookMap: BookMap) {
  const skills = bg.skill_proficiencies?.slice(0, 3).join(', ')
  return (
    <article className="card">
      <CardImage src={realImage(bg.image_gallery)} alt={bg.background_name} fallback={Landmark} />
      <h3 className="card-name">{bg.background_name}</h3>
      <div className="card-chips">
        <SourceBadge book={bg.book_source_id ? bookMap[bg.book_source_id] : undefined} />
        {skills && <Chip icon={Star}>{skills}</Chip>}
        {bg.feature_name && <Chip icon={Landmark}>{bg.feature_name}</Chip>}
      </div>
      <p className="card-desc">{cleanDescription(bg.description)}</p>
    </article>
  )
}

function spellCard(s: Spell, bookMap: BookMap) {
  return (
    <article className="card card--compact">
      <div className="card-head">
        <HexBadge value={s.spell_level === 0 ? '◈' : String(s.spell_level)} label={s.spell_level === 0 ? 'заговор' : 'круг'} />
        <div>
          <h3 className="card-name">{s.spell_name}</h3>
          {s.school && <span className="card-kicker">{s.school}</span>}
        </div>
      </div>
      <div className="card-chips">
        <SourceBadge book={s.spell_source ? bookMap[s.spell_source] : undefined} />
        {s.casting_time && <Chip icon={Hourglass}>{s.casting_time.length > 26 ? '1 реакция' : s.casting_time}</Chip>}
        {s.range && <Chip icon={Target}>{s.range}</Chip>}
        {s.concentration && <Chip icon={Eye}>концентрация</Chip>}
        {s.ritual && <Chip icon={Star}>ритуал</Chip>}
      </div>
      <p className="card-desc">{cleanDescription(s.description)}</p>
      {s.available_classes && s.available_classes.length > 0 && (
        <span className="card-foot">
          <Swords aria-hidden="true" /> {s.available_classes.join(', ')}
        </span>
      )}
    </article>
  )
}

function creatureCard(c: Creature, bookMap: BookMap) {
  const kind = [c.size, c.creature_type, c.alignment].filter(Boolean).join(' · ')
  return (
    <article className="card card--compact">
      <div className="card-head">
        <HexBadge value={formatCR(c.challenge_rating)} label="ПО" />
        <div>
          <h3 className="card-name">{c.name}</h3>
          {kind && <span className="card-kicker">{kind}</span>}
        </div>
      </div>
      <CardImage src={realImage(c.image_gallery)} alt={c.name} fallback={Skull} />
      <div className="card-chips">
        <SourceBadge book={c.book_source_id ? bookMap[c.book_source_id] : undefined} />
        <Chip icon={Shield}>КД {c.ac}</Chip>
        <Chip icon={Heart}>{c.hp} хп</Chip>
        {c.speed != null && <Chip icon={Footprints}>{c.speed} фт.</Chip>}
      </div>
      <p className="card-desc">{cleanDescription(c.description ?? c.creature_description)}</p>
    </article>
  )
}

function itemCard(it: Item, bookMap: BookMap) {
  const gp = it.cost_copper ? Math.round(it.cost_copper / 100) : null
  const rarityKey = it.rarity ? RARITY_KEY[it.rarity.toLowerCase()] : undefined
  return (
    <article className="card card--compact">
      <h3 className="card-name">{it.item_name}</h3>
      {it.item_type && <span className="card-kicker">{it.item_type}</span>}
      <div className="card-chips">
        <SourceBadge book={it.item_source ? bookMap[it.item_source] : undefined} />
        {it.rarity && (
          <span className="chip" data-rarity={rarityKey}>
            <Gem aria-hidden="true" />
            {it.rarity}
          </span>
        )}
        {it.attunement_required && <Chip icon={Sparkles}>настройка</Chip>}
        {gp != null && gp > 0 && <Chip icon={Coins}>{gp.toLocaleString('ru')} зм</Chip>}
      </div>
      <p className="card-desc">{cleanDescription(it.description)}</p>
    </article>
  )
}

/* ---------- Наборы сортировок ---------- */

const itemSorts: SortOption<Item>[] = [
  { key: 'name', label: 'А — Я', icon: ArrowDownAZ, cmp: (a, b) => a.item_name.localeCompare(b.item_name, 'ru') },
  { key: 'rarity', label: 'Редкость', icon: Gem, cmp: (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.item_source, b.item_source, bm) },
]

const creatureSorts: SortOption<Creature>[] = [
  { key: 'name', label: 'А — Я', icon: ArrowDownAZ, cmp: (a, b) => a.name.localeCompare(b.name, 'ru') },
  { key: 'cr', label: 'Опасность', icon: Flame, cmp: (a, b) => (a.challenge_rating ?? -1) - (b.challenge_rating ?? -1) },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.book_source_id, b.book_source_id, bm) },
]

const spellSorts: SortOption<Spell>[] = [
  { key: 'name', label: 'А — Я', icon: ArrowDownAZ, cmp: (a, b) => a.spell_name.localeCompare(b.spell_name, 'ru') },
  { key: 'level', label: 'Круг', icon: Sparkles, cmp: (a, b) => a.spell_level - b.spell_level },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.spell_source, b.spell_source, bm) },
]

/* ---------- Сама страница ---------- */

function CatalogPage<T extends { id: string }>({ cfg }: { cfg: CatalogConfig<T> }) {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookMap, setBookMap] = useState<BookMap>({})
  const bookMapRef = useRef<BookMap>({})

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
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim())
      setPage(0)
    }, 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setPage(0)
  }, [sortKey])

  useEffect(() => {
    let stale = false
    setLoading(true)
    const activeSort = cfg.sorts?.find((s) => s.key === sortKey)

    if (!activeSort) {
      fetchPage<T>(cfg.resource, { skip: page * PAGE_SIZE, limit: PAGE_SIZE, q: query || undefined })
        .then((res) => {
          if (stale) return
          setItems(res.items)
          setTotal(res.total)
          setError(null)
        })
        .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !stale && setLoading(false))
    } else {
      // сортировка не поддерживается сервером — тянем весь отфильтрованный список и сортируем на клиенте
      fetchAll<T>(cfg.resource, { q: query || undefined })
        .then((all) => {
          if (stale) return
          const sorted = [...all].sort((a, b) => activeSort.cmp(a, b, bookMapRef.current))
          setTotal(sorted.length)
          setItems(sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE))
          setError(null)
        })
        .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !stale && setLoading(false))
    }
    return () => {
      stale = true
    }
  }, [cfg.resource, cfg.sorts, page, query, sortKey])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const EmptyIcon = cfg.emptyIcon
  const sorting = sortKey !== 'none'

  return (
    <section className="catalog">
      <h1 className="section-title gold-text">{cfg.title}</h1>
      <p className="section-sub">{cfg.sub}</p>

      <div className="quest-bar">
        <label className="quest-input">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Искать в архивах…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span className="quest-total">
          {loading ? (sorting ? 'сортируем архив…' : 'листаем страницы…') : `найдено записей: ${total.toLocaleString('ru')}`}
        </span>
      </div>

      {cfg.sorts && cfg.sorts.length > 0 && (
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

      {!error && (
        <div className="card-grid" data-loading={loading || undefined}>
          {items.map((item) => (
            <Link key={item.id} to={`${cfg.base}/${item.id}`} className="card-slot">
              {cfg.card(item, bookMap)}
            </Link>
          ))}
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

export const ClassesPage = () => (
  <CatalogPage<GameClass>
    cfg={{
      resource: 'classes',
      base: '/classes',
      title: 'Классы',
      sub: 'Пути воинов, магов и плутов — выбери своё призвание',
      emptyIcon: Swords,
      card: classCard,
    }}
  />
)

export const RacesPage = () => (
  <CatalogPage<Race>
    cfg={{
      resource: 'races',
      base: '/races',
      title: 'Расы и Виды',
      sub: 'Народы и существа, населяющие миры мультивселенной',
      emptyIcon: VenetianMask,
      card: raceCard,
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
    }}
  />
)

export const ItemsPage = () => (
  <CatalogPage<Item>
    cfg={{
      resource: 'items',
      base: '/items',
      title: 'Магические Предметы',
      sub: 'Реликвии, артефакты и сокровища подземелий',
      emptyIcon: Gem,
      card: itemCard,
      sorts: itemSorts,
    }}
  />
)
