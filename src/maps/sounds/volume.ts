/**
 * Громкость звука местности у слушателя: расстояние, затухание к краю,
 * стены с blocks.sound между слушателем и источником, окно темноты карты.
 * Чистые функции — их проверяют тесты.
 */
import type { MapWall, Pt } from '../types'
import type { MapSound } from '../layers/types'

/** темнота карты: 0 — день, 0.5 — сумерки, 1 — тьма */
export function mapDarkness(level: 'bright' | 'dim' | 'dark' | undefined): number {
  return level === 'dark' ? 1 : level === 'dim' ? 0.5 : 0
}

/** доля громкости на расстоянии d при радиусе r (одни единицы) */
export function falloff(d: number, r: number, easing: boolean): number {
  if (!(r > 0) || d >= r) return 0
  if (!easing) return 1
  const k = 1 - Math.max(0, d) / r
  return k * k
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** отрезки ab и cd пересекаются (касание концом тоже считается) */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const on = (p: Pt, q: Pt, r: Pt) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y)
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d))
}

/** стена глушит звук: флаг blocks.sound, открытая дверь — нет */
export const blocksSound = (w: MapWall) => !!w.blocks?.sound && !(w.kind === 'door' && w.door?.open)

/** сколько глушащих стен между точками */
export function wallsBetween(walls: readonly MapWall[], from: Pt, to: Pt): number {
  let n = 0
  for (const w of walls) if (blocksSound(w) && segmentsIntersect(from, to, w.a, w.b)) n++
  return n
}

/** множитель за стены: −70 % за каждую, больше двух — тишина */
export function occlusion(walls: number): number {
  if (walls <= 0) return 1
  if (walls > 2) return 0
  return 0.3 ** walls
}

/** итоговая громкость источника (0..1) у слушателя; ppf — пикселей на фут */
export function emitterVolume(s: MapSound, listener: Pt | null, walls: readonly MapWall[], ppf: number, darkness: number): number {
  if (!listener || !s.enabled) return 0
  if (s.darkness && (darkness < s.darkness.min || darkness > s.darkness.max)) return 0
  const dFt = Math.hypot(listener.x - s.x, listener.y - s.y) / (ppf || 1)
  let v = s.volume * falloff(dFt, s.radius_ft, s.easing)
  if (v <= 0) return 0
  if (s.walls) v *= occlusion(wallsBetween(walls, listener, { x: s.x, y: s.y }))
  return Math.max(0, Math.min(1, v))
}
