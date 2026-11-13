import { describe, expect, it } from 'vitest'
import type { MapDrawing } from '../layers/types'
import { chaikin, drawingAt, hitDrawing, moveDrawing, pointInPolygon, polygonAdd, polygonArea, polygonFinish, polygonUndo, rectFrom, simplify, smoothStroke, zFor } from './geometry'

const P = (x: number, y: number) => ({ x, y })
const base: Omit<MapDrawing, 'kind'> = { id: 'd', map_id: 'm', author_id: 'u', x: 0, y: 0, w: 0, h: 0, points: [], text: '', z: 0, hidden: false, stroke_color: '#ffffff', stroke_width: 2, stroke_opacity: 1, fill: 'none', fill_color: '#ffffff', fill_opacity: 0.3, font_size: 20, text_color: '#ffffff' }

describe('прямоугольник', () => {
  it('из любых двух углов и квадрат с Shift', () => {
    expect(rectFrom(P(10, 10), P(0, 30))).toEqual({ x: 0, y: 10, w: 10, h: 20 })
    expect(rectFrom(P(0, 0), P(10, -30), true)).toEqual({ x: 0, y: -30, w: 30, h: 30 })
  })
})

describe('многоугольник', () => {
  it('точки, повторы и правый клик', () => {
    let pts = polygonAdd([], P(0, 0))
    pts = polygonAdd(pts, P(0.5, 0.5))
    expect(pts).toHaveLength(1)
    pts = polygonAdd(pts, P(10, 0))
    pts = polygonAdd(pts, P(10, 10))
    expect(polygonUndo(pts)).toEqual([P(0, 0), P(10, 0)])
  })
  it('двойной клик заканчивает: повтор последней и замыкание убираются', () => {
    expect(polygonFinish([P(0, 0), P(10, 0), P(10, 10), P(10, 10), P(0, 0)])).toEqual([P(0, 0), P(10, 0), P(10, 10)])
    expect(polygonFinish([P(0, 0), P(10, 0)])).toBeNull()
    expect(polygonFinish([P(0, 0), P(5, 0), P(10, 0)])).toBeNull()
  })
  it('площадь и попадание внутрь', () => {
    const sq = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]
    expect(Math.abs(polygonArea(sq))).toBe(100)
    expect(pointInPolygon(P(5, 5), sq)).toBe(true)
    expect(pointInPolygon(P(15, 5), sq)).toBe(false)
  })
})

describe('сглаживание линии от руки', () => {
  it('упрощение выбрасывает дрожь на прямой', () => {
    const shaky = Array.from({ length: 50 }, (_, i) => P(i, i % 2 ? 0.4 : -0.4))
    const s = simplify(shaky, 1)
    expect(s).toHaveLength(2)
    expect(s[0]).toEqual(shaky[0])
    expect(s[1]).toEqual(shaky[49])
  })
  it('Чайкин оставляет концы и срезает угол', () => {
    const c = chaikin([P(0, 0), P(10, 0), P(10, 10)], 1)
    expect(c[0]).toEqual(P(0, 0))
    expect(c[c.length - 1]).toEqual(P(10, 10))
    expect(c).not.toContainEqual(P(10, 0))
    expect(c.length).toBe(6)
  })
  it('итог укладывается в предел точек', () => {
    const wave = Array.from({ length: 5000 }, (_, i) => P(i, Math.sin(i / 3) * 40))
    expect(smoothStroke(wave, 0.5, 2, 400).length).toBeLessThanOrEqual(400)
  })
})

describe('попадание в рисунок', () => {
  it('контур прямоугольника без заливки, внутри с заливкой', () => {
    const r: MapDrawing = { ...base, kind: 'rect', x: 0, y: 0, w: 100, h: 50 }
    expect(hitDrawing(r, P(50, 1), 4)).toBe(true)
    expect(hitDrawing(r, P(50, 25), 4)).toBe(false)
    expect(hitDrawing({ ...r, fill: 'solid' }, P(50, 25), 4)).toBe(true)
  })
  it('эллипс и линия', () => {
    const e: MapDrawing = { ...base, kind: 'ellipse', x: 0, y: 0, w: 100, h: 100 }
    expect(hitDrawing(e, P(100, 50), 3)).toBe(true)
    expect(hitDrawing(e, P(50, 50), 3)).toBe(false)
    const f: MapDrawing = { ...base, kind: 'freehand', points: [P(0, 0), P(100, 0)] }
    expect(hitDrawing(f, P(50, 2), 3)).toBe(true)
    expect(hitDrawing(f, P(50, 20), 3)).toBe(false)
  })
  it('верхний по порядку, сдвиг и z', () => {
    const a: MapDrawing = { ...base, id: 'a', kind: 'rect', w: 10, h: 10, fill: 'solid', z: 0 }
    const b: MapDrawing = { ...a, id: 'b', z: 1 }
    expect(drawingAt([a, b], P(5, 5), 2)?.id).toBe('b')
    expect(moveDrawing({ x: 1, y: 2, points: [P(0, 0)] }, 3, 4)).toEqual({ x: 4, y: 6, points: [P(3, 4)] })
    expect(zFor([a, b], 'front')).toBe(2)
    expect(zFor([a, b], 'back')).toBe(-1)
  })
})
