import { describe, expect, it } from 'vitest'
import { multiplierFor, parseCr, partyThresholds, rateEncounter, xpForCr } from './encounter'

describe('опыт за существо', () => {
  it('по показателю опасности, дроби и строки', () => {
    expect(xpForCr(0)).toBe(10)
    expect(xpForCr(0.125)).toBe(25)
    expect(xpForCr('1/4')).toBe(50)
    expect(xpForCr('1/2')).toBe(100)
    expect(xpForCr(5)).toBe(1800)
    expect(xpForCr(30)).toBe(155000)
    expect(xpForCr(null)).toBe(0)
    expect(parseCr('0,5')).toBe(0.5)
  })
})

describe('множитель', () => {
  it('по числу противников', () => {
    expect([1, 2, 3, 6, 7, 10, 11, 14, 15].map((n) => multiplierFor(n, 4))).toEqual([1, 1.5, 2, 2, 2.5, 2.5, 3, 3, 4])
  })
  it('поправка на размер партии', () => {
    expect(multiplierFor(1, 2)).toBe(1.5)
    expect(multiplierFor(15, 2)).toBe(5)
    expect(multiplierFor(1, 6)).toBe(0.5)
    expect(multiplierFor(3, 7)).toBe(1.5)
  })
})

describe('сложность встречи', () => {
  it('пороги партии складываются по героям', () => {
    expect(partyThresholds([3, 3, 3, 3])).toEqual({ easy: 300, medium: 600, hard: 900, deadly: 1600, day: 4800 })
  })

  it('пример из Руководства мастера: 4 героя 3-го уровня против багбира и трёх хобгоблинов — трудная', () => {
    const r = rateEncounter([3, 3, 3, 3], [1, 0.5, 0.5, 0.5])
    expect(r.baseXp).toBe(500)
    expect(r.multiplier).toBe(2)
    expect(r.adjustedXp).toBe(1000)
    expect(r.difficulty).toBe('hard')
  })

  it('партия разных уровней и один сильный противник', () => {
    // пороги 2+3+3+4 уровней: лёгкая 325, средняя 650, трудная 975, смертельная 1500
    const r = rateEncounter([2, 3, 3, 4], [4])
    expect(r.adjustedXp).toBe(1100)
    expect(r.difficulty).toBe('hard')
  })

  it('пять героев 1-го уровня против шести гоблинов — смертельная', () => {
    const r = rateEncounter([1, 1, 1, 1, 1], Array(6).fill('1/4'))
    expect(r.adjustedXp).toBe(600)
    expect(r.difficulty).toBe('deadly')
  })

  it('одинокий герой: множитель на шаг больше', () => {
    const r = rateEncounter([5], [2])
    expect(r.multiplier).toBe(1.5)
    expect(r.adjustedXp).toBe(675)
    expect(r.difficulty).toBe('medium')
  })

  it('без противников и без героев — пустяк, доля дня', () => {
    expect(rateEncounter([3, 3], []).difficulty).toBe('trivial')
    expect(rateEncounter([], [5]).difficulty).toBe('trivial')
    expect(rateEncounter([1, 1, 1, 1], [1]).dayShare).toBeCloseTo(200 / 1200)
  })
})
