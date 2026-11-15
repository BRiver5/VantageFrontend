/**
 * Панель быстрых действий: 5 страниц по 10 ячеек на пользователя в комнате.
 *
 * Ячейка — ссылка на действие (атака, заклинание, умение, предмет, лист, статья),
 * а не его копия: по нажатию срабатывает та же кнопка, что в листе или лотке боя.
 * Ключ ссылки — вид, персонаж и имя действия: имена совпадают в листе и в лотке боя.
 */

export const PAGES = 5
export const SLOTS = 10
export const HOTBAR_MIME = 'application/x-vantage-hotbar'

export type SlotKind = 'attack' | 'spell' | 'feature' | 'item' | 'sheet' | 'article'

export interface HotbarSlot {
  kind: SlotKind
  /** имя действия, id предмета, id персонажа или страницы */
  ref: string
  label: string
  character_id?: string | null
  icon?: string | null
}

export type HotbarPages = (HotbarSlot | null)[][]

export const SLOT_KINDS: readonly SlotKind[] = ['attack', 'spell', 'feature', 'item', 'sheet', 'article']

export const KIND_LABEL: Record<SlotKind, string> = {
  attack: 'Атака',
  spell: 'Заклинание',
  feature: 'Умение',
  item: 'Предмет',
  sheet: 'Лист',
  article: 'Статья',
}

export const emptyPages = (): HotbarPages => Array.from({ length: PAGES }, () => Array<HotbarSlot | null>(SLOTS).fill(null))

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null)

/** Проверить ячейку из чужих рук (сервер, перетаскивание): null — не ячейка */
export function parseSlot(raw: unknown): HotbarSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = SLOT_KINDS.find((k) => k === o.kind)
  const ref = str(o.ref, 200)
  const label = str(o.label, 120)
  if (!kind || !ref || !label) return null
  const slot: HotbarSlot = { kind, ref, label }
  const cid = str(o.character_id, 64)
  if (cid) slot.character_id = cid
  const icon = str(o.icon, 2000)
  if (icon) slot.icon = icon
  return slot
}

/** Ровно 5×10, битые ячейки — пустые */
export function normalizePages(raw: unknown): HotbarPages {
  const out = emptyPages()
  if (!Array.isArray(raw)) return out
  raw.slice(0, PAGES).forEach((row, p) => {
    if (!Array.isArray(row)) return
    row.slice(0, SLOTS).forEach((cell, i) => {
      out[p][i] = parseSlot(cell)
    })
  })
  return out
}

const inRange = (page: number, index: number) => page >= 0 && page < PAGES && index >= 0 && index < SLOTS

/** Один ключ для листа, экрана героя и лотка боя */
export const slotKey = (s: Pick<HotbarSlot, 'kind' | 'ref' | 'character_id'>): string => `${s.kind}:${s.character_id ?? ''}:${s.ref}`

/** Положить ссылку в ячейку. Та же ссылка на этой странице переезжает, а не двоится */
export function setSlot(pages: HotbarPages, page: number, index: number, slot: HotbarSlot): HotbarPages {
  if (!inRange(page, index)) return pages
  const key = slotKey(slot)
  return pages.map((row, p) =>
    p !== page ? row : row.map((cell, i) => (i === index ? slot : cell && slotKey(cell) === key ? null : cell)),
  )
}

export function clearSlot(pages: HotbarPages, page: number, index: number): HotbarPages {
  if (!inRange(page, index) || !pages[page][index]) return pages
  return pages.map((row, p) => (p !== page ? row : row.map((cell, i) => (i === index ? null : cell))))
}

/** Поменять две ячейки местами (перетаскивание внутри панели) */
export function swapSlots(pages: HotbarPages, page: number, from: number, to: number): HotbarPages {
  if (!inRange(page, from) || !inRange(page, to) || from === to) return pages
  return pages.map((row, p) => {
    if (p !== page) return row
    const next = [...row]
    const a = next[from]
    next[from] = next[to]
    next[to] = a
    return next
  })
}

/** Ячейка для перетаскивания: из листа, лотка боя или самой панели (откуда — для перестановки) */
export interface DragPayload {
  slot: HotbarSlot
  from?: { page: number; index: number }
}

export const encodeDrag = (p: DragPayload): string => JSON.stringify(p)

export function decodeDrag(text: string | null | undefined): DragPayload | null {
  if (!text) return null
  try {
    const raw = JSON.parse(text) as { slot?: unknown; from?: { page?: unknown; index?: unknown } } | null
    const slot = parseSlot(raw?.slot)
    if (!raw || !slot) return null
    const f = raw.from
    const from = f && typeof f.page === 'number' && typeof f.index === 'number' && inRange(f.page, f.index) ? { page: f.page, index: f.index } : undefined
    return from ? { slot, from } : { slot }
  } catch {
    return null
  }
}

export type SheetTabFor = 'main' | 'magic' | 'features' | 'bag' | 'actions'

/** Какую вкладку листа открыть, чтобы кнопка действия появилась на экране */
export function tabFor(kind: SlotKind, hud: boolean): SheetTabFor | null {
  if (kind === 'spell') return 'magic'
  if (kind === 'feature') return 'features'
  if (kind === 'attack') return hud ? 'actions' : 'main'
  if (kind === 'item') return hud ? 'bag' : 'main'
  return null
}

/** Подпись клавиши ячейки: 1…9, 0 */
export const slotKeyLabel = (index: number): string => String((index + 1) % 10)
