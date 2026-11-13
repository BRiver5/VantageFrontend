/** Применить событие слоя к списку: upsert заменяет по id, remove убирает */
import type { LayerDelta } from './types'

export function applyDelta<T extends { id: string }>(list: T[], delta: LayerDelta<T>): T[] {
  const drop = new Set([...(delta.remove ?? []), ...(delta.upsert ?? []).map((x) => x.id)])
  if (drop.size === 0) return list
  const kept = list.filter((x) => !drop.has(x.id))
  return [...kept, ...(delta.upsert ?? [])]
}

/** рисунки по порядку: z, затем как пришли */
export const byZ = <T extends { z: number }>(list: T[]): T[] => list.map((x, i) => [x, i] as const).sort((a, b) => a[0].z - b[0].z || a[1] - b[1]).map(([x]) => x)
