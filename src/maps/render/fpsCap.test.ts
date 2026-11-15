import { describe, expect, it } from 'vitest'
import { createFrameCap, frameInterval } from './fpsCap'

/** кадры экрана с частотой hz за ms миллисекунд; сколько из них нарисовано */
function drawn(maxFps: number, hz: number, ms: number, jitter = 0): number {
  const cap = createFrameCap()
  let n = 0
  const frames = Math.round((ms * hz) / 1000)
  for (let i = 0; i <= frames; i++) {
    const t = i * (1000 / hz) + (i % 2 ? jitter : -jitter)
    if (cap(t, maxFps)) n++
  }
  return n
}

describe('fpsCap', () => {
  it('interval', () => {
    expect(frameInterval(0)).toBe(0)
    expect(frameInterval(-5)).toBe(0)
    expect(frameInterval(50)).toBe(20)
  })

  it('no cap draws every frame', () => {
    expect(drawn(0, 60, 1000)).toBe(61)
  })

  it('30 on a 60 Hz screen draws every second frame', () => {
    expect(drawn(30, 60, 1000)).toBe(31)
  })

  it('tolerates rAF jitter', () => {
    expect(drawn(30, 60, 1000, 0.6)).toBe(31)
  })

  it('cap above screen rate changes nothing', () => {
    expect(drawn(120, 60, 1000)).toBe(61)
  })

  it('20 on a 144 Hz screen stays close to 20', () => {
    const n = drawn(20, 144, 1000)
    expect(n).toBeGreaterThanOrEqual(19)
    expect(n).toBeLessThanOrEqual(22)
  })

  it('first frame after a long pause is drawn and does not burst', () => {
    const cap = createFrameCap()
    expect(cap(0, 30)).toBe(true)
    expect(cap(5000, 30)).toBe(true)
    expect(cap(5016, 30)).toBe(false)
    expect(cap(5033, 30)).toBe(true)
  })
})
