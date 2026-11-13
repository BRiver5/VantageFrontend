/** Попадание курсором по холсту: жетоны и двери там же, где их рисуют */
import type { BattleMap, MapToken, Pt } from '../types'

/** жетон под точкой: по нарисованному положению (шаг, чужое перетаскивание), меньший сверху */
export function tokenAt(m: BattleMap, isDm: boolean, pos: Map<string, Pt>, p: Pt): MapToken | null {
  const hits = m.tokens.filter((t) => {
    if (!isDm && t.hidden) return false
    const at = pos.get(t.id) ?? t
    return Math.hypot(at.x - p.x, at.y - p.y) <= (t.size * m.grid.cell_px) / 2
  })
  return hits.sort((a, b) => a.size - b.size)[0] ?? null
}

/** дверь под точкой: как в drawWalls — тайная дверь только у мастера */
export function doorAt(m: BattleMap, isDm: boolean, p: Pt): string | null {
  for (const w of m.walls) {
    if (!(w.kind === 'door' || (w.kind === 'secret' && isDm))) continue
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
    if (Math.hypot(mid.x - p.x, mid.y - p.y) < m.grid.cell_px * 0.4) return w.id
  }
  return null
}
