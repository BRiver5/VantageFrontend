import { describe, expect, it } from 'vitest'
import type { BattleMap, MapZone } from '../types'
import { SIZE_CELLS, segDist, wallOf, zonePoly } from './geometry'

describe('segDist', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }

  it('перпендикуляр к середине отрезка', () => {
    expect(segDist({ x: 5, y: 3 }, a, b)).toBe(3)
  })

  it('за концами — расстояние до ближайшего конца', () => {
    expect(segDist({ x: -3, y: 4 }, a, b)).toBe(5)
    expect(segDist({ x: 13, y: 4 }, a, b)).toBe(5)
  })

  it('вырожденный отрезок — расстояние до точки', () => {
    expect(segDist({ x: 3, y: 4 }, a, a)).toBe(5)
  })
})

describe('wallOf', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 1, y: 1 }

  it('обычная стена блокирует всё, без двери', () => {
    const w = wallOf('wall', a, b)
    expect(w.id).toMatch(/^w_/)
    expect(w).toMatchObject({ a, b, kind: 'wall', height_ft: 10, base_ft: 0 })
    expect(w.blocks).toEqual({ move: true, sight: true, light: true, sound: true })
    expect(w.door).toBeUndefined()
  })

  it('окно пропускает движение, взгляд и свет, но не звук', () => {
    expect(wallOf('window', a, b).blocks).toEqual({ move: true, sight: false, light: false, sound: true })
  })

  it('дверь создаётся закрытой и незапертой', () => {
    expect(wallOf('door', a, b).door).toEqual({ open: false, locked: false, secret: false })
  })
})

describe('SIZE_CELLS', () => {
  it('размеры существ в клетках', () => {
    expect(SIZE_CELLS).toMatchObject({ tiny: 0.5, medium: 1, large: 2, gargantuan: 4 })
  })
})

describe('zonePoly', () => {
  const map = { grid: { cell_px: 50, feet_per_cell: 5 } } as BattleMap
  const zone = (shape: MapZone['shape']) => ({ id: 'z', name: 'Зона', shape, visible_to_players: true, enabled: true }) as MapZone

  it('круг: 24 точки на радиусе radius_ft · px/ft', () => {
    const c = { x: 100, y: 100 }
    const p = zonePoly(zone({ kind: 'circle', center: c, radius_ft: 15 }), map)
    expect(p).toHaveLength(24)
    expect(Math.hypot(p[0].x - c.x, p[0].y - c.y)).toBeCloseTo(150)
  })

  it('круг без радиуса — 10 футов', () => {
    const p = zonePoly(zone({ kind: 'circle', center: { x: 0, y: 0 } }), map)
    expect(Math.hypot(p[0].x, p[0].y)).toBeCloseTo(100)
  })

  it('многоугольник — его точки; без точек или центра — пусто', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
    expect(zonePoly(zone({ kind: 'polygon', points: pts }), map)).toBe(pts)
    expect(zonePoly(zone({ kind: 'cells', cells: ['0,0'] }), map)).toEqual([])
    expect(zonePoly(zone({ kind: 'circle' }), map)).toEqual([])
  })
})
