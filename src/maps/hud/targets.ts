/**
 * Цели текущего игрока на карте: только у него в браузере, сервер о них не знает.
 * Хранятся id жетонов; бой получает их как combatant_id (targetCombatants), чтобы
 * лоток атаки или заклинания сразу открылся с выбранными целями.
 */
import { useSyncExternalStore } from 'react'
import type { MapToken, Pt } from '../types'

export interface TargetStore {
  get: () => readonly string[]
  subscribe: (fn: () => void) => () => void
  /** есть — снять, нет — добавить */
  toggle: (id: string) => void
  add: (ids: readonly string[]) => void
  remove: (ids: readonly string[]) => void
  set: (ids: readonly string[]) => void
  clear: () => void
  /** оставить только существующие жетоны (карту сменили, жетон убрали) */
  prune: (alive: readonly string[]) => void
}

export const MAX_TARGETS = 30

export function createTargetStore(): TargetStore {
  let list: readonly string[] = []
  const subs = new Set<() => void>()
  const put = (next: readonly string[]) => {
    const uniq = [...new Set(next)].slice(0, MAX_TARGETS)
    if (uniq.length === list.length && uniq.every((x, i) => x === list[i])) return
    list = uniq
    subs.forEach((fn) => fn())
  }
  return {
    get: () => list,
    subscribe: (fn) => {
      subs.add(fn)
      return () => void subs.delete(fn)
    },
    toggle: (id) => put(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]),
    add: (ids) => put([...list, ...ids]),
    remove: (ids) => put(list.filter((x) => !ids.includes(x))),
    set: (ids) => put(ids),
    clear: () => put([]),
    prune: (alive) => put(list.filter((x) => alive.includes(x))),
  }
}

/** Общие цели на всю вкладку */
export const targetStore = createTargetStore()

/** Отмеченные жетоны; перерисовывает при каждом изменении */
export function useTargets(store: TargetStore = targetStore): readonly string[] {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Цели как участники боя: у жетона без combatant_id цели в бою нет */
export function targetCombatants(tokens: readonly MapToken[], ids: readonly string[]): string[] {
  const byId = new Map(tokens.map((t) => [t.id, t]))
  return ids.map((id) => byId.get(id)?.combatant_id).filter((x): x is string => !!x)
}

/** Жетоны, чей центр внутри прямоугольника a–b (рамка выделения) */
export function tokensInBox(tokens: readonly MapToken[], a: Pt, b: Pt, isDm: boolean): string[] {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return tokens.filter((t) => (isDm || !t.hidden) && t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1).map((t) => t.id)
}
