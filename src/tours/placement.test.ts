import { describe, expect, it } from 'vitest'
import { placeDialog } from './placement'

const vp = { w: 1000, h: 800 }
const size = { w: 300, h: 200 }

describe('место окна шага', () => {
  it('без якоря — по центру экрана', () => {
    expect(placeDialog(null, size, vp)).toEqual({ x: 350, y: 300 })
  })

  it('снизу от якоря, если там есть место', () => {
    expect(placeDialog({ x: 400, y: 100, w: 200, h: 40 }, size, vp, 'bottom')).toEqual({ x: 350, y: 154 })
  })

  it('нет места снизу — сверху', () => {
    expect(placeDialog({ x: 400, y: 700, w: 200, h: 40 }, size, vp, 'bottom')).toEqual({ x: 350, y: 486 })
  })

  it('справа от бокового меню и прижато к краю экрана', () => {
    expect(placeDialog({ x: 0, y: 0, w: 250, h: 60 }, size, vp, 'right')).toEqual({ x: 264, y: 12 })
  })

  it('огромный якорь — окно у его нижнего края внутри экрана', () => {
    const p = placeDialog({ x: 0, y: 0, w: 1000, h: 800 }, size, vp, 'center')
    expect(p.y + size.h).toBeLessThanOrEqual(vp.h - 12)
    expect(p.x).toBe(350)
  })
})
