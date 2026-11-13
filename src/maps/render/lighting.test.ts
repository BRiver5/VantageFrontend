import { afterEach, describe, expect, it } from 'vitest'
import type { MapGrid, MapLight } from '../types'
import { inSight } from './fog'
import {
  ambientLevel,
  animationOf,
  darknessAt,
  darknessMoving,
  exploredRects,
  hueShift,
  lightActive,
  lightFrame,
  lightsAnimating,
  noteServerTime,
  resetServerClock,
  sceneShade,
  serverNow,
  STILL,
} from './lighting'

const light = (over: Partial<MapLight> = {}): MapLight => ({ id: 'l', x: 0, y: 0, elevation_ft: 0, bright_ft: 20, dim_ft: 20, angle: 360, rotation: 0, flicker: false, enabled: true, ...over })
const T0 = Date.parse('2026-01-01T20:00:00Z')

describe('темнота сцены', () => {
  const amb = { level: 'bright' as const, color: null, darkness: 1, darkness_from: 0, darkness_started_at: '2026-01-01T20:00:00', darkness_duration_s: 10 }

  it('переход линейный по времени сервера и не выходит за края', () => {
    expect(darknessAt(amb, T0 - 5000)).toBe(0)
    expect(darknessAt(amb, T0 + 5000)).toBeCloseTo(0.5)
    expect(darknessAt(amb, T0 + 60000)).toBe(1)
    expect(darknessMoving(amb, T0 + 5000)).toBe(true)
    expect(darknessMoving(amb, T0 + 60000)).toBe(false)
  })

  it('без перехода — цель; старые карты без поля — день', () => {
    expect(darknessAt({ level: 'bright', color: null, darkness: 0.4 }, T0)).toBe(0.4)
    expect(darknessAt({ level: 'bright', color: null }, T0)).toBe(0)
  })

  it('окружение — темнее из уровня карты и темноты, как на сервере', () => {
    expect(ambientLevel({ level: 'bright', color: null }, 0.5)).toBe('dim')
    expect(ambientLevel({ level: 'bright', color: null }, 0.8)).toBe('dark')
    expect(ambientLevel({ level: 'dark', color: null }, 0)).toBe('dark')
    expect(sceneShade({ level: 'dim', color: null }, 0)).toBe(0.5)
    expect(sceneShade({ level: 'bright', color: null }, 1)).toBeCloseTo(0.92)
  })
})

describe('часы сервера', () => {
  afterEach(resetServerClock)

  it('берёт наибольший сдвиг: старые события из журнала не сбивают часы', () => {
    noteServerTime({}, '2026-01-01T20:00:10Z', T0)
    expect(serverNow(T0)).toBe(T0 + 10000)
    noteServerTime({}, '2026-01-01T19:59:00Z', T0)
    expect(serverNow(T0)).toBe(T0 + 10000)
  })

  it('одну и ту же карту учитывает один раз', () => {
    const m = {}
    noteServerTime(m, '2026-01-01T20:00:00Z', T0)
    noteServerTime(m, '2026-01-01T20:00:30Z', T0)
    expect(serverNow(T0)).toBe(T0)
  })
})

describe('источники', () => {
  it('диапазон темноты: фонарь горит только ночью', () => {
    const lamp = light({ darkness_min: 0.5 })
    expect(lightActive(lamp, 0.2)).toBe(false)
    expect(lightActive(lamp, 0.7)).toBe(true)
    expect(lightActive(light({ enabled: false }), 0.7)).toBe(false)
  })

  it('старое «мерцает» — факел; щадящий режим — без движения', () => {
    expect(animationOf(light({ flicker: true }))).toBe('torch')
    expect(animationOf(light({ flicker: true, animation: 'pulse' }))).toBe('pulse')
    expect(lightFrame('torch', 1234, 5, 5, 1, true)).toBe(STILL)
    expect(lightFrame('none', 1234)).toBe(STILL)
  })

  it('кадры анимации в разумных пределах', () => {
    for (const kind of ['torch', 'pulse', 'chroma', 'fog', 'sunburst'] as const) {
      for (let t = 0; t < 20000; t += 777) {
        const f = lightFrame(kind, t, 10, 10, 3)
        expect(f.radius).toBeGreaterThan(0.85)
        expect(f.radius).toBeLessThan(1.15)
        expect(f.alpha).toBeGreaterThanOrEqual(0.3)
        expect(f.alpha).toBeLessThanOrEqual(1)
      }
    }
  })

  it('перерисовка каждый кадр — только при горящей анимации', () => {
    expect(lightsAnimating([light({ animation: 'pulse' })], 0)).toBe(true)
    expect(lightsAnimating([light({ animation: 'pulse', darkness_min: 0.5 })], 0)).toBe(false)
    expect(lightsAnimating([light()], 0)).toBe(false)
  })

  it('сдвиг оттенка', () => {
    expect(hueShift('#ff0000', 0)).toBe('#ff0000')
    expect(hueShift('#ff0000', 120)).toMatch(/^hsl\(120, /)
  })
})

describe('исследованный туман', () => {
  const g = { kind: 'square', cell_px: 10, feet_per_cell: 5, cols: 10, rows: 10, offset_x: 0, offset_y: 0 } as MapGrid

  it('соседние клетки строки сливаются в прямоугольник', () => {
    expect(exploredRects(['0,0', '1,0', '2,0', '5,0', '1,1', '1,1', 'x'], g)).toEqual([
      { x: 0, y: 0, w: 30, h: 10 },
      { x: 50, y: 0, w: 10, h: 10 },
      { x: 10, y: 10, w: 10, h: 10 },
    ])
  })

  it('вне обзора своих жетонов не видно', () => {
    const sights = [{ t: {} as never, p: { x: 0, y: 0 }, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }]
    expect(inSight(sights, { x: 5, y: 5 })).toBe(true)
    expect(inSight(sights, { x: 50, y: 5 })).toBe(false)
  })
})
