import { describe, expect, it } from 'vitest'
import { addWaypoint, elevationStep, feet, floorAt, heightLabel, hexSteps, measure, removeWaypoint, roundHalfEven, segmentFt, type RulerPoint } from './math'

const square5 = { kind: 'square' as const, feet_per_cell: 5, diagonal: '5' as const }
const square510 = { kind: 'square' as const, feet_per_cell: 5, diagonal: '5-10' as const }
const hex = { kind: 'hex' as const, feet_per_cell: 5, diagonal: '5' as const }
const pt = (c: number, r: number, elevation = 0): RulerPoint => ({ cell: [c, r], elevation })

describe('segmentFt', () => {
  it('прямо и по диагонали «5»', () => {
    expect(segmentFt([0, 0], [4, 0], 0, square5).ft).toBe(20)
    expect(segmentFt([0, 0], [3, 3], 0, square5).ft).toBe(15)
    expect(segmentFt([0, 0], [4, 2], 0, square5).ft).toBe(20)
  })

  it('«5-10»: каждая вторая диагональ стоит 10, как на сервере', () => {
    expect(segmentFt([0, 0], [1, 1], 0, square510).ft).toBe(5)
    expect(segmentFt([0, 0], [2, 2], 0, square510).ft).toBe(15)
    expect(segmentFt([0, 0], [3, 3], 0, square510).ft).toBe(20)
    expect(segmentFt([0, 0], [4, 2], 0, square510).ft).toBe(25)
    // после нечётной диагонали следующая стоит 10
    expect(segmentFt([0, 0], [1, 1], 0, square510, 1)).toEqual({ ft: 10, parity: 0 })
  })

  it('высота — третья ось', () => {
    expect(segmentFt([0, 0], [0, 0], 20, square5).ft).toBe(20)
    expect(segmentFt([0, 0], [2, 0], 10, square5).ft).toBe(10)
    expect(segmentFt([0, 0], [2, 0], 10, square510).ft).toBe(15)
    expect(segmentFt([0, 0], [6, 0], -10, square5).ft).toBe(30)
  })

  it('шестиугольники', () => {
    expect(hexSteps([0, 0], [3, 0])).toBe(3)
    expect(hexSteps([0, 0], [0, 2])).toBe(2)
    expect(hexSteps([0, 0], [0, 1])).toBe(1)
    expect(hexSteps([0, 0], [1, 1])).toBe(2)
    expect(hexSteps([0, 0], [2, 4])).toBe(4)
    expect(segmentFt([0, 0], [2, 4], 0, hex).ft).toBe(20)
    expect(segmentFt([0, 0], [1, 0], 15, hex).ft).toBe(15)
  })
})

describe('measure', () => {
  it('отрезки и итог', () => {
    const m = measure([pt(0, 0), pt(3, 0), pt(3, 4)], square5)
    expect(m.segments.map((s) => [s.ft, s.total])).toEqual([[15, 15], [20, 35]])
    expect(m.total).toBe(35)
  })

  it('«5-10» чередуется через точки, а не заново', () => {
    const split = measure([pt(0, 0), pt(1, 1), pt(2, 2)], square510)
    expect(split.segments.map((s) => s.ft)).toEqual([5, 10])
    expect(split.total).toBe(measure([pt(0, 0), pt(2, 2)], square510).total)
  })

  it('высота точек', () => {
    expect(measure([pt(0, 0), pt(0, 0, 15)], square5).total).toBe(15)
    expect(measure([pt(0, 0)], square5)).toEqual({ segments: [], total: 0 })
  })
})

describe('точки линейки', () => {
  it('добавить и убрать', () => {
    let l = [pt(0, 0)]
    l = addWaypoint(l, pt(2, 0))
    l = addWaypoint(l, pt(2, 0))
    expect(l).toHaveLength(2)
    l = addWaypoint(l, pt(2, 0, 5))
    expect(l).toHaveLength(3)
    l = removeWaypoint(removeWaypoint(removeWaypoint(l)))
    expect(l).toEqual([pt(0, 0)])
  })

  it('шаг высоты и пол', () => {
    expect(elevationStep({ feet_per_cell: 5 }, 1, false)).toBe(5)
    expect(elevationStep({ feet_per_cell: 5 }, -1, true)).toBe(-1)
    expect(elevationStep({ feet_per_cell: 10 }, -1, false)).toBe(-10)
    expect(floorAt({ terrain: { elevation: { '2,3': 10 }, difficult: [], water: [], climbable: [] } }, [2, 3])).toBe(10)
    expect(floorAt({ terrain: { elevation: {}, difficult: [], water: [], climbable: [] } }, [0, 0])).toBe(0)
  })

  it('подписи', () => {
    expect(feet(7.5)).toBe('7,5 фт.')
    expect(heightLabel(15, 5)).toBe('↑10 фт.')
    expect(heightLabel(5, 5)).toBe('')
    expect(roundHalfEven(0.5)).toBe(0)
    expect(roundHalfEven(1.5)).toBe(2)
    expect(roundHalfEven(1.2)).toBe(1)
  })
})
