import { describe, expect, it } from 'vitest'
import {
  angleTo,
  areaPolygon,
  blockingSegments,
  cellCenter,
  cellOf,
  circle,
  dist,
  pointInPolygon,
  pxPerFt,
  snapToCell,
  snapToCorner,
  visibility,
} from './geometry'
import type { MapGrid, MapWall, Pt } from './types'

const grid: MapGrid = {
  kind: 'square',
  cell_px: 50,
  feet_per_cell: 5,
  cols: 10,
  rows: 10,
  offset_x: 10,
  offset_y: 20,
  area_rule: 'center',
  diagonal: '5',
}

const wall = (over: Partial<MapWall> = {}): MapWall => ({
  id: 'w',
  a: { x: 0, y: 0 },
  b: { x: 10, y: 0 },
  kind: 'wall',
  height_ft: 10,
  base_ft: 0,
  blocks: { move: true, sight: true, light: true, sound: true },
  ...over,
})

const close = (p: Pt, q: Pt) => {
  expect(p.x).toBeCloseTo(q.x, 6)
  expect(p.y).toBeCloseTo(q.y, 6)
}

describe('сетка', () => {
  it('pxPerFt', () => {
    expect(pxPerFt(grid)).toBe(10)
  })

  it('cellOf учитывает смещение и отрицательные координаты', () => {
    expect(cellOf(grid, { x: 10, y: 20 })).toEqual([0, 0])
    expect(cellOf(grid, { x: 59.9, y: 69.9 })).toEqual([0, 0])
    expect(cellOf(grid, { x: 60, y: 70 })).toEqual([1, 1])
    expect(cellOf(grid, { x: 9, y: 19 })).toEqual([-1, -1])
  })

  it('cellCenter и snapToCell', () => {
    expect(cellCenter(grid, 0, 0)).toEqual({ x: 35, y: 45 })
    expect(cellCenter(grid, 2, 3)).toEqual({ x: 135, y: 195 })
    expect(snapToCell(grid, { x: 140, y: 160 })).toEqual({ x: 135, y: 145 })
  })

  it('snapToCorner — к ближайшему углу клетки', () => {
    expect(snapToCorner(grid, { x: 34, y: 44 })).toEqual({ x: 10, y: 20 })
    expect(snapToCorner(grid, { x: 36, y: 46 })).toEqual({ x: 60, y: 70 })
  })
})

describe('примитивы', () => {
  it('circle: n точек на радиусе r', () => {
    const pts = circle({ x: 5, y: 5 }, 10, 8)
    expect(pts).toHaveLength(8)
    for (const p of pts) expect(dist(p, { x: 5, y: 5 })).toBeCloseTo(10, 9)
    close(pts[0], { x: 15, y: 5 })
    close(pts[2], { x: 5, y: 15 })
  })

  it('circle по умолчанию 40 точек', () => {
    expect(circle({ x: 0, y: 0 }, 1)).toHaveLength(40)
  })

  it('angleTo в градусах 0..360, ось y вниз', () => {
    const o = { x: 0, y: 0 }
    expect(angleTo(o, { x: 1, y: 0 })).toBeCloseTo(0)
    expect(angleTo(o, { x: 0, y: 1 })).toBeCloseTo(90)
    expect(angleTo(o, { x: -1, y: 0 })).toBeCloseTo(180)
    expect(angleTo(o, { x: 0, y: -1 })).toBeCloseTo(270)
  })

  it('dist', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('pointInPolygon', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false)
    expect(pointInPolygon({ x: -1, y: 5 }, sq)).toBe(false)
    expect(pointInPolygon({ x: 5, y: 5 }, [])).toBe(false)
  })
})

describe('areaPolygon', () => {
  const o = { x: 0, y: 0 }

  it('конус: треугольник, ширина основания равна длине', () => {
    const p = areaPolygon('cone', o, 100, 0)
    expect(p).toHaveLength(3)
    expect(p[0]).toEqual(o)
    close(p[1], { x: 100, y: 50 })
    close(p[2], { x: 100, y: -50 })
  })

  it('линия: прямоугольник длиной size и шириной width', () => {
    const p = areaPolygon('line', o, 100, 90, 10)
    expect(p).toHaveLength(4)
    close(p[0], { x: -5, y: 0 })
    close(p[1], { x: -5, y: 100 })
    close(p[2], { x: 5, y: 100 })
    close(p[3], { x: 5, y: 0 })
  })

  it('линия без ширины вырождается в отрезок', () => {
    const p = areaPolygon('wall', o, 100, 0)
    close(p[0], p[3])
  })

  it('сфера/цилиндр — круг радиуса size, излучение — size + extra', () => {
    for (const s of ['sphere', 'cylinder']) {
      const p = areaPolygon(s, o, 30)
      expect(p).toHaveLength(40)
      expect(dist(p[0], o)).toBeCloseTo(30)
    }
    expect(dist(areaPolygon('emanation', o, 30, 0, 0, 5)[0], o)).toBeCloseTo(35)
  })

  it('куб: квадрат со стороной size от точки начала', () => {
    const p = areaPolygon('cube', o, 20, 0)
    close(p[0], { x: 0, y: 10 })
    close(p[1], { x: 20, y: 10 })
    close(p[2], { x: 20, y: -10 })
    close(p[3], { x: 0, y: -10 })
  })

  it('неизвестная форма — круг', () => {
    expect(areaPolygon('blob', o, 10)).toHaveLength(40)
  })
})

describe('blockingSegments', () => {
  it('фильтрует по типу перекрытия, открытым дверям и окнам', () => {
    const walls = [
      wall({ id: 'plain' }),
      wall({ id: 'nosight', blocks: { move: true, sight: false, light: true, sound: true } }),
      wall({ id: 'open', kind: 'door', door: { open: true, locked: false } }),
      wall({ id: 'closed', kind: 'door', door: { open: false, locked: false } }),
      wall({ id: 'secretOpen', kind: 'secret', door: { open: true, locked: false } }),
      wall({ id: 'window', kind: 'window' }),
    ]
    expect(blockingSegments(walls, 'sight')).toHaveLength(2)
    expect(blockingSegments(walls, 'light')).toHaveLength(3)
    expect(blockingSegments([wall()], 'light')[0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })
})

describe('visibility', () => {
  it('без стен — точки на окружности радиуса r', () => {
    const o = { x: 100, y: 100 }
    const poly = visibility(o, 50, [])
    expect(poly.length).toBe(48)
    for (const p of poly) expect(dist(p, o)).toBeLessThanOrEqual(50 + 1e-6)
    expect(pointInPolygon(o, poly)).toBe(true)
  })

  it('стена отрезает видимость за собой', () => {
    const o = { x: 0, y: 0 }
    // вертикальная стена на x = 10 от y = -100 до 100
    const poly = visibility(o, 50, [[{ x: 10, y: -100 }, { x: 10, y: 100 }]])
    expect(Math.max(...poly.map((p) => p.x))).toBeLessThanOrEqual(10 + 1e-6)
    expect(pointInPolygon({ x: 5, y: 0 }, poly)).toBe(true)
    expect(pointInPolygon({ x: 30, y: 0 }, poly)).toBe(false)
    expect(pointInPolygon({ x: -30, y: 0 }, poly)).toBe(true)
  })

  it('дальние стены (за радиусом) игнорируются', () => {
    const poly = visibility({ x: 0, y: 0 }, 10, [[{ x: 100, y: -5 }, { x: 100, y: 5 }]])
    expect(poly.length).toBe(48)
  })

  it('точки отсортированы по углу', () => {
    const o = { x: 0, y: 0 }
    const poly = visibility(o, 50, [[{ x: 10, y: -5 }, { x: 10, y: 5 }]])
    const angs = poly.map((p) => Math.atan2(p.y, p.x))
    // допускаем лишь пару значений около ±π (atan2 по сторонам разреза)
    let drops = 0
    for (let i = 1; i < angs.length; i++) if (angs[i] < angs[i - 1] - 1e-9) drops++
    expect(drops).toBeLessThanOrEqual(1)
  })
})
