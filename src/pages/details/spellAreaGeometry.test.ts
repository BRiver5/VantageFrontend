import { describe, expect, it } from 'vitest'
import { areaCaption, areaFromText, areaGrid, showSpellArea, spellAreaSpec } from './spellAreaGeometry'

describe('spellArea', () => {
  it('сфера 20 фт из точки — радиус 4 клетки от пересечения', () => {
    const g = areaGrid({ shape: 'sphere', sizeFt: 20, origin: 'point' })
    expect(g.cols).toBe(10)
    expect(g.point).toEqual([5, 5])
    // по осям от центра — ровно 4 клетки в каждую сторону
    expect(g.cells.has('1,4')).toBe(true)
    expect(g.cells.has('0,4')).toBe(false)
    expect(g.cells.has('8,5')).toBe(true)
    expect(g.cells.has('9,5')).toBe(false)
  })

  it('аура на себя окружает клетку заклинателя', () => {
    const g = areaGrid({ shape: 'sphere', sizeFt: 10, origin: 'self' })
    expect(g.caster).toEqual([3, 3])
    expect(g.cells.has('3,3')).toBe(false)
    expect(g.cells.has('1,3')).toBe(true)
    expect(g.cells.has('0,3')).toBe(false)
  })

  it('конус 15 фт: 3 клетки в длину, расширяется', () => {
    const g = areaGrid({ shape: 'cone', sizeFt: 15, origin: 'self' })
    const cy = g.caster![1]
    expect(g.cells.has(`1,${cy}`)).toBe(true)
    expect(g.cells.has(`3,${cy}`)).toBe(true)
    expect(g.cells.has(`4,${cy}`)).toBe(false)
    expect([...g.cells].filter((c) => c.startsWith('3,')).length).toBeGreaterThan(1)
  })

  it('линия 60×5 — 12 клеток', () => {
    expect(areaGrid({ shape: 'line', sizeFt: 60, origin: 'self' }).cells.size).toBe(12)
  })

  it('куб 15 фт — 9 клеток', () => {
    expect(areaGrid({ shape: 'cube', sizeFt: 15, origin: 'point' }).cells.size).toBe(9)
  })

  it('без области — одна клетка', () => {
    const spec = spellAreaSpec({ range: '120 футов', description: 'Три дротика…', mechanics: null })
    expect(spec.shape).toBe('single')
    expect(areaGrid(spec).cells.size).toBe(1)
  })

  it('из текста дистанции: «На себя (15-футовый конус)»', () => {
    expect(areaFromText('На себя (15-футовый конус)', true)).toEqual({ shape: 'cone', sizeFt: 15, origin: 'self' })
    expect(spellAreaSpec({ range: 'На себя (30-футовый радиус)', description: null, mechanics: null })).toMatchObject({ shape: 'sphere', sizeFt: 30, origin: 'self' })
  })

  it('подпись', () => {
    expect(areaCaption({ shape: 'sphere', sizeFt: 20, origin: 'point' })).toBe('Сфера · радиус 20 фт · 4 клетки')
  })
})

describe('showSpellArea', () => {
  it('«на себя» и «касание» без области — без рисунка', () => {
    expect(showSpellArea({ range: 'Касание', description: null, mechanics: null })).toBe(false)
    expect(showSpellArea({ range: 'На себя', description: null, mechanics: null })).toBe(false)
  })
  it('аура «на себя» и дальняя цель — с рисунком', () => {
    expect(showSpellArea({ range: 'На себя (30-футовый радиус)', description: null, mechanics: null })).toBe(true)
    expect(showSpellArea({ range: '120 футов', description: null, mechanics: null })).toBe(true)
  })
})
