import { bayes, type ShortRating } from '../../reviews/api'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type {
  BookMap,
} from '../../api'
import type { RecRole } from './ItemSplitView'

export const PAGE_SIZE = 24

/**
 * Роли предметов на время перелёта.
 * `incomingId` — предмет, чьи картинка и подпись летят на своё место в «плеере»
 * (он же используется при закрытии — тогда они летят обратно в карточку).
 * `outgoingId` — только при смене предмета: прежний улетает влево и возвращается
 * карточкой справа. При открытии и закрытии его нет.
 */
export type SwitchRoles = { incomingId: string; outgoingId: string | null } | null

/* ---------- Конфигурация раздела ---------- */

export interface SortOption<T> {
  key: string
  label: string
  icon: LucideIcon
  cmp: (a: T, b: T, bookMap: BookMap) => number
}

export interface FilterOption {
  key: string
  label: string
  /** цвет точки (редкость); без него вариант рисуется без точки */
  color?: string
  /** подсказка при наведении — например, полное название книги за её кодом */
  hint?: string
}

/** Группа фильтров каталога. Внутри группы варианты складываются по ИЛИ, группы — по И. */
export interface FilterGroup<T> {
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

export interface CatalogConfig<T> {
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
  /** сортировка, с которой раздел открывается на телефоне */
  mobileDefaultSort?: string
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
export function bookCmp(idA: string | null | undefined, idB: string | null | undefined, bookMap: BookMap): number {
  const ca = (idA && bookMap[idA]?.book_code) || ''
  const cb = (idB && bookMap[idB]?.book_code) || ''
  if (!ca && !cb) return 0
  if (!ca) return 1
  if (!cb) return -1
  return ca.localeCompare(cb, 'ru')
}

/** Переключить вариант в выбранных фильтрах (пустая группа выкидывается). */
export function toggleIn(sel: Record<string, string[]>, groupKey: string, optKey: string) {
  const cur = sel[groupKey] ?? []
  const next = cur.includes(optKey) ? cur.filter((k) => k !== optKey) : [...cur, optKey]
  const out = { ...sel }
  if (next.length) out[groupKey] = next
  else delete out[groupKey]
  return out
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* ---------- Наборы сортировок ---------- */

/** По оценкам игроков: байесовское среднее, лучшие сверху (как ?sort=rating на сервере) */
export const byRating = (a: unknown, b: unknown) => bayes((b as { rating?: ShortRating }).rating) - bayes((a as { rating?: ShortRating }).rating)

/** Записи без цены/веса уходят в конец, а не выдают себя за самые дешёвые. */
export function numCmp(a: number | null, b: number | null): number {
  return (a ?? Infinity) - (b ?? Infinity)
}

/* ---------- Сама страница ---------- */

/** Номер листа из `?page=` (1-based в адресе, 0-based в стейте). */
export function pageFromSearch(params: URLSearchParams): number {
  const raw = Number(params.get('page'))
  if (!Number.isFinite(raw) || raw < 1) return 0
  return Math.floor(raw) - 1
}
