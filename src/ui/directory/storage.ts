/**
 * Что помнит директория между заходами: свёрнутые папки и порядок списка.
 * localStorage может не быть (приватный режим, запрет) — тогда просто не помним.
 */
import type { SortMode } from './model'

const key = (listId: string, what: string) => `vantage.dir.${listId}.${what}`

export function loadCollapsed(listId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(listId, 'collapsed'))
    const arr: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveCollapsed(listId: string, ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(key(listId, 'collapsed'), JSON.stringify([...ids]))
  } catch {
    /* не помним — не беда */
  }
}

export function loadSort(listId: string, fallback: SortMode): SortMode {
  try {
    const v = localStorage.getItem(key(listId, 'sort'))
    return v === 'alpha' || v === 'manual' ? v : fallback
  } catch {
    return fallback
  }
}

export function saveSort(listId: string, mode: SortMode): void {
  try {
    localStorage.setItem(key(listId, 'sort'), mode)
  } catch {
    /* не помним — не беда */
  }
}
