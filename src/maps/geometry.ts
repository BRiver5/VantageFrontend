/**
 * Геометрия для рисования. Кто попал в область, решает сервер; здесь —
 * мгновенная фигура под пальцем до его ответа и многоугольник видимости
 * для света и теней (лучи к концам стен, ближайшее пересечение).
 */
import { cellCenter, cellOf, cellPolygon, isHex, nearestCorner } from './hex'
import type { MapGrid, MapWall, Pt } from './types'

export { cellCenter, cellOf } from './hex'

export const pxPerFt = (g: MapGrid) => g.cell_px / g.feet_per_cell

/** Центр клетки → точка для пути */
export const pathPoints = (g: MapGrid, path: [number, number][]) => path.map(([c, r]) => cellCenter(g, c, r))
export const snapToCell = (g: MapGrid, p: Pt): Pt => {
  const [c, r] = cellOf(g, p)
  return cellCenter(g, c, r)
}
/** Угол стены — к ближайшему углу клетки (на шестиугольниках — к вершине) */
export const snapToCorner = (g: MapGrid, p: Pt): Pt => nearestCorner(g, p)

const dir = (deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: Math.cos(a), y: Math.sin(a) }
}

export function circle(c: Pt, r: number, n = 40): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
  })
}

function rect(o: Pt, angle: number, len: number, half: number): Pt[] {
  const d = dir(angle)
  const n = { x: -d.y, y: d.x }
  const e = { x: o.x + d.x * len, y: o.y + d.y * len }
  return [
    { x: o.x + n.x * half, y: o.y + n.y * half },
    { x: e.x + n.x * half, y: e.y + n.y * half },
    { x: e.x - n.x * half, y: e.y - n.y * half },
    { x: o.x - n.x * half, y: o.y - n.y * half },
  ]
}

/** Фигура области по PHB 2024 — та же, что считает сервер */
export function areaPolygon(shape: string, origin: Pt, sizePx: number, angle = 0, widthPx = 0, extraPx = 0): Pt[] {
  if (shape === 'cone') {
    const d = dir(angle)
    const n = { x: -d.y, y: d.x }
    const e = { x: origin.x + d.x * sizePx, y: origin.y + d.y * sizePx }
    const h = sizePx / 2
    return [origin, { x: e.x + n.x * h, y: e.y + n.y * h }, { x: e.x - n.x * h, y: e.y - n.y * h }]
  }
  if (shape === 'line' || shape === 'wall') return rect(origin, angle, sizePx, (widthPx || 0) / 2)
  if (shape === 'sphere' || shape === 'cylinder') return circle(origin, sizePx)
  if (shape === 'emanation') return circle(origin, sizePx + extraPx)
  if (shape === 'cube' || shape === 'square') return rect(origin, angle, sizePx, sizePx / 2)
  return circle(origin, sizePx)
}

export const angleTo = (a: Pt, b: Pt) => ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 360
export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

/* ---------- видимость: лучи к концам стен ---------- */

type Seg = [Pt, Pt]

function intersect(o: Pt, d: Pt, [a, b]: Seg): number | null {
  // луч o + t·d, отрезок a + u·(b − a)
  const sx = b.x - a.x
  const sy = b.y - a.y
  const den = d.x * sy - d.y * sx
  if (Math.abs(den) < 1e-9) return null
  const t = ((a.x - o.x) * sy - (a.y - o.y) * sx) / den
  const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den
  return t >= 0 && u >= 0 && u <= 1 ? t : null
}

/** Стены, которые перекрывают свет (или взгляд): закрытые двери да, открытые нет */
export function blockingSegments(walls: MapWall[], what: 'light' | 'sight'): Seg[] {
  return walls
    .filter((w) => w.blocks?.[what] && !(w.kind === 'door' || w.kind === 'secret' ? w.door?.open : false) && w.kind !== 'window')
    .map((w) => [w.a, w.b] as Seg)
}

/**
 * Многоугольник видимости из точки в радиусе r. Лучи к концам отрезков
 * (и ±ε рядом), плюс окружность границы — O(n²) достаточно для сотен стен.
 */
export function visibility(o: Pt, r: number, segs: Seg[]): Pt[] {
  const near = segs.filter(([a, b]) => distToSeg(o, a, b) <= r)
  const ring = circle(o, r, 48)
  const bounds: Seg[] = ring.map((p, i) => [p, ring[(i + 1) % ring.length]])
  const all = [...near, ...bounds]
  const angles = new Set<number>()
  for (const [a, b] of near) for (const p of [a, b]) {
    const ang = Math.atan2(p.y - o.y, p.x - o.x)
    angles.add(ang - 0.0005)
    angles.add(ang)
    angles.add(ang + 0.0005)
  }
  for (let i = 0; i < 48; i++) angles.add((i / 48) * Math.PI * 2 - Math.PI)
  const pts: { a: number; p: Pt }[] = []
  for (const ang of angles) {
    const d = { x: Math.cos(ang), y: Math.sin(ang) }
    let best = r
    for (const s of all) {
      const t = intersect(o, d, s)
      if (t != null && t < best) best = t
    }
    pts.push({ a: ang, p: { x: o.x + d.x * best, y: o.y + d.y * best } })
  }
  return pts.sort((x, y) => x.a - y.a).map((x) => x.p)
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export const pointInPolygon = (p: Pt, poly: Pt[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/* ---------- клетки под областью: как cells_in_area на сервере ---------- */

function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  const den = d1x * d2y - d1y * d2x
  if (Math.abs(den) < 1e-9) return false
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9
}

/** Задевает ли фигура выпуклую клетку (уже сжатую на inset) */
export function polygonTouches(poly: Pt[], cell: Pt[]): boolean {
  if (cell.some((p) => pointInPolygon(p, poly)) || poly.some((p) => pointInPolygon(p, cell))) return true
  for (let i = 0; i < poly.length; i++) {
    for (let j = 0; j < cell.length; j++) if (segmentsCross(poly[i], poly[(i + 1) % poly.length], cell[j], cell[(j + 1) % cell.length])) return true
  }
  return false
}

/**
 * Клетки под фигурой области: touch — задета хоть немного (касание краем
 * не считается), center — центр клетки внутри. Решает сервер; это —
 * подсветка шаблона до его ответа.
 */
export function areaCells(poly: Pt[], g: MapGrid, rule: MapGrid['area_rule'] = 'touch'): [number, number][] {
  if (poly.length < 3) return []
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const [c0, r0] = cellOf(g, { x: Math.min(...xs), y: Math.min(...ys) })
  const [c1, r1] = cellOf(g, { x: Math.max(...xs), y: Math.max(...ys) })
  const pad = isHex(g) ? 1 : 0
  const out: [number, number][] = []
  for (let c = Math.max(0, c0 - pad); c <= Math.min(g.cols - 1, c1 + pad); c++) {
    for (let r = Math.max(0, r0 - pad); r <= Math.min(g.rows - 1, r1 + pad); r++) {
      const hit = rule === 'center' ? pointInPolygon(cellCenter(g, c, r), poly) : polygonTouches(poly, cellPolygon(g, c, r, 0.5))
      if (hit) out.push([c, r])
    }
  }
  return out
}
