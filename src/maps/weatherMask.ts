/**
 * Где погоды нет: внутри слоёв-крыш (видна крыша или спрятана — под ней
 * сухо) и в зонах «без погоды» (no_weather), включая спрятанные от игрока
 * (weather_masks). Маска строится раз на карту, проверка точки — без
 * выделений памяти: рамка, потом точная фигура.
 */
import { pxPerFt } from './geometry'
import type { BattleMap, MapZone } from './types'

interface RectMask {
  cx: number
  cy: number
  hw: number
  hh: number
  cos: number
  sin: number
}
interface PolyMask {
  pts: Float64Array
  minX: number
  minY: number
  maxX: number
  maxY: number
}
interface CircleMask {
  x: number
  y: number
  r2: number
}

export interface WeatherMasks {
  rects: RectMask[]
  polys: PolyMask[]
  circles: CircleMask[]
  /** клетки: col * CELL_K + row */
  cells: Set<number>
  cellPx: number
  ox: number
  oy: number
  empty: boolean
}

const CELL_K = 100000

function addShape(out: WeatherMasks, shape: MapZone['shape'], map: BattleMap) {
  const ppf = pxPerFt(map.grid)
  if (shape.kind === 'polygon' && shape.points && shape.points.length > 2) {
    const pts = new Float64Array(shape.points.length * 2)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    shape.points.forEach((p, i) => {
      pts[i * 2] = p.x
      pts[i * 2 + 1] = p.y
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    })
    out.polys.push({ pts, minX, minY, maxX, maxY })
  } else if (shape.kind === 'circle') {
    const tk = shape.attached_to ? map.tokens.find((t) => t.id === shape.attached_to) : undefined
    const c = tk ? { x: tk.x, y: tk.y } : shape.center
    if (!c) return
    const r = (shape.radius_ft ?? 10) * ppf
    out.circles.push({ x: c.x, y: c.y, r2: r * r })
  } else if (shape.kind === 'cells') {
    for (const key of shape.cells ?? []) {
      const [c, r] = key.split(',').map(Number)
      if (Number.isFinite(c) && Number.isFinite(r)) out.cells.add(c * CELL_K + r)
    }
  }
}

export function buildWeatherMasks(map: BattleMap): WeatherMasks {
  const out: WeatherMasks = { rects: [], polys: [], circles: [], cells: new Set(), cellPx: map.grid.cell_px, ox: map.grid.offset_x, oy: map.grid.offset_y, empty: true }
  for (const l of map.layers) {
    if (l.kind !== 'roof' || l.w <= 0 || l.h <= 0) continue
    const a = ((l.rotation ?? 0) * Math.PI) / 180
    out.rects.push({ cx: l.x + l.w / 2, cy: l.y + l.h / 2, hw: l.w / 2, hh: l.h / 2, cos: Math.cos(a), sin: Math.sin(a) })
  }
  for (const z of map.zones) if (z.no_weather && z.enabled !== false) addShape(out, z.shape, map)
  for (const s of map.weather_masks ?? []) addShape(out, s, map)
  out.empty = !out.rects.length && !out.polys.length && !out.circles.length && !out.cells.size
  return out
}

/** точка карты под крышей или в зоне без погоды */
export function isMasked(m: WeatherMasks, x: number, y: number): boolean {
  if (m.empty) return false
  for (const r of m.rects) {
    // в систему слоя: поворот на −rotation вокруг центра
    const dx = x - r.cx
    const dy = y - r.cy
    const lx = dx * r.cos + dy * r.sin
    const ly = -dx * r.sin + dy * r.cos
    if (lx >= -r.hw && lx <= r.hw && ly >= -r.hh && ly <= r.hh) return true
  }
  for (const c of m.circles) {
    const dx = x - c.x
    const dy = y - c.y
    if (dx * dx + dy * dy <= c.r2) return true
  }
  if (m.cells.size) {
    const col = Math.floor((x - m.ox) / m.cellPx)
    const row = Math.floor((y - m.oy) / m.cellPx)
    if (m.cells.has(col * CELL_K + row)) return true
  }
  for (const p of m.polys) {
    if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue
    const pts = p.pts
    const n = pts.length / 2
    let ins = false
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const ax = pts[a * 2]
      const ay = pts[a * 2 + 1]
      const bx = pts[b * 2]
      const by = pts[b * 2 + 1]
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) ins = !ins
    }
    if (ins) return true
  }
  return false
}
