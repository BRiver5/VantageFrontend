import { describe, expect, it } from 'vitest'
import { cellCenter, cellDistance, cellOf, cellPolygon, gridFit, gridSize, HEX_KINDS, hexFootprint, nearestCorner, neighbours, normalizeKind, shiftCell, toAxial, fromAxial, type Cell } from './hex'
import { areaCells, areaPolygon } from './geometry'
import parity from './gridParity.json'
import { segmentFt } from './ruler/math'
import type { GridKind, MapGrid } from './types'

const base = parity.grid
const grid = (kind: GridKind, extra: Partial<MapGrid> = {}): MapGrid => ({ ...base, kind, area_rule: 'touch', diagonal: '5', ...extra })
const sorted = (cells: Cell[]) => [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])

// Та же таблица — tests/maps/grid_parity.json на сервере
describe('общая таблица с сервером', () => {
  it.each(parity.hex_distance as [GridKind, Cell, Cell, number, number][])('%s: %j → %j, высота %d: %d фт', (kind, a, b, dz, ft) => {
    for (const diagonal of ['5', '5-10'] as const) expect(segmentFt(a, b, dz, { kind, feet_per_cell: 5, diagonal }).ft).toBe(ft)
  })

  it.each(parity.hex_neighbours as [GridKind, Cell, Cell[]][])('%s: соседи %j', (kind, cell, expected) => {
    expect(sorted(neighbours(grid(kind), cell))).toEqual(expected)
  })

  it.each(parity.hex_cell_of as [GridKind, [number, number], Cell][])('%s: точка %j в клетке %j', (kind, [x, y], cell) => {
    expect(cellOf(grid(kind), { x, y })).toEqual(cell)
  })

  it.each(parity.square_distance as [Cell, Cell, number, '5' | '5-10', number][])('квадрат: %j → %j, высота %d, %s: %d фт', (a, b, dz, diagonal, ft) => {
    expect(segmentFt(a, b, dz, { kind: 'square', feet_per_cell: 5, diagonal }).ft).toBe(ft)
  })
})

describe.each(HEX_KINDS)('%s', (kind) => {
  const g = grid(kind)

  it('центр клетки ↔ клетка, соседи в одном шаге и в cell_px пикселях', () => {
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 6; r++) {
        const p = cellCenter(g, c, r)
        expect(cellOf(g, p)).toEqual([c, r])
        for (const v of cellPolygon(g, c, r, 2)) expect(cellOf(g, v)).toEqual([c, r])
        for (const n of neighbours(g, [c, r])) {
          const q = cellCenter(g, n[0], n[1])
          expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(base.cell_px)
          expect(cellDistance(g, [c, r], n)).toBe(1)
        }
        expect(fromAxial(g, ...toAxial(g, [c, r]))).toEqual([c, r])
      }
    }
  })

  it('сетка начинается в сдвиге и занимает gridSize', () => {
    const small = grid(kind, { cols: 5, rows: 5 })
    const pts = [0, 1, 2, 3, 4].flatMap((c) => [0, 1, 2, 3, 4].flatMap((r) => cellPolygon(small, c, r)))
    const size = gridSize(small)
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(base.offset_x)
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(base.offset_y)
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(base.offset_x + size.w)
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(base.offset_y + size.h)
    expect(gridFit(small, size.w, size.h)).toEqual({ cols: 5, rows: 5 })
  })

  it('место существа: 1, 7, 7, 19 клеток; осевой сдвиг не зависит от ряда', () => {
    expect([0.5, 1, 2, 3, 4].map((s) => hexFootprint(g, [5, 5], s).length)).toEqual([1, 1, 7, 7, 19])
    expect(sorted(hexFootprint(g, [4, 6], 2))).toEqual(sorted([[4, 6], ...neighbours(g, [4, 6])]))
    expect(cellDistance(g, shiftCell(g, [3, 3], [2, -1]), [3, 3])).toBe(2)
  })

  it('клетки под областью: touch и center, как на сервере', () => {
    const c = cellCenter(g, 6, 6)
    const sphere = areaPolygon('sphere', c, 50 - 1)
    expect(sorted(areaCells(sphere, g, 'touch'))).toEqual(sorted([[6, 6], ...neighbours(g, [6, 6])]))
    expect(areaCells(sphere, g, 'center')).toEqual([[6, 6]])
    const big = areaCells(areaPolygon('sphere', c, 200 + 1), g, 'center')
    expect(big).toHaveLength(1 + 6 + 12 + 18 + 24)
    expect(big.every((x) => cellDistance(g, x, [6, 6]) <= 4)).toBe(true)
  })

  it('угол стены — вершина клетки', () => {
    const v = cellPolygon(g, 2, 2)[1]
    expect(nearestCorner(g, { x: v.x + 1, y: v.y - 1 })).toEqual(v)
  })
})

describe('вид сетки', () => {
  it('старое «hex» — ряды, неизвестное — квадрат', () => {
    expect(normalizeKind('hex')).toBe('hex_rows_odd')
    expect(normalizeKind('hex_cols_even')).toBe('hex_cols_even')
    expect(normalizeKind(undefined)).toBe('square')
  })

  it('квадрат как раньше', () => {
    const sq = grid('square')
    expect(cellOf(sq, { x: 125, y: 75 })).toEqual([2, 1])
    expect(cellCenter(sq, 2, 1)).toEqual({ x: 10 + 2.5 * 50, y: 20 + 1.5 * 50 })
    expect(neighbours(sq, [1, 1])).toHaveLength(8)
    expect(gridSize(sq)).toEqual({ w: 600, h: 600 })
    expect(nearestCorner(sq, { x: 34, y: 46 })).toEqual({ x: 10, y: 70 })
  })
})
