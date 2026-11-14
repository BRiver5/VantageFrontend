/**
 * Кто сейчас умеет выполнить ссылку панели. Кнопки листа, экрана героя и лотка
 * боя регистрируют здесь собственный обработчик клика — панель вызывает именно
 * его, своей логики бросков у неё нет.
 *
 * Если кнопки на экране нет (лист закрыт), панель запоминает ссылку как
 * «ожидающую» и просит открыть место, где кнопка есть: лоток боя или лист.
 * Как только нужная кнопка зарегистрируется, ожидающая ссылка выполняется.
 */
import { slotKey, type HotbarSlot } from './model'

/** Лоток боя важнее листа: в бою действие идёт через сервер боя */
export const PRIORITY = { sheet: 1, tray: 2 } as const

interface Runner {
  id: number
  run: () => void
  priority: number
}

/** Открыть место, где появится кнопка: вернуть true, если взялся */
export type Opener = (slot: HotbarSlot) => boolean

const runners = new Map<string, Runner[]>()
const openers: { id: number; open: Opener; priority: number }[] = []
let nextId = 1
export const PENDING_TTL = 8000
let pending: { key: string; slot: HotbarSlot; at: number } | null = null
const pendingListeners = new Set<(slot: HotbarSlot | null) => void>()

function best(key: string): Runner | null {
  const list = runners.get(key)
  if (!list?.length) return null
  // при равенстве — зарегистрированный позже (открытый последним)
  return list.reduce((a, b) => (b.priority >= a.priority ? b : a))
}

function setPending(slot: HotbarSlot | null) {
  pending = slot ? { key: slotKey(slot), slot, at: Date.now() } : null
  for (const fn of pendingListeners) fn(slot)
}

export function registerRunner(key: string, run: () => void, priority: number = PRIORITY.sheet): () => void {
  const entry: Runner = { id: nextId++, run, priority }
  runners.set(key, [...(runners.get(key) ?? []), entry])
  if (pending && pending.key === key) {
    const fresh = Date.now() - pending.at < PENDING_TTL
    setPending(null)
    // после монтирования: кнопка уже на экране
    if (fresh) queueMicrotask(() => runners.get(key)?.some((r) => r.id === entry.id) && entry.run())
  }
  return () => {
    const left = (runners.get(key) ?? []).filter((r) => r.id !== entry.id)
    if (left.length) runners.set(key, left)
    else runners.delete(key)
  }
}

export function registerOpener(open: Opener, priority = 1): () => void {
  const entry = { id: nextId++, open, priority }
  openers.push(entry)
  return () => {
    const i = openers.findIndex((o) => o.id === entry.id)
    if (i >= 0) openers.splice(i, 1)
  }
}

export const hasRunner = (slot: HotbarSlot): boolean => !!best(slotKey(slot))

export type InvokeResult = 'ran' | 'opened' | 'fallback' | 'none'

/**
 * Выполнить ссылку. `fallback` — последний шанс (открыть лист героя); ссылка при
 * этом ждёт, пока кнопка появится.
 */
export function invokeSlot(slot: HotbarSlot, fallback?: (slot: HotbarSlot) => boolean): InvokeResult {
  const runner = best(slotKey(slot))
  if (runner) {
    runner.run()
    return 'ran'
  }
  setPending(slot)
  for (const o of [...openers].sort((a, b) => b.priority - a.priority)) {
    if (o.open(slot)) return 'opened'
  }
  if (fallback?.(slot)) return 'fallback'
  setPending(null)
  return 'none'
}

/** Ожидающая ссылка: лист героя переключает по ней вкладку */
export function subscribePending(fn: (slot: HotbarSlot | null) => void): () => void {
  pendingListeners.add(fn)
  return () => {
    pendingListeners.delete(fn)
  }
}

export const pendingSlot = (): HotbarSlot | null => (pending && Date.now() - pending.at < PENDING_TTL ? pending.slot : null)

/** Только для тестов */
export function resetRegistry(): void {
  runners.clear()
  openers.length = 0
  pending = null
  pendingListeners.clear()
}
