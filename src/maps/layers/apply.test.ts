import { describe, expect, it } from 'vitest'
import { applyDelta, byZ } from './apply'
import { cleanStyle, DEFAULT_STYLE } from '../drawings/style'

describe('события слоёв', () => {
  it('upsert заменяет по id, remove убирает', () => {
    const list = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }]
    expect(applyDelta(list, { map_id: 'm', upsert: [{ id: 'a', v: 2 }, { id: 'c', v: 1 }], remove: ['b'] })).toEqual([
      { id: 'a', v: 2 },
      { id: 'c', v: 1 },
    ])
    expect(applyDelta(list, { map_id: 'm' })).toBe(list)
  })
  it('рисунки по z, равные — в порядке прихода', () => {
    expect(byZ([{ id: 'a', z: 2 }, { id: 'b', z: 1 }, { id: 'c', z: 1 }]).map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('стиль рисования из localStorage', () => {
  it('мусор приводится к допустимому', () => {
    expect(cleanStyle(null)).toEqual(DEFAULT_STYLE)
    const s = cleanStyle({ stroke_color: 'red', stroke_width: 999, fill: 'solid', fill_opacity: -1, text_color: '#00ff00' })
    expect(s.stroke_color).toBe(DEFAULT_STYLE.stroke_color)
    expect(s.stroke_width).toBe(64)
    expect(s.fill).toBe('solid')
    expect(s.fill_opacity).toBe(0)
    expect(s.text_color).toBe('#00ff00')
  })
})
