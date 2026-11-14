/**
 * Сетка карты: квадрат и шестиугольники — та же математика, что на сервере
 * (vantageserver app/maps/geometry.py, Grid). Общая таблица случаев —
 * gridParity.json здесь и tests/maps/grid_parity.json на сервере.
 *
 * Квадрат: клетка cell_px × cell_px. Шестиугольник: cell_px — расстояние
 * между центрами соседних клеток (поперёк граней), сосед всегда в
 * feet_per_cell футах. hex_rows_* — «вершиной вверх», рядами, сдвинуты
 * нечётные (odd) или чётные (even) ряды на полклетки вправо; hex_cols_* —
 * «гранью вверх», столбцами, сдвиг вниз. Клетка — [col, row] (смещённые
 * координаты), расчёты — в осевых (q, r).
 */
import type { GridKind, MapGrid, Pt } from './types'

export type Cell = [number, number]
type G = Pick<MapGrid, 'kind'>
type GPx = Pick<MapGrid, 'kind' | 'cell_px' | 'offset_x' | 'offset_y'>

export const HEX_KINDS: readonly GridKind[] = ['hex_rows_odd', 'hex_rows_even', 'hex_cols_odd', 'hex_cols_even']
const HEX_DIRECTIONS: readonly Cell[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

/** Старое «hex» — ряды со сдвигом нечётных, как на сервере */
export const normalizeKind = (kind: string | undefined | null): GridKind =>
  kind === 'hex' ? 'hex_rows_odd' : HEX_KINDS.includes(kind as GridKind) ? (kind as GridKind) : 'square'

export const isHex = (g: G) => normalizeKind(g.kind) !== 'square'
const isRows = (g: G) => {
  const k = normalizeKind(g.kind)
  return k === 'hex_rows_odd' || k === 'hex_rows_even'
}

/** Радиус описанной окружности шестиугольника */
export const hexRadius = (g: Pick<MapGrid, 'cell_px'>) => g.cell_px / Math.sqrt(3)

/** Ширина и высота сетки в пикселях (без сдвига) */
export function gridSize(g: Pick<MapGrid, 'kind' | 'cell_px' | 'cols' | 'rows'>): { w: number; h: number } {
  if (!isHex(g)) return { w: g.cols * g.cell_px, h: g.rows * g.cell_px }
  const R = hexRadius(g)
  if (isRows(g)) return { w: g.cols * g.cell_px + g.cell_px / 2, h: (1.5 * g.rows + 0.5) * R }
  return { w: (1.5 * g.cols + 0.5) * R, h: g.rows * g.cell_px + g.cell_px / 2 }
}

/** Сколько клеток помещается в картинку w × h (подогнать сетку под фон) */
export function gridFit(g: Pick<MapGrid, 'kind' | 'cell_px'>, w: number, h: number): { cols: number; rows: number } {
  if (!isHex(g)) return { cols: Math.ceil(w / g.cell_px), rows: Math.ceil(h / g.cell_px) }
  const R = hexRadius(g)
  const along = (px: number) => Math.max(1, Math.ceil((px - g.cell_px / 2) / g.cell_px))
  const across = (px: number) => Math.max(1, Math.ceil((px / R - 0.5) / 1.5))
  return isRows(g) ? { cols: along(w), rows: across(h) } : { cols: across(w), rows: along(h) }
}

export function toAxial(g: G, [col, row]: Cell): Cell {
  switch (normalizeKind(g.kind)) {
    case 'hex_rows_odd': return [col - (row - (row & 1)) / 2, row]
    case 'hex_rows_even': return [col - (row + (row & 1)) / 2, row]
    case 'hex_cols_odd': return [col, row - (col - (col & 1)) / 2]
    case 'hex_cols_even': return [col, row - (col + (col & 1)) / 2]
    default: return [col, row]
  }
}

export function fromAxial(g: G, q: number, r: number): Cell {
  switch (normalizeKind(g.kind)) {
    case 'hex_rows_odd': return [q + (r - (r & 1)) / 2, r]
    case 'hex_rows_even': return [q + (r + (r & 1)) / 2, r]
    case 'hex_cols_odd': return [q, r + (q - (q & 1)) / 2]
    case 'hex_cols_even': return [q, r + (q + (q & 1)) / 2]
    default: return [q, r]
  }
}

/** Клетка, сдвинутая на d: квадрат — [dcol, drow], шестиугольники — осевой сдвиг [dq, dr] */
export function shiftCell(g: G, cell: Cell, d: Cell): Cell {
  if (!isHex(g)) return [cell[0] + d[0], cell[1] + d[1]]
  const [q, r] = toAxial(g, cell)
  return fromAxial(g, q + d[0], r + d[1])
}

/** Соседи: на квадрате 8, на шестиугольниках 6 */
export function neighbours(g: G, cell: Cell): Cell[] {
  if (!isHex(g)) {
    const out: Cell[] = []
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) if (dx || dy) out.push([cell[0] + dx, cell[1] + dy])
    return out
  }
  return HEX_DIRECTIONS.map((d) => shiftCell(g, cell, d))
}

const axialDistance = (a: Cell, b: Cell) => {
  const dq = a[0] - b[0]
  const dr = a[1] - b[1]
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** Шагов между клетками: квадрат — по Чебышёву, шестиугольники — по сетке */
export function cellDistance(g: G, a: Cell, b: Cell): number {
  if (!isHex(g)) return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
  return axialDistance(toAxial(g, a), toAxial(g, b))
}

/** Кубическое округление; половина — вверх, как _half_up на сервере */
function hexRound(fq: number, fr: number): Cell {
  const fs = -fq - fr
  let q = Math.floor(fq + 0.5)
  let r = Math.floor(fr + 0.5)
  const s = Math.floor(fs + 0.5)
  const dq = Math.abs(q - fq)
  const dr = Math.abs(r - fr)
  const ds = Math.abs(s - fs)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return [q + 0, r + 0]
}

function hexOrigin(g: GPx): Pt {
  const s = g.cell_px
  const R = hexRadius(g)
  const k = normalizeKind(g.kind)
  if (isRows(g)) return { x: g.offset_x + s / 2 + (k === 'hex_rows_even' ? s / 2 : 0), y: g.offset_y + R }
  return { x: g.offset_x + R, y: g.offset_y + s / 2 + (k === 'hex_cols_even' ? s / 2 : 0) }
}

export function cellOf(g: GPx, p: Pt): Cell {
  if (!isHex(g)) return [Math.floor((p.x - g.offset_x) / g.cell_px), Math.floor((p.y - g.offset_y) / g.cell_px)]
  const o = hexOrigin(g)
  const x = p.x - o.x
  const y = p.y - o.y
  const step = 1.5 * hexRadius(g)
  let fq: number
  let fr: number
  if (isRows(g)) {
    fr = y / step
    fq = x / g.cell_px - fr / 2
  } else {
    fq = x / step
    fr = y / g.cell_px - fq / 2
  }
  const [q, r] = hexRound(fq, fr)
  return fromAxial(g, q, r)
}

export function cellCenter(g: GPx, col: number, row: number): Pt {
  if (!isHex(g)) return { x: g.offset_x + (col + 0.5) * g.cell_px, y: g.offset_y + (row + 0.5) * g.cell_px }
  const [q, r] = toAxial(g, [col, row])
  const o = hexOrigin(g)
  const R = hexRadius(g)
  if (isRows(g)) return { x: o.x + g.cell_px * (q + r / 2), y: o.y + 1.5 * R * r }
  return { x: o.x + 1.5 * R * q, y: o.y + g.cell_px * (r + q / 2) }
}

/** Контур клетки; inset сжимает его к центру на столько пикселей */
export function cellPolygon(g: GPx, col: number, row: number, inset = 0): Pt[] {
  if (!isHex(g)) {
    const x0 = g.offset_x + col * g.cell_px + inset
    const y0 = g.offset_y + row * g.cell_px + inset
    const x1 = x0 + g.cell_px - 2 * inset
    const y1 = y0 + g.cell_px - 2 * inset
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  }
  const c = cellCenter(g, col, row)
  const R = hexRadius(g) * Math.max(0, 1 - inset / (g.cell_px / 2))
  const start = isRows(g) ? 30 : 0
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((start + 60 * i) * Math.PI) / 180
    return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) }
  })
}

/**
 * Клетки существа на шестиугольниках: n = round(size) клеток в поперечнике →
 * все клетки в радиусе n // 2 шагов. Среднее — 1, Большое и Огромное — 7,
 * Исполинское — 19 (как hex_footprint на сервере).
 */
export function hexFootprint(g: G, center: Cell, size: number): Cell[] {
  const radius = Math.floor(Math.max(1, Math.round(size)) / 2)
  const out: Cell[] = []
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) out.push(shiftCell(g, center, [dq, dr]))
  }
  return out
}

/** Ближайшая вершина клетки (стены на шестиугольниках идут по граням) */
export function nearestCorner(g: GPx, p: Pt): Pt {
  if (!isHex(g)) {
    return {
      x: g.offset_x + Math.round((p.x - g.offset_x) / g.cell_px) * g.cell_px,
      y: g.offset_y + Math.round((p.y - g.offset_y) / g.cell_px) * g.cell_px,
    }
  }
  const [c, r] = cellOf(g, p)
  return cellPolygon(g, c, r).reduce((best, v) => (Math.hypot(v.x - p.x, v.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? v : best))
}

/** Обвести клетку контуром на ctx (путь, без заливки) */
export function traceCell(ctx: CanvasRenderingContext2D | Path2D, g: GPx, col: number, row: number, inset = 0) {
  const pts = cellPolygon(g, col, row, inset)
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}
