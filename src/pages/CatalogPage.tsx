import { isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDownAZ,
  ArrowLeft,
  Award,
  Backpack,
  BookMarked,
  BookOpen,
  Bookmark,
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
  Layers,
  Package,
  Ruler,
  Scale,
  Search,
  Shield,
  Skull,
  SlidersHorizontal,
  Sparkles,
  Star,
  Swords,
  Tag,
  Target,
  VenetianMask,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  cacheEntity,
  fetchAll,
  fetchPage,
  formatCR,
  getBookMap,
  getMetaEnums,
  realImage,
  sizeRu,
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
import { categoryIcon, containerKindRu, formatCost, formatDice, formatWeight } from '../equipment'
import { Divider, ParchmentScroll } from '../ornaments'
import { DIE_NUM_IMAGE_URLS, hitDieType } from '../dice/diceAssets'
import { SpellSchoolMark } from '../spellSchools'
import { RichText, TermDesc } from '../terms/terms'

const PAGE_SIZE = 24

type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * ПРИНЦИП «портрет летит в деталь» (FLIP через View Transitions API).
 *
 * Одна и та же анимация для рас, классов и любого будущего раздела с крупным
 * портретом. Как это работает и как переиспользовать:
 *
 *  1. У выбранной карточки её портрет (`.class-card-portrait img`) и имя-плашка
 *     (`.class-card-name-plate`) НА ВРЕМЯ перехода получают те же
 *     `view-transition-name`, что и «герой» детальной страницы — `class-hero-img`
 *     и `class-hero-title`. Браузер сам «несёт» их со старого места на новое и
 *     масштабирует → картинка «влетает» на своё место в подробном обзоре.
 *  2. Остальные карточки сетки разлетаются в стороны (имена `fly-l/r-N` по их
 *     стороне экрана; сами кадры описаны в CSS `::view-transition-old(fly-*)`).
 *
 * Чтобы подключить к новому разделу, ничего не меняя здесь: у карточки должны
 * быть `.class-card-portrait img` и `.class-card-name-plate`, а у детальной
 * страницы — элементы со стилями `viewTransitionName: 'class-hero-img'` и
 * `'class-hero-title'` (см. ClassDetailPage / RaceDetailPage). Тайминги морфа —
 * в CSS-блоке `::view-transition-group(class-hero-img)` (index.css).
 *
 * ВАЖНО про тайминг: сам переход заводит React Router (`navigate` ДОЛЖЕН быть
 * вызовом `navigate(to, { viewTransition: true })`). Нельзя оборачивать переход
 * вручную в `document.startViewTransition(() => flushSync(navigate))` — навигация
 * в RR идёт как React-transition, а `flushSync` её синхронно не коммитит, поэтому
 * «новый» снимок иногда берётся ДО отрисовки детали → морф пропадает «через раз».
 * RR же снимает новое состояние уже ПОСЛЕ коммита навигации — морф стабилен.
 */
/**
 * Ждёт, пока навигация React Router РЕАЛЬНО закоммитит новый маршрут.
 *
 * RR (в режиме BrowserRouter) выполняет переход как React-transition, и его
 * НЕ форсирует `flushSync`. Поэтому нельзя писать
 * `startViewTransition(() => flushSync(navigate))` — «новый» кадр снимется до
 * отрисовки детали, и морф пропадёт «через раз». Мы возвращаем из колбэка
 * промис, который резолвится, когда переход случился (`committed()` — предикат,
 * обычно «исходный элемент отсоединён от DOM»), и лишь тогда браузер снимает
 * новый кадр. `+1` кадр в конце — чтобы деталь успела нарисоваться.
 */
export function whenRouteCommitted(committed: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    // ВАЖНО: setTimeout, а не requestAnimationFrame — пока колбэк
    // startViewTransition ждёт промис, rAF заморожен, а таймеры и коммит
    // React-перехода продолжают работать. На rAF тут был бы дедлок.
    const tick = () => {
      if (committed() || performance.now() - t0 > 600) resolve()
      else setTimeout(tick, 16)
    }
    setTimeout(tick, 0)
  })
}

export function runHeroMorph(slot: HTMLElement, navigate: () => void): void {
  const doc = document as VTDocument
  if (!doc.startViewTransition) {
    navigate()
    return
  }
  // РАЗМЕЧАЕМ ДО снимка: выбранной карточке — общие с деталью имена (арт/имя
  // летят на страницу), остальным — имена fly-l/r по их стороне экрана
  const grid = slot.closest('.card-grid')
  const cx = window.innerWidth / 2
  let li = 0
  let ri = 0
  grid?.querySelectorAll<HTMLElement>('.card-slot').forEach((s) => {
    if (s === slot) {
      const img = s.querySelector<HTMLElement>('.class-card-portrait img')
      const nm = s.querySelector<HTMLElement>('.class-card-name-plate')
      // кость хитов за портретом (только у классов) — тоже летит на своё место
      const die = s.querySelector<HTMLElement>('.class-card-die')
      if (img) img.style.viewTransitionName = 'class-hero-img'
      if (nm) nm.style.viewTransitionName = 'class-hero-title'
      if (die) die.style.viewTransitionName = 'class-hero-die'
    } else {
      const r = s.getBoundingClientRect()
      const left = r.left + r.width / 2 < cx
      const n = left ? li++ : ri++
      if (n < 16) s.style.viewTransitionName = `fly-${left ? 'l' : 'r'}-${n}`
    }
  })
  document.documentElement.dataset.nav = '1'
  const t = doc.startViewTransition(() => {
    navigate()
    // ждём коммита: выбранная карточка отсоединится, когда отрисуется деталь
    return whenRouteCommitted(() => !slot.isConnected)
  })
  const done = () => delete document.documentElement.dataset.nav
  t.finished.then(done, done)
}

/**
 * Роли предметов на время перелёта.
 * `incomingId` — предмет, чьи картинка и подпись летят на своё место в «плеере»
 * (он же используется при закрытии — тогда они летят обратно в карточку).
 * `outgoingId` — только при смене предмета: прежний улетает влево и возвращается
 * карточкой справа. При открытии и закрытии его нет.
 */
type SwitchRoles = { incomingId: string; outgoingId: string | null } | null

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

function CardImage({
  src,
  alt,
  fallback: Fallback,
  backdrop,
}: {
  src: string | null
  alt: string
  fallback: LucideIcon
  backdrop?: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="card-img">
      {backdrop}
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Fallback className="card-img-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

/**
 * Ссылка-карточка с плавным переходом в детальную (View Transitions API).
 * Пока идёт переход именно к ЭТОЙ карточке — вешаем на неё view-transition-name,
 * и браузер морфит её в «герой» детальной страницы (у которого то же имя),
 * а остальные карточки уезжают влево (см. ::view-transition-* в CSS).
 */
/**
 * Карточка-ссылка. Если задан `onOpen` (для предметов) — по клику НЕ уходим на
 * отдельную страницу, а раскрываем деталь ПРЯМО на этой странице: выбранная
 * карточка морфится в «героя» предмета (view-transition-name), остальные уезжают
 * влево (см. ::view-transition-* в CSS). href остаётся для средней/ctrl-кнопки.
 */
function CardLink({
  to,
  vtName,
  onOpen,
  heroNav,
  children,
}: {
  to: string
  vtName?: string
  onOpen?: () => void
  /** FLIP-переход на страницу: арт и имя выбранной карточки летят в деталь, а
   *  остальные карточки разлетаются по сторонам (см. CSS ::view-transition-*) */
  heroNav?: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()

  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    // модификаторы/средняя кнопка — обычное открытие ссылки (новая вкладка и т.п.)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    // раскрытие на месте: onOpen сам заводит переход, расставив роли до снимка
    if (onOpen) {
      onOpen()
      return
    }
    const slot = e.currentTarget
    if (heroNav) {
      // единый принцип «портрет летит в деталь» — общий для рас и классов
      runHeroMorph(slot, () => navigate(to))
      return
    }
    // остальные разделы — обычный кросс-фейд, но с ожиданием коммита навигации
    const doc = document as VTDocument
    if (!doc.startViewTransition) {
      navigate(to)
      return
    }
    document.documentElement.dataset.nav = '1'
    const t = doc.startViewTransition(() => {
      navigate(to)
      return whenRouteCommitted(() => !slot.isConnected)
    })
    const done = () => delete document.documentElement.dataset.nav
    t.finished.then(done, done)
  }

  return (
    <Link
      to={to}
      className="card-slot"
      style={vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

/* ---------- Конфигурация раздела ---------- */

interface SortOption<T> {
  key: string
  label: string
  icon: LucideIcon
  cmp: (a: T, b: T, bookMap: BookMap) => number
}

interface FilterOption {
  key: string
  label: string
  /** цвет точки (редкость); без него вариант рисуется без точки */
  color?: string
  /** подсказка при наведении — например, полное название книги за её кодом */
  hint?: string
}

/** Группа фильтров каталога. Внутри группы варианты складываются по ИЛИ, группы — по И. */
interface FilterGroup<T> {
  key: string
  label: string
  /** варианты могут зависеть от книг (например, список источников) */
  options: (bookMap: BookMap) => FilterOption[]
  /** подходит ли запись под выбранные варианты; пустой выбор группа не проверяет */
  match: (item: T, selected: string[], bookMap: BookMap) => boolean
}

interface CatalogConfig<T> {
  resource: string
  /** базовый маршрут детальной страницы записи */
  base: string
  title: string
  sub: string
  emptyIcon: LucideIcon
  /** `role` = 'incoming' у карточки, которую сейчас раскрывают/закрывают */
  card: (item: T, bookMap: BookMap, role?: RecRole) => ReactNode
  /** если задано — под поиском появляется переключатель сортировки */
  sorts?: SortOption<T>[]
  /** если задано — рядом с поиском появляется кнопка «Фильтры» с меню */
  filters?: FilterGroup<T>[]
  /** раздел шире обычной колонки — сетка и подробный обзор одной ширины */
  wide?: boolean
  /** весь раздел одним листом: тянем список целиком и не показываем пагинатор */
  noPaging?: boolean
  /** FLIP-переход: арт/имя карточки летят в деталь, остальные карточки разлетаются */
  heroNav?: boolean
  /** если задано — клик раскрывает деталь ПРЯМО в списке (без ухода на страницу) */
  inlineDetail?: (ctx: {
    selected: T
    items: T[]
    onSelect: (item: T) => void
    onClose: () => void
    bookMap: BookMap
    switching: SwitchRoles
  }) => ReactNode
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
function rarityKeyOf(r: string | null | undefined): string {
  return (r && RARITY_KEY[r.toLowerCase()]) || 'common'
}

const RARITY_FILTERS: { key: string; label: string }[] = [
  { key: 'common', label: 'Обычный' },
  { key: 'uncommon', label: 'Необычный' },
  { key: 'rare', label: 'Редкий' },
  { key: 'very-rare', label: 'Очень редкий' },
  { key: 'legendary', label: 'Легендарный' },
  { key: 'artifact', label: 'Артефакт' },
]

const RARITY_COLOR: Record<string, string> = {
  common: '#b0b6bf',
  uncommon: '#3fae5a',
  rare: '#3b82f6',
  'very-rare': '#a855f7',
  legendary: '#f59e0b',
  artifact: '#de4234',
}

/** Ценовые вилки в золотых; max не включается. */
const PRICE_BANDS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'lt100', label: 'до 100 зм', min: 0, max: 100 },
  { key: '100-1k', label: '100 – 1 000 зм', min: 100, max: 1000 },
  { key: '1k-10k', label: '1 000 – 10 000 зм', min: 1000, max: 10000 },
  { key: 'gt10k', label: 'свыше 10 000 зм', min: 10000, max: Infinity },
]

/** Переключить вариант в выбранных фильтрах (пустая группа выкидывается). */
function toggleIn(sel: Record<string, string[]>, groupKey: string, optKey: string) {
  const cur = sel[groupKey] ?? []
  const next = cur.includes(optKey) ? cur.filter((k) => k !== optKey) : [...cur, optKey]
  const out = { ...sel }
  if (next.length) out[groupKey] = next
  else delete out[groupKey]
  return out
}

/** Кнопка «Фильтры» с выпадающим меню. Одна на каталог и на подробный обзор. */
function FilterMenu<T>({
  groups,
  sel,
  onToggle,
  onReset,
  bookMap,
}: {
  groups: FilterGroup<T>[]
  sel: Record<string, string[]>
  onToggle: (groupKey: string, optKey: string) => void
  onReset: () => void
  bookMap: BookMap
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // закрывается по клику мимо и по Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = Object.values(sel).reduce((n, v) => n + v.length, 0)

  return (
    <div className="quest-filter" ref={ref}>
      <button
        type="button"
        className={`rec-filter-btn quest-filter-btn${open ? ' is-open' : ''}${count ? ' has-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SlidersHorizontal aria-hidden="true" />
        Фильтры
        {count > 0 && <span className="rec-filter-count">{count}</span>}
      </button>

      {open && (
        <div className="quest-filter-panel">
          <div className="rec-filter-panel-head">
            <span>Фильтры</span>
            {count > 0 && (
              <button type="button" className="rec-filter-reset" onClick={onReset}>
                Сбросить всё
              </button>
            )}
          </div>
          {groups.map((g) => {
            const opts = g.options(bookMap)
            if (opts.length === 0) return null
            const s = sel[g.key] ?? []
            return (
              <div className="quest-filter-group" key={g.key}>
                <span className="quest-filter-group-label">{g.label}</span>
                <div className="rec-filters" role="group" aria-label={g.label}>
                  {opts.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`rec-filter${o.color ? '' : ' rec-filter--plain'}${
                        s.includes(o.key) ? ' is-active' : ''
                      }`}
                      style={o.color ? ({ '--rarity-dot': o.color } as CSSProperties) : undefined}
                      title={o.hint}
                      aria-pressed={s.includes(o.key)}
                      onClick={() => onToggle(g.key, o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const itemFilters: FilterGroup<Item>[] = [
  {
    key: 'rarity',
    label: 'Редкость',
    options: () => RARITY_FILTERS.map((f) => ({ ...f, color: RARITY_COLOR[f.key] })),
    match: (it, sel) => sel.includes(rarityKeyOf(it.rarity)),
  },
  {
    key: 'attunement',
    label: 'Настройка',
    options: () => [
      { key: 'yes', label: 'Требует настройки' },
      { key: 'no', label: 'Без настройки' },
    ],
    match: (it, sel) => sel.includes(it.attunement_required ? 'yes' : 'no'),
  },
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap) =>
      Object.values(bookMap)
        .map((b) => ({ key: b.id, label: b.book_code || b.title, hint: b.title }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (it, sel) => !!it.item_source && sel.includes(it.item_source),
  },
  {
    key: 'price',
    label: 'Цена',
    options: () => PRICE_BANDS.map(({ key, label }) => ({ key, label })),
    match: (it, sel) => {
      const gp = it.cost_copper ? it.cost_copper / 100 : 0
      return sel.some((k) => {
        const band = PRICE_BANDS.find((x) => x.key === k)
        return !!band && gp >= band.min && gp < band.max
      })
    },
  },
]

/* ---------- Фильтры заклинаний ---------- */

const CLASS_NAMES = [
  'бард', 'варвар', 'воин', 'волшебник', 'друид', 'жрец', 'изобретатель',
  'колдун', 'монах', 'паладин', 'плут', 'следопыт', 'чародей',
]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const spellFilters: FilterGroup<Spell>[] = [
  {
    // Значения группы складываются по ИЛИ. Обычное значение — класс (точное
    // совпадение с available_classes). Значение вида `sub:<имя>` — подкласс
    // (вхождение в available_subclasses). Поэтому кнопка со страницы подкласса
    // передаёт И класс, И `sub:подкласс` — получается «спеллы класса ∪ подкласса».
    key: 'class',
    label: 'Класс',
    options: () => CLASS_NAMES.map((n) => ({ key: n, label: cap(n) })),
    match: (sp, sel) =>
      sel.some((s) =>
        s.startsWith('sub:')
          ? !!sp.available_subclasses?.some((x) => x.toLowerCase().includes(s.slice(4).toLowerCase()))
          : !!sp.available_classes?.some((c) => c.toLowerCase().trim() === s.toLowerCase()),
      ),
  },
  {
    key: 'level',
    label: 'Круг',
    options: () =>
      Array.from({ length: 10 }, (_, i) => ({ key: String(i), label: i === 0 ? 'Заговор' : `${i} круг` })),
    match: (sp, sel) => sel.includes(String(sp.spell_level)),
  },
]

/** Роль карточки на время перелёта. */
type RecRole = 'incoming' | 'returning' | undefined

/**
 * Одна карточка в правой ленте рекомендаций (с картинкой предмета).
 *
 * Имена view-transition зависят от роли, и это главное в анимации переключения:
 * - `incoming` — предмет, который выбрали: картинка и блок с названием получают
 *   ОБЩИЕ с «плеером» имена, поэтому летят к нему отдельными объектами, а рамка
 *   карточки остаётся безымянной и просто тает;
 * - `returning` — предмет, который был открыт: имя есть ТОЛЬКО в новом кадре,
 *   поэтому браузер не тянет его из «плеера», а даёт въехать справа из-за края;
 * - без роли — обычный морф на новое место (лента раздвигается).
 */
function RecCard({ item, onSelect, role }: { item: Item; onSelect: (item: Item) => void; role?: RecRole }) {
  const [broken, setBroken] = useState(false)
  const image = realImage(item.item_image_gallery)
  const cardName =
    role === 'incoming' ? undefined : role === 'returning' ? 'returning-card' : `card-${item.id}`
  const vt = (name: string | undefined) =>
    name ? ({ viewTransitionName: name } as CSSProperties) : undefined
  return (
    <button
      type="button"
      className="rec-card"
      data-rarity={rarityKeyOf(item.rarity)}
      style={vt(cardName)}
      onClick={() => onSelect(item)}
    >
      <span className="rec-thumb" style={vt(role === 'incoming' ? 'incoming-art' : undefined)}>
        <span className="rec-thumb-glow" aria-hidden="true" />
        {image && !broken ? (
          <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <Gem aria-hidden="true" />
        )}
      </span>
      <span className="rec-info" style={vt(role === 'incoming' ? 'incoming-info' : undefined)}>
        <span className="rec-name">{item.item_name}</span>
        <span className="rec-type">{item.item_type ?? 'магический предмет'}</span>
        {item.rarity && <span className="rec-rarity">{item.rarity}</span>}
      </span>
    </button>
  )
}

/**
 * Раскрытый предмет в стиле YouTube: слева — крупный «просматриваемый» предмет,
 * его характеристики, сворачиваемое описание и заглушки оценок/комментариев;
 * справа — длинная лента рекомендаций (остальные предметы карточками с картинками).
 */
function ItemSplitView({
  selected,
  items,
  onSelect,
  onClose,
  bookMap,
  switching,
}: {
  selected: Item
  items: Item[]
  onSelect: (item: Item) => void
  onClose: () => void
  bookMap: BookMap
  switching: SwitchRoles
}) {
  const [broken, setBroken] = useState(false)
  const [recQ, setRecQ] = useState('')
  // те же фильтры, что и в каталоге: ключ группы → выбранные варианты
  const [recSel, setRecSel] = useState<Record<string, string[]>>({})
  // при смене предмета сбрасываем статус картинки
  useEffect(() => {
    setBroken(false)
  }, [selected.id])

  // выбранный предмет ушёл в «плеер» слева — в ленте справа его нет,
  // остальные поднимаются, занимая место (FLIP через view-transition)
  const rest = items.filter((it) => it.id !== selected.id)
  const query = recQ.trim().toLowerCase()
  const shown = rest
    .filter((it) => {
      if (query && !it.item_name.toLowerCase().includes(query)) return false
      // группы по И, варианты внутри группы по ИЛИ — как в каталоге
      return itemFilters.every((g) => {
        const s = recSel[g.key]
        return !s || s.length === 0 || g.match(it, s, bookMap)
      })
    })
    // лента показывает не больше 10 предметов
    .slice(0, 10)
  const gp = selected.cost_copper ? Math.round(selected.cost_copper / 100) : null
  const rarity = rarityKeyOf(selected.rarity)
  const image = realImage(selected.item_image_gallery)
  const book = selected.item_source ? bookMap[selected.item_source] : undefined

  // На время перелёта «плеер» разбирается на части: картинка и заголовок живут
  // своей жизнью (летят / улетают), поэтому общее имя героя снимается.
  const incoming = switching?.incomingId === selected.id
  const heroName = switching ? undefined : `card-${selected.id}`
  const artName = switching ? (incoming ? 'incoming-art' : 'outgoing-art') : undefined
  const infoName = switching ? (incoming ? 'incoming-info' : 'outgoing-info') : undefined
  const vt = (name: string | undefined) =>
    name ? ({ viewTransitionName: name } as CSSProperties) : undefined
  const roleOf = (id: string): RecRole => {
    if (!switching) return undefined
    if (switching.incomingId === id) return 'incoming'
    if (switching.outgoingId === id) return 'returning'
    return undefined
  }

  return (
    <div className="item-tube">
      <div className="item-tube-main">
        <button type="button" className="back-link back-link--btn item-tube-back" onClick={onClose}>
          <ArrowLeft aria-hidden="true" /> к сокровищнице
        </button>

        {/* «плеер» — крупный предмет по центру */}
        <div className="item-hero item-tube-player" data-rarity={rarity} style={vt(heroName)}>
          <div className="item-art" style={vt(artName)}>
            <span className="item-glow" aria-hidden="true" />
            {image && !broken ? (
              <img src={image} alt={selected.item_name} onError={() => setBroken(true)} />
            ) : (
              <Gem className="item-art-fallback" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* заголовок и характеристики — под «плеером», слева */}
        <div className="item-tube-head" style={vt(infoName)}>
          <h1 className="book-title gold-text item-title">{selected.item_name}</h1>
          <span className="setting-kicker item-kicker">{selected.item_type ?? 'магический предмет'}</span>
          <div className="card-chips item-chips">
            <SourceBadge book={book} />
            {selected.rarity && <Chip icon={Gem}>{selected.rarity}</Chip>}
            {selected.attunement_required && <Chip icon={Sparkles}>требует настройки</Chip>}
            {gp != null && gp > 0 && <Chip icon={Coins}>{gp.toLocaleString('ru')} зм</Chip>}
            {selected.weight != null && selected.weight > 0 && <Chip icon={Scale}>{selected.weight} фнт.</Chip>}
          </div>
        </div>

        {selected.description?.trim() ? (
          <ParchmentScroll key={selected.id} className="item-tube-scroll" title="Манускрипт · описание">
            <RichText text={selected.description} />
          </ParchmentScroll>
        ) : null}

        {/* оценка (5 звёзд) и избранное — под описанием */}
        <div className="tube-actions">
          <div className="tube-rate" aria-label="Оценка предмета">
            <span className="tube-stars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} />
              ))}
            </span>
            <span className="tube-rate-label">Оцените</span>
            <span className="soon-badge">скоро</span>
          </div>
          <button type="button" className="tube-act-btn" disabled>
            <Bookmark aria-hidden="true" /> В коллекцию
          </button>
        </div>

        {/* заглушка обсуждения */}
        <div className="tube-comments">
          <h2 className="detail-subtitle gold-text">Обсуждение</h2>
          <div className="tube-comment-input">
            <span className="tube-avatar" aria-hidden="true">GG</span>
            <input type="text" placeholder="Оставить комментарий…" readOnly />
            <span className="soon-badge">скоро</span>
          </div>
        </div>
      </div>

      {/* длинная лента рекомендаций справа + поиск и фильтры */}
      <aside className="item-tube-recs" aria-label="Другие предметы">
        <div className="rec-head">
          <div className="rec-tools">
            <label className="rec-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                placeholder="Искать предмет…"
                value={recQ}
                onChange={(e) => setRecQ(e.target.value)}
              />
              {recQ && (
                <button
                  type="button"
                  className="rec-search-clear"
                  onClick={() => setRecQ('')}
                  aria-label="Очистить поиск"
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
            <FilterMenu
              groups={itemFilters}
              sel={recSel}
              onToggle={(gk, ok) => setRecSel((cur) => toggleIn(cur, gk, ok))}
              onReset={() => setRecSel({})}
              bookMap={bookMap}
            />
          </div>
        </div>
        <div className="rec-list">
          {shown.length > 0 ? (
            shown.map((it) => <RecCard key={it.id} item={it} onSelect={onSelect} role={roleOf(it.id)} />)
          ) : (
            <p className="rec-empty">Ничего не найдено на этой странице.</p>
          )}
        </div>
      </aside>
    </div>
  )
}

function ClassCardPortrait({
  src,
  alt,
  fallback: Fallback = Swords,
}: {
  src: string | null
  alt: string
  fallback?: LucideIcon
}) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="class-card-portrait">
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Fallback className="class-card-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

/** Основная характеристика класса (в API нет — каноничные данные PHB). */
const CLASS_PRIMARY_ABILITY: Record<string, string> = {
  Бард: 'Харизма',
  Варвар: 'Сила',
  Воин: 'Сила или Ловкость',
  Волшебник: 'Интеллект',
  Друид: 'Мудрость',
  Жрец: 'Мудрость',
  Изобретатель: 'Интеллект',
  Колдун: 'Харизма',
  Монах: 'Ловкость и Мудрость',
  Паладин: 'Сила и Харизма',
  Плут: 'Ловкость',
  Следопыт: 'Ловкость и Мудрость',
  Чародей: 'Харизма',
}

function ClassCardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ccs-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function classCard(c: GameClass) {
  const dieType = hitDieType(c.hit_dice)
  return (
    <article className="card card--portrait card--class">
      <div className="class-card-visual">
        <img
          className="class-card-die"
          src={DIE_NUM_IMAGE_URLS[dieType]}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <ClassCardPortrait src={realImage(c.image_gallery)} alt={c.class_name} />
      </div>
      <div className="class-card-lower">
        <div className="class-card-glow" aria-hidden="true" />
        <div className="class-card-panel">
          <dl className="class-card-stats">
            <ClassCardStat label="Кость хитов" value={`к${c.hit_dice}`} />
            {CLASS_PRIMARY_ABILITY[c.class_name] && (
              <ClassCardStat label="Основные характеристики" value={CLASS_PRIMARY_ABILITY[c.class_name]} />
            )}
            <ClassCardStat
              label="Спасброски"
              value={c.saving_throw_proficiencies?.join(', ') || '—'}
            />
          </dl>
        </div>
        <h3 className="class-card-name-plate">{c.class_name}</h3>
      </div>
    </article>
  )
}

/** Одна ячейка нижней «рейки» карточки расы: иконка, значение, подпись. */
function RaceRailCell({ icon: Icon, value, label }: { icon: LucideIcon; value: string | null; label: string }) {
  return (
    <span className="race-rail-cell" data-off={value ? undefined : ''}>
      <Icon aria-hidden="true" />
      <b>{value ?? '—'}</b>
      <i>{label}</i>
    </span>
  )
}

function raceCard(r: Race) {
  const boosts = Object.entries(r.increase_ability_scores ?? {})
  return (
    <article className="card card--portrait card--race">
      <div className="class-card-visual">
        <ClassCardPortrait src={realImage(r.image_gallery)} alt={r.race_name} fallback={VenetianMask} />
      </div>
      <div className="class-card-lower">
        <div className="class-card-glow" aria-hidden="true" />
        <div className="class-card-panel race-card-panel">
          {boosts.length > 0 && (
            <div className="race-boosts">
              {boosts.map(([k, v]) => (
                <span className="race-boost" key={k}>
                  {ABILITY_RU[k] ?? k}
                  <i>+{v}</i>
                </span>
              ))}
            </div>
          )}
          <div className="race-rail">
            <RaceRailCell icon={Ruler} value={sizeRu(r.size)} label="размер" />
            <RaceRailCell icon={Footprints} value={`${r.speed} фт.`} label="скорость" />
            <RaceRailCell icon={Eye} value={r.darkvision > 0 ? `${r.darkvision} фт.` : null} label="тьма" />
          </div>
        </div>
        <h3 className="class-card-name-plate">{r.race_name}</h3>
      </div>
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
      <TermDesc text={f.description} />
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
      <TermDesc text={bg.description} />
    </article>
  )
}

function spellCard(s: Spell, bookMap: BookMap) {
  return (
    <article className="card card--compact card--spell">
      <SpellSchoolMark school={s.school} />
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
      <TermDesc text={s.description} />
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
      <TermDesc text={c.description ?? c.creature_description} />
    </article>
  )
}

function equipmentCard(eq: Equipment, bookMap: BookMap) {
  const Icon = categoryIcon(eq.category)
  const cost = formatCost(eq.cost, eq.cost_copper)
  const weight = formatWeight(eq.weight)
  const w = eq.weapon
  const d = eq.defense
  const ac = d?.armor_class != null ? `КД ${d.armor_class}${d.add_dex_modifier ? ' + ЛОВ' : ''}` : d?.armor_class_formula
  return (
    <article className="card card--compact card--equipment">
      <div className="card-head">
        <span className="eq-card-icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h3 className="card-name">{eq.equipment_name}</h3>
          <span className="card-kicker">{eq.subcategory ?? eq.category}</span>
        </div>
      </div>
      <div className="card-chips">
        <SourceBadge book={eq.book_source_id ? bookMap[eq.book_source_id] : undefined} />
        {cost && <Chip icon={Coins}>{cost}</Chip>}
        {weight && <Chip icon={Scale}>{weight}</Chip>}
        {w?.damage_dice && (
          <Chip icon={Swords}>
            {formatDice(w.damage_dice)}
            {w.damage_type ? ` ${w.damage_type.toLowerCase()}` : ''}
          </Chip>
        )}
        {ac && <Chip icon={Shield}>{ac}</Chip>}
        {eq.container && <Chip icon={Backpack}>{containerKindRu(eq.container.container_kind)}</Chip>}
        {eq.stackable && <Chip icon={Layers}>стак {eq.stack_size}</Chip>}
        {eq.bundle_size != null && eq.bundle_size > 1 && <Chip icon={Package}>пачка {eq.bundle_size}</Chip>}
        {eq.tags.slice(0, 2).map((t) => (
          <Chip key={t} icon={Tag}>
            {t}
          </Chip>
        ))}
      </div>
      <TermDesc text={eq.description} />
    </article>
  )
}

function terminCard(t: Termin, bookMap: BookMap) {
  return (
    <article className="card card--compact">
      <h3 className="card-name">{t.name}</h3>
      <div className="card-chips">
        <SourceBadge book={t.book_source_id ? bookMap[t.book_source_id] : undefined} />
      </div>
      <TermDesc text={t.description} />
    </article>
  )
}

/** Арт предмета в карточке сетки: прозрачная картинка со свечением редкости за ней. */
function ItemCardArt({ src, alt, vtName }: { src: string | null; alt: string; vtName?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span
      className="item-card-art"
      style={vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined}
    >
      <span className="item-card-glow" aria-hidden="true" />
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Gem className="item-card-fallback" aria-hidden="true" />
      )}
    </span>
  )
}

function itemCard(it: Item, bookMap: BookMap, role?: RecRole) {
  const gp = it.cost_copper ? Math.round(it.cost_copper / 100) : null
  const rarityKey = it.rarity ? RARITY_KEY[it.rarity.toLowerCase()] : undefined
  const incoming = role === 'incoming'
  return (
    <article className="card card--item" data-rarity={rarityKeyOf(it.rarity)}>
      <ItemCardArt
        src={realImage(it.item_image_gallery)}
        alt={it.item_name}
        vtName={incoming ? 'incoming-art' : undefined}
      />
      <div
        className="item-card-info"
        style={incoming ? ({ viewTransitionName: 'incoming-info' } as CSSProperties) : undefined}
      >
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
      </div>
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

/** Записи без цены/веса уходят в конец, а не выдают себя за самые дешёвые. */
function numCmp(a: number | null, b: number | null): number {
  return (a ?? Infinity) - (b ?? Infinity)
}

const equipmentSorts: SortOption<Equipment>[] = [
  {
    key: 'name',
    label: 'А — Я',
    icon: ArrowDownAZ,
    cmp: (a, b) => a.equipment_name.localeCompare(b.equipment_name, 'ru'),
  },
  { key: 'cost', label: 'Цена', icon: Coins, cmp: (a, b) => numCmp(a.cost_copper, b.cost_copper) },
  { key: 'weight', label: 'Вес', icon: Scale, cmp: (a, b) => numCmp(a.weight, b.weight) },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.book_source_id, b.book_source_id, bm) },
]

/**
 * Варианты фильтров снаряжения берём из `/api/meta/enums`, а не из хардкода;
 * пока справочники не загрузились (или бэкенд без роутера meta) — остаётся
 * только фильтр по книгам. Ключи групп совпадают с `entryCatalogQuery`, чтобы
 * ссылка «выбрать» со страницы класса открывала каталог уже отфильтрованным.
 */
function equipmentFilters(enums: MetaEnums | null): FilterGroup<Equipment>[] {
  const plain = (values: string[]) => () => values.map((v) => ({ key: v, label: v }))
  const groups: FilterGroup<Equipment>[] = []

  if (enums) {
    groups.push(
      {
        key: 'category',
        label: 'Категория',
        options: plain(enums.equipment_categories),
        match: (eq, sel) => sel.includes(eq.category),
      },
      {
        key: 'weapon_kind',
        label: 'Вид оружия',
        options: plain(enums.weapon_kinds),
        match: (eq, sel) => !!eq.weapon?.weapon_kind && sel.includes(eq.weapon.weapon_kind),
      },
      {
        key: 'attack_kind',
        label: 'Тип атаки',
        options: plain(enums.weapon_attack_kinds),
        match: (eq, sel) => !!eq.weapon?.attack_kind && sel.includes(eq.weapon.attack_kind),
      },
      {
        key: 'armor_kind',
        label: 'Вид доспеха',
        options: plain(enums.armor_kinds),
        match: (eq, sel) => !!eq.defense?.armor_kind && sel.includes(eq.defense.armor_kind),
      },
      {
        key: 'container_kind',
        label: 'Контейнер',
        options: () => enums.container_kinds.map((k) => ({ key: k, label: cap(containerKindRu(k)) })),
        match: (eq, sel) => !!eq.container && sel.includes(eq.container.container_kind),
      },
      {
        key: 'tag',
        label: 'Метки',
        options: plain(enums.equipment_tags),
        match: (eq, sel) => eq.tags.some((t) => sel.includes(t)),
      },
    )
  }

  groups.push({
    key: 'book',
    label: 'Книга',
    options: (bookMap) =>
      Object.values(bookMap)
        .map((b) => ({ key: b.id, label: b.book_code || b.title, hint: b.title }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (eq, sel) => !!eq.book_source_id && sel.includes(eq.book_source_id),
  })

  return groups
}

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
  // выбранные фильтры: ключ группы → выбранные варианты (можно несколько)
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookMap, setBookMap] = useState<BookMap>({})
  const bookMapRef = useRef<BookMap>({})
  // раскрытая деталь прямо в списке (для предметов), без ухода на страницу
  const [selected, setSelected] = useState<T | null>(null)
  // роли на время перелёта карточки: кто прилетает, кто улетает
  const [switching, setSwitching] = useState<SwitchRoles>(null)
  // открытый предмет сохраняем в адресе (?open=id) — переживает перезагрузку
  const [searchParams, setSearchParams] = useSearchParams()
  const initialOpenRef = useRef(searchParams.get('open'))

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
    if (Object.keys(next).length) setFilterSel(next)
  }, [cfg.filters, searchParams])

  const withVT = (fn: () => void) => {
    const doc = document as VTDocument
    if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn))
    else fn()
  }

  /**
   * Переключение на ДРУГОЙ предмет — особая хореография (см. CSS `tube-fly-left`):
   * картинка входящего летит отдельным объектом и растёт на место большой,
   * его название с тегами уезжает вниз в заголовок, а прежний предмет улетает
   * влево за край и возвращается карточкой справа. Чтобы браузер снял «старый»
   * снимок уже с нужными именами, помечаем роли ДО startViewTransition.
   */
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

  // Открытие, переключение и закрытие — одна хореография: картинка и блок с
  // названием летят на свои места как отдельные объекты (общие имена
  // incoming-art / incoming-info), рамка карточки остаётся безымянной и тает.
  const selectItem = (item: T) => {
    if (!cfg.inlineDetail) {
      withVT(() => setSelected(item))
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
    runVT({ incomingId: selected.id, outgoingId: null }, () => setSelected(null))
  }

  // восстановление открытого предмета из адреса, когда список подгрузился
  useEffect(() => {
    if (!cfg.inlineDetail || selected) return
    const openId = initialOpenRef.current
    if (!openId) return
    const found = items.find((it) => it.id === openId)
    if (found) {
      initialOpenRef.current = null
      setSelected(found)
    }
  }, [items, cfg.inlineDetail, selected])

  // выбранный предмет ⇄ адрес (?open=id); ждём восстановления, чтобы не стереть его
  useEffect(() => {
    if (!cfg.inlineDetail) return
    if (initialOpenRef.current && !selected) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (selected) next.set('open', selected.id)
        else next.delete('open')
        return next
      },
      { replace: true },
    )
  }, [selected, cfg.inlineDetail, setSearchParams])

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

  // смена фильтров возвращает на первую страницу
  useEffect(() => {
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

  // раскрытая деталь прямо на этой странице (предметы) — деталь слева, список справа
  if (cfg.inlineDetail && selected) {
    return (
      <section className={`catalog${cfg.wide ? ' catalog--wide' : ''}`}>
        {cfg.inlineDetail({ selected, items, onSelect: selectItem, onClose: closeSelected, bookMap, switching })}
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
          />
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
            <CardLink
              key={item.id}
              to={`${cfg.base}/${item.id}`}
              // у выбранной карточки рамка безымянная: летят только её картинка
              // и подпись (внутри), а рамка просто тает
              vtName={
                cfg.inlineDetail && switching?.incomingId !== item.id ? `card-${item.id}` : undefined
              }
              onOpen={cfg.inlineDetail ? () => selectItem(item) : undefined}
              heroNav={cfg.heroNav}
            >
              {cfg.card(item, bookMap, switching?.incomingId === item.id ? 'incoming' : undefined)}
            </CardLink>
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
      heroNav: true,
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
      inlineDetail: (ctx) => <ItemSplitView {...ctx} />,
    }}
  />
)
