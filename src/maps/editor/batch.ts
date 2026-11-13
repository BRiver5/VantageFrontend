import type { BattleMap, EditBatch, EditKind } from '../types'
import { KINDS } from './types'

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

/** Разница двух версий карты пакетом конструктора */
export function diffBatch(saved: BattleMap, cur: BattleMap): EditBatch | null {
  const batch: EditBatch = {}
  let any = false
  for (const k of KINDS) {
    const a = new Map(((saved[k] ?? []) as { id: string }[]).map((x) => [x.id, x]))
    const b = new Map(((cur[k] ?? []) as { id: string }[]).map((x) => [x.id, x]))
    const add = [...b.values()].filter((x) => !a.has(x.id))
    const remove = [...a.keys()].filter((id) => !b.has(id))
    const update = [...b.values()].filter((x) => a.has(x.id) && JSON.stringify(a.get(x.id)) !== JSON.stringify(x))
    if (add.length || remove.length || update.length) {
      any = true
      batch[k] = { ...(add.length ? { add } : {}), ...(update.length ? { update } : {}), ...(remove.length ? { remove } : {}) }
    }
  }
  return any ? batch : null
}

/** Наложить пакет на свежую версию (после 409) */
export function applyBatch(fresh: BattleMap, batch: EditBatch): BattleMap {
  const out = { ...fresh } as unknown as Record<EditKind, { id: string }[]>
  for (const k of KINDS) {
    const b = batch[k]
    if (!b) continue
    const rm = new Set(b.remove ?? [])
    const up = new Map(((b.update ?? []) as { id: string }[]).map((x) => [x.id, x]))
    out[k] = [...(out[k] ?? []).filter((x) => !rm.has(x.id)).map((x) => up.get(x.id) ?? x), ...((b.add ?? []) as { id: string }[])]
  }
  return out as unknown as BattleMap
}
