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

/**
 * По оценкам игроков: сначала записи с оценками (байесовское среднее, лучшие сверху; при равенстве —
 * где оценок больше), потом без оценок. Иначе запись с одной низкой оценкой уходила ниже
 * неоценённых: у них «нейтральные» 3 из 5.
 */
export const byRating = (a: unknown, b: unknown) => {
  const ra = (a as { rating?: ShortRating }).rating
  const rb = (b as { rating?: ShortRating }).rating
  const na = ra?.count ?? 0
  const nb = rb?.count ?? 0
  if (!na || !nb) return (nb ? 1 : 0) - (na ? 1 : 0)
  return bayes(rb) - bayes(ra) || nb - na
}

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

/**
 * Параметры адреса каталога для открытой записи (`?open=`) и листа (`?page=`).
 * `undefined` — параметр не трогать (раздел им не пользуется). Возвращает новые
 * параметры или `null`, если адрес и так такой: тогда не навигируем вовсе — холостой
 * replace относительно ещё не обновлённого пути затирает только что открытую запись.
 */
export function catalogSearch(
  current: URLSearchParams,
  want: {
    open?: string | null
    page?: number
    /** фильтры: ключи групп раздела и выбранное (?class=колдун,бард&level=3) */
    filters?: { keys: string[]; sel: Record<string, string[]> }
    /** сортировка: 'none' — по умолчанию, в адрес не пишется */
    sort?: string
    /** строка поиска */
    q?: string
  },
): URLSearchParams | null {
  const next = new URLSearchParams(current)
  if (want.filters) {
    for (const key of want.filters.keys) {
      const vals = want.filters.sel[key] ?? []
      if (vals.length) next.set(key, vals.join(','))
      else next.delete(key)
    }
  }
  if (want.sort !== undefined) {
    if (want.sort && want.sort !== 'none') next.set('sort', want.sort)
    else next.delete('sort')
  }
  if (want.q !== undefined) {
    if (want.q) next.set('q', want.q)
    else next.delete('q')
  }
  if (want.open !== undefined) {
    if (want.open) next.set('open', want.open)
    else next.delete('open')
  }
  if (want.page !== undefined) {
    if (want.page > 0) next.set('page', String(want.page + 1))
    else next.delete('page')
  }
  return next.toString() === current.toString() ? null : next
}

/** Выбранные фильтры из адреса: ?class=колдун,бард → { class: ['колдун', 'бард'] } */
export function filtersFromSearch(search: URLSearchParams, keys: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const key of keys) {
    const vals = search.getAll(key).flatMap((v) => v.split(',')).filter(Boolean)
    if (vals.length) out[key] = vals
  }
  return out
}
