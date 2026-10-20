import { isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { markPortraitOpenNames, runShellTransition } from '../portraitTransition'
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Backpack,
  BookMarked,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Eye,
  Feather,
  Flame,
  Footprints,
  Gem,
  Heart,
  Hourglass,
  Landmark,
  Layers,
  Mountain,
  Package,
  Ruler,
  Scale,
  Search,
  Shield,
  Shovel,
  Skull,
  SlidersHorizontal,
  Sparkles,
  Star,
  Swords,
  Tag,
  Target,
  VenetianMask,
  Waves,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  cacheEntity,
  descriptionPreview,
  ellipsizePenultimate,
  fetchAll,
  fetchPage,
  formatCR,
  getBookMap,
  getMetaEnums,
  realImage,
  sizeRu,
  creatureTypeRu,
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
import { ABILITY_KEYS, ABILITY_LABELS } from '../types/character'
import type { AbilityName } from '../types/character'
import { abilitiesFromSkills } from '../skills'
import { categoryIcon, containerKindRu, formatDice, formatWeight } from '../equipment'
import { PriceMark } from '../coins'
import { rarityAdjective } from '../itemRarity'
import { Divider, ParchmentScroll } from '../ornaments'
import { DIE_NUM_IMAGE_URLS, hitDieType } from '../dice/diceAssets'
import { SpellSchoolMark } from '../spellSchools'
import { RichText, TermDesc } from '../terms/terms'
import { EquipmentIconRow } from './StartingEquipment'
import { useEquipmentDrawer } from '../equipmentDrawer'

const PAGE_SIZE = 24

type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * Ждёт, пока навигация React Router РЕАЛЬНО закоммитит новый маршрут.
 * Нужно для кросс-роутовых переходов (подклассы, heroNav у рас): RR коммитит
 * асинхронно, и без ожидания «новый» кадр VT снимается слишком рано.
 * Для path-inline (классы в одной оболочке) не используется — там flushSync(setState).
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

/** Кросс-роутовый морф портрета (расы и т.п., пока не переведены на path-inline). */
export function runHeroMorph(slot: HTMLElement, navigate: () => void): void {
  const doc = document as VTDocument
  if (!doc.startViewTransition) {
    navigate()
    return
  }
  markPortraitOpenNames(slot)
  document.documentElement.dataset.nav = '1'
  const t = doc.startViewTransition(() => {
    navigate()
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

/**
 * Ссылка-карточка с плавным переходом в детальную (View Transitions API).
 * Пока идёт переход именно к ЭТОЙ карточке — вешаем на неё view-transition-name,
 * и браузер морфит её в «герой» детальной страницы (у которого то же имя),
 * а остальные карточки уезжают влево (см. ::view-transition-* в CSS).
 */
/**
 * Карточка-ссылка. Если задан `onOpen` — раскрываем деталь в оболочке
 * (предметы / path-inline классы); href остаётся для средней/ctrl-кнопки.
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
  onOpen?: (slot: HTMLElement) => void
  /** FLIP-переход на отдельную страницу (расы), пока нет path-inline */
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
      onOpen(e.currentTarget)
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
  /**
   * Варианты могут зависеть от книг (список источников) и от самих записей
   * (`items` — полный список раздела ДО фильтрации, чтобы набор кнопок не
   * менялся по мере выбора).
   */
  options: (bookMap: BookMap, items: T[]) => FilterOption[]
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
  /** если задано — список делится на группы по книге-источнику с перегородками */
  groupByBook?: (item: T) => string | null | undefined
  /** раздел шире обычной колонки — сетка и подробный обзор одной ширины */
  wide?: boolean
  /** весь раздел одним листом: тянем список целиком и не показываем пагинатор */
  noPaging?: boolean
  /** FLIP-переход на отдельный route (расы); для классов используйте inlineUrl: 'path' */
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
  /**
   * Как синхронизировать inline-деталь с адресом:
   * - `query` — `?open=id` (предметы);
   * - `path` — `base/:id` в той же оболочке (классы).
   */
  inlineUrl?: 'query' | 'path'
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
  items,
}: {
  groups: FilterGroup<T>[]
  sel: Record<string, string[]>
  onToggle: (groupKey: string, optKey: string) => void
  onReset: () => void
  bookMap: BookMap
  /** полный список раздела — из него берутся варианты вроде «только эти книги» */
  items: T[]
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
            const opts = g.options(bookMap, items)
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

/* ---------- Фильтры предысторий ---------- */

/**
 * Характеристику предыстория напрямую не повышает — её «профиль» задают навыки,
 * которые она даёт (Акробатика → ЛОВ, Выступление → ХАР). По ним и фильтруем.
 */

/** Книги, из которых реально есть записи — иначе меню забито пустыми кодами. */
function usedBookOptions(bookMap: BookMap, bookIds: (string | null | undefined)[]): FilterOption[] {
  const seen = new Set(bookIds.filter((id): id is string => !!id && !!bookMap[id]))
  return [...seen]
    .map((id) => ({
      key: id,
      label: bookMap[id].book_code || bookMap[id].title,
      hint: bookMap[id].title,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}

/* ---------- Фильтры черт ---------- */

const featFilters: FilterGroup<Feat>[] = [
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap, items) => usedBookOptions(bookMap, items.map((f) => f.book_source_id)),
    match: (f, sel) => !!f.book_source_id && sel.includes(f.book_source_id),
  },
  {
    key: 'ability',
    label: 'Характеристики',
    options: () =>
      ABILITY_KEYS.map((a) => ({ key: a, label: ABILITY_LABELS[a].label, hint: ABILITY_LABELS[a].abbr })),
    match: (f, sel) => sel.some((a) => a in (f.increase_ability_scores ?? {})),
  },
  {
    key: 'prereq',
    label: 'Требования',
    options: () => [
      { key: 'yes', label: 'Есть требование' },
      { key: 'no', label: 'Без требований' },
    ],
    match: (f, sel) => sel.includes(f.prerequisite ? 'yes' : 'no'),
  },
]

const backgroundFilters: FilterGroup<Background>[] = [
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap, items) => usedBookOptions(bookMap, items.map((bg) => bg.book_source_id)),
    match: (bg, sel) => !!bg.book_source_id && sel.includes(bg.book_source_id),
  },
  {
    key: 'ability',
    label: 'Характеристики',
    options: () =>
      ABILITY_KEYS.map((a) => ({ key: a, label: ABILITY_LABELS[a].label, hint: ABILITY_LABELS[a].abbr })),
    match: (bg, sel) => {
      const abilities = abilitiesFromSkills(bg.skill_proficiencies)
      return sel.some((a) => abilities.includes(a as AbilityName))
    },
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
          <PriceMark costCopper={selected.cost_copper} />
          <h1 className="book-title gold-text item-title">{selected.item_name}</h1>
          <span className="setting-kicker item-kicker">{selected.item_type ?? 'магический предмет'}</span>
          <div className="card-chips item-chips">
            <SourceBadge book={book} />
            {selected.rarity && <Chip icon={Gem}>{selected.rarity}</Chip>}
            {selected.attunement_required && <Chip icon={Sparkles}>требует настройки</Chip>}
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
              items={items}
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
  imgStyle,
}: {
  src: string | null
  alt: string
  fallback?: LucideIcon
  imgStyle?: CSSProperties
}) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="class-card-portrait">
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" style={imgStyle} onError={() => setBroken(true)} />
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

/** Ряд плашек характеристик, которые повышает черта (аналог EquipmentIconRow у предысторий). */
function FeatAbilityRow({ scores }: { scores: Record<string, number> | null | undefined }) {
  const entries = Object.entries(scores ?? {})
  if (entries.length === 0) return null

  return (
    <div className="fa-row">
      {entries.map(([k, v]) => (
        <span className="fa-tile" key={k}>
          {ABILITY_RU[k] ?? k}
          <b>+{v}</b>
        </span>
      ))}
    </div>
  )
}

function FeatCard({ f, book }: { f: Feat; book: Book | undefined }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(f.image_gallery)
  const preview = descriptionPreview(f.description, 150)

  return (
    <article className="card card--feat">
      <div className="feat-card-art" aria-hidden={!src}>
        {src && !broken ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Sparkles className="feat-card-art-fallback" aria-hidden="true" />
        )}
      </div>
      <div className="feat-card-body">
        <div className="bg-card-head">
          <SoftTitle text={f.feat_name} />
          <SourceBadge book={book} />
        </div>
        {preview && <p className="bg-card-desc">{preview}</p>}
        {f.prerequisite && (
          <div className="card-chips bg-card-skills">
            <Chip icon={Shield}>треб.: {f.prerequisite}</Chip>
          </div>
        )}
        <div className="bg-card-foot">
          <FeatAbilityRow scores={f.increase_ability_scores} />
          <span className="bg-card-go">
            перейти <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  )
}

function featCard(f: Feat, bookMap: BookMap) {
  return (
    <FeatCard
      f={f}
      book={f.book_source_id ? bookMap[f.book_source_id] : undefined}
    />
  )
}

function SoftTitle({ text, className = 'card-name' }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [display, setDisplay] = useState(text)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      const width = el.clientWidth
      if (width <= 0) {
        setDisplay(text)
        return
      }
      if (text.length === 0) {
        setDisplay('')
        return
      }
      // на мобиле заголовок может переноситься — умный эллипсис не нужен
      if (getComputedStyle(el).whiteSpace !== 'nowrap') {
        setDisplay(text)
        return
      }
      // бинарный поиск максимальной длины, при которой строка ещё влезает
      let lo = 4
      let hi = text.length
      let best = ellipsizePenultimate(text, hi)
      const prev = el.textContent
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const candidate = ellipsizePenultimate(text, mid)
        el.textContent = candidate
        if (el.scrollWidth <= width + 1) {
          best = candidate
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      el.textContent = prev
      setDisplay(best)
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  return (
    <h3 className={className} ref={ref} title={text}>
      {display}
    </h3>
  )
}

function BackgroundCard({ bg, book }: { bg: Background; book: Book | undefined }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(bg.image_gallery)
  const preview = descriptionPreview(bg.description, 180)

  return (
    <article className="card card--bg">
      <span className="bg-card-hex" aria-hidden={!src}>
        <span className="bg-card-hex-inner">
          {src && !broken ? (
            <img
              src={src}
              alt={bg.background_name}
              loading="lazy"
              onError={() => setBroken(true)}
            />
          ) : (
            <Landmark className="bg-card-hex-fallback" aria-hidden="true" />
          )}
        </span>
      </span>
      <div className="bg-card-body">
        <div className="bg-card-head">
          <SoftTitle text={bg.background_name} />
          <SourceBadge book={book} />
        </div>
        {preview && <p className="bg-card-desc">{preview}</p>}
        {!!bg.skill_proficiencies?.length && (
          <div className="card-chips bg-card-skills">
            {bg.skill_proficiencies.map((s) => (
              <Chip key={s} icon={Star}>{s}</Chip>
            ))}
          </div>
        )}
        <div className="bg-card-foot">
          <EquipmentIconRow grants={bg.starting_equipment} max={6} />
          <span className="bg-card-go">
            перейти <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  )
}

function backgroundCard(bg: Background, bookMap: BookMap) {
  return (
    <BackgroundCard
      bg={bg}
      book={bg.book_source_id ? bookMap[bg.book_source_id] : undefined}
    />
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

/* ---------- Существа: ступени опасности, базовый тип, передвижение ---------- */

/** Ступени опасности по ПО — цвет свечения карточки и точки в фильтре. */
const DANGER_TIERS: { key: string; label: string; color: string; max: number }[] = [
  { key: 't0', label: 'ПО 0 – 1/2', color: '#9aa3ad', max: 0.5 },
  { key: 't1', label: 'ПО 1 – 4', color: '#3fae5a', max: 4 },
  { key: 't2', label: 'ПО 5 – 10', color: '#d9a53a', max: 10 },
  { key: 't3', label: 'ПО 11 – 16', color: '#e0672c', max: 16 },
  { key: 't4', label: 'ПО 17+', color: '#d23b3b', max: Infinity },
]
function dangerTier(cr: number | null) {
  return cr == null ? null : (DANGER_TIERS.find((t) => cr <= t.max) ?? null)
}

const CREATURE_TYPES = [
  'Аберрация', 'Великан', 'Гуманоид', 'Дракон', 'Зверь', 'Конструкт', 'Монстр',
  'Небожитель', 'Нежить', 'Растение', 'Слизь', 'Фея', 'Элементаль', 'Исчадие',
].sort((a, b) => a.localeCompare(b, 'ru'))

/**
 * Тип в API бывает «Гуманоид (человек», «или Средний Гуманоид (любой расы)» —
 * берём первое слово после возможного «или <размер>» и без уточнения в скобках.
 */
function creatureBaseType(c: Creature): string | null {
  const t = creatureTypeRu(c.creature_type)
  if (!t) return null
  const word = t.replace(/^или\s+\S+\s+/i, '').split(/[\s(]/)[0]
  return word ? cap(word.toLowerCase()) : null
}

const SIZE_KEYS = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']

const MOVE_MODES: { key: string; label: string; icon: LucideIcon; get: (c: Creature) => number | null }[] = [
  { key: 'fly', label: 'Полёт', icon: Feather, get: (c) => c.flight_speed },
  { key: 'swim', label: 'Плавание', icon: Waves, get: (c) => c.swim_speed },
  { key: 'climb', label: 'Лазание', icon: Mountain, get: (c) => c.climb_speed },
  { key: 'burrow', label: 'Копание', icon: Shovel, get: (c) => c.burrow_speed },
]

const creatureFilters: FilterGroup<Creature>[] = [
  {
    key: 'cr',
    label: 'Опасность',
    options: () => DANGER_TIERS.map(({ key, label, color }) => ({ key, label, color })),
    match: (c, sel) => {
      const t = dangerTier(c.challenge_rating)
      return !!t && sel.includes(t.key)
    },
  },
  {
    key: 'type',
    label: 'Тип',
    options: () => CREATURE_TYPES.map((t) => ({ key: t, label: t })),
    match: (c, sel) => {
      const t = creatureBaseType(c)
      return !!t && sel.includes(t)
    },
  },
  {
    key: 'size',
    label: 'Размер',
    options: () => SIZE_KEYS.map((s) => ({ key: s, label: sizeRu(s) ?? s })),
    match: (c, sel) => !!c.size && sel.includes(c.size.trim().toLowerCase()),
  },
  {
    key: 'move',
    label: 'Передвижение',
    options: () => MOVE_MODES.map(({ key, label }) => ({ key, label })),
    match: (c, sel) => sel.some((k) => !!MOVE_MODES.find((m) => m.key === k)?.get(c)),
  },
  {
    key: 'trait',
    label: 'Особое',
    options: () => [{ key: 'legendary', label: 'Легендарные действия' }],
    match: (c, sel) => sel.includes('legendary') && !!c.legendary_actions?.length,
  },
  {
    // именные НПС помечены в API как уникальные (is_unique совпадает с is_npc)
    key: 'npc',
    label: 'Именные НПС',
    options: () => [
      { key: 'hide', label: 'Скрыть' },
      { key: 'only', label: 'Только они' },
    ],
    match: (c, sel) => sel.includes(c.is_unique ? 'only' : 'hide'),
  },
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap) =>
      Object.values(bookMap)
        .map((b) => ({ key: b.id, label: b.book_code || b.title, hint: b.title }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (c, sel) => !!c.book_source_id && sel.includes(c.book_source_id),
  },
]

/**
 * Портрет существа. Вырезанные PNG (наши `/media/`) стоят «в полный рост», как
 * у рас; картинки dnd.su — с фоном, их показываем в окне с мягким краем.
 */
function CreaturePortrait({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  const framed = !!src && !src.includes('/media/')
  return (
    <div className={`class-card-portrait${framed ? ' creature-portrait--framed' : ''}`}>
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Skull className="class-card-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

function creatureCard(c: Creature, bookMap: BookMap) {
  const tier = dangerTier(c.challenge_rating)
  const kind = [sizeRu(c.size), creatureBaseType(c)].filter(Boolean).join(' · ')
  const moves = MOVE_MODES.filter((m) => m.get(c))
  // у летающих/плавающих пешая скорость бывает 0 — показываем лучшую из имеющихся
  const speed = c.speed || (moves.length ? Math.max(...moves.map((m) => m.get(c) ?? 0)) : c.speed)
  const book = c.book_source_id ? bookMap[c.book_source_id] : undefined
  const legendary = !!c.legendary_actions?.length
  return (
    <article
      className="card card--portrait card--race card--creature"
      style={tier ? ({ '--danger': tier.color } as CSSProperties) : undefined}
    >
      <div className="class-card-visual">
        <span className="creature-aura" aria-hidden="true" />
        <span className="creature-cr" title={`Показатель опасности ${formatCR(c.challenge_rating)}`}>
          <span className="creature-cr-inner">
            <b>{formatCR(c.challenge_rating)}</b>
            <i>ПО</i>
          </span>
        </span>
        {(legendary || c.is_unique) && (
          <span className="creature-flags">
            {legendary && (
              <span className="creature-flag" title="Легендарные действия">
                <Crown aria-hidden="true" />
              </span>
            )}
            {c.is_unique && (
              <span className="creature-flag" title="Уникальное существо">
                <Star aria-hidden="true" />
              </span>
            )}
          </span>
        )}
        <CreaturePortrait src={realImage(c.image_gallery) ?? realImage(c.image_url)} alt={c.name} />
      </div>
      <div className="class-card-lower">
        <div className="class-card-glow" aria-hidden="true" />
        <div className="class-card-panel race-card-panel creature-card-panel">
          <div className="creature-kind" title={book?.title}>
            <span>{kind || 'существо'}</span>
          </div>
          <div className="race-rail">
            <RaceRailCell icon={Shield} value={String(c.ac)} label="КД" />
            <RaceRailCell icon={Heart} value={String(c.hp)} label="хиты" />
            <span className="race-rail-cell">
              <span className="creature-moves" aria-hidden="true">
                <Footprints />
                {moves.map(({ key, icon: Icon, label }) => (
                  <Icon key={key} aria-label={label} />
                ))}
              </span>
              <b>{speed != null ? `${speed} фт.` : '—'}</b>
              <i>скорость</i>
            </span>
          </div>
        </div>
        <h3 className="class-card-name-plate">{c.name}</h3>
      </div>
    </article>
  )
}

/** Арт снаряжения в карточке сетки: картинка или иконка категории. */
function EquipmentCardArt({ src, alt, fallback: Icon }: { src: string | null; alt: string; fallback: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="eq-card-art">
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon className="eq-card-fallback" aria-hidden="true" />
      )}
    </span>
  )
}

function equipmentCard(eq: Equipment, bookMap: BookMap) {
  const Icon = categoryIcon(eq.category)
  const weight = formatWeight(eq.weight)
  const w = eq.weapon
  const d = eq.defense
  const ac = d?.armor_class != null ? `КД ${d.armor_class}${d.add_dex_modifier ? ' + ЛОВ' : ''}` : d?.armor_class_formula
  return (
    <article className="card card--equipment">
      <PriceMark cost={eq.cost} costCopper={eq.cost_copper} />
      <EquipmentCardArt src={realImage(eq.equipment_image_gallery)} alt={eq.equipment_name} fallback={Icon} />
      <div className="eq-card-info">
        <h3 className="card-name">{eq.equipment_name}</h3>
        <span className="card-kicker">{eq.subcategory ?? eq.category}</span>
        <div className="card-chips">
          <SourceBadge book={eq.book_source_id ? bookMap[eq.book_source_id] : undefined} />
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
      </div>
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

/** Код книги в углу карточки предмета — ведёт на страницу книги, не раскрывая карточку. */
function ItemSourceLink({ book }: { book: Book | undefined }) {
  const navigate = useNavigate()
  if (!book) return null
  const { ru, en } = splitTitle(book.title)
  const go = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/books/${book.id}`)
  }
  return (
    <span
      className="item-card-source"
      role="link"
      tabIndex={0}
      title={en ? `${ru} — ${en}` : ru}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') go(e)
      }}
    >
      {book.book_code}
      <ArrowUpRight aria-hidden="true" />
    </span>
  )
}

function itemCard(it: Item, bookMap: BookMap, role?: RecRole) {
  const incoming = role === 'incoming'
  const adj = rarityAdjective(it.rarity, it.item_name, it.item_type)
  return (
    <article className="card card--item" data-rarity={rarityKeyOf(it.rarity)}>
      <PriceMark costCopper={it.cost_copper} />
      <ItemSourceLink book={it.item_source ? bookMap[it.item_source] : undefined} />
      <ItemCardArt
        src={realImage(it.item_image_gallery)}
        alt={it.item_name}
        vtName={incoming ? 'incoming-art' : undefined}
      />
      <div
        className="item-card-info"
        style={incoming ? ({ viewTransitionName: 'incoming-info' } as CSSProperties) : undefined}
      >
        <h3 className="card-name">
          {adj && <i className="item-rarity">{adj}</i>}
          {it.item_name}
        </h3>
        {it.item_type && <span className="card-kicker">{it.item_type}</span>}
        {it.attunement_required && (
          <div className="card-chips">
            <Chip icon={Sparkles}>настройка</Chip>
          </div>
        )}
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
  { key: 'ac', label: 'КД', icon: Shield, cmp: (a, b) => a.ac - b.ac },
  { key: 'hp', label: 'Хиты', icon: Heart, cmp: (a, b) => a.hp - b.hp },
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

/** Номер листа из `?page=` (1-based в адресе, 0-based в стейте). */
function pageFromSearch(params: URLSearchParams): number {
  const raw = Number(params.get('page'))
  if (!Number.isFinite(raw) || raw < 1) return 0
  return Math.floor(raw) - 1
}

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
  const [sortKey, setSortKey] = useState('none')
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
