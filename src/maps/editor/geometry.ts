import { circle, pxPerFt } from '../geometry'
import type { BattleMap, MapWall, MapZone, Pt } from '../types'
import { uid } from './batch'

export function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export const wallOf = (kind: MapWall['kind'], a: Pt, b: Pt): MapWall => ({
  id: uid('w'),
  a,
  b,
  kind,
  height_ft: 10,
  base_ft: 0,
  blocks: { move: kind !== 'window', sight: kind !== 'window', light: kind !== 'window', sound: true },
  ...(kind === 'door' ? { door: { open: false, locked: false, secret: false } } : {}),
})

export const SIZE_CELLS: Record<string, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 }

/** Многоугольник зоны для попадания курсором */
export function zonePoly(z: MapZone, map: BattleMap): Pt[] {
  if (z.shape.kind === 'circle' && z.shape.center) return circle(z.shape.center, (z.shape.radius_ft ?? 10) * pxPerFt(map.grid), 24)
  return z.shape.points ?? []
}
