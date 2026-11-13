import { describe, expect, it } from 'vitest'
import type { BattleMap, MapLayer, MapZone } from './types'
import { WEATHER, WEATHER_CAP, WeatherField, isWeatherOn, weatherCount, windDrift, wrap } from './weather'
import { buildWeatherMasks, isMasked } from './weatherMask'

describe('weather math', () => {
  it('wraps values into the frame', () => {
    expect(wrap(105, 0, 100)).toBe(5)
    expect(wrap(-5, 0, 100)).toBe(95)
    expect(wrap(50, 20, 100)).toBe(50)
    expect(wrap(7, 3, 0)).toBe(3)
  })
  it('counts particles by kind, intensity and screen area, capped', () => {
    expect(weatherCount('none', 1, 2e6)).toBe(0)
    expect(weatherCount('rain', 0, 2e6)).toBe(0)
    expect(weatherCount('rain', 1, 1e6)).toBe(WEATHER.rain.density)
    expect(weatherCount('rain', 0.5, 1e6)).toBe(Math.round(WEATHER.rain.density / 2))
    expect(weatherCount('rain', 1, 1e8)).toBe(WEATHER_CAP)
    expect(weatherCount('snow', 1, 1e6, true)).toBeLessThan(weatherCount('snow', 1, 1e6))
  })
  it('turns wind direction into drift', () => {
    const out = { x: 0, y: 0 }
    windDrift(WEATHER.rain, { wind_deg: 0, wind: 1 }, 1, out)
    expect(out.x).toBeGreaterThan(0)
    expect(Math.abs(out.y)).toBeLessThan(1e-6)
    windDrift(WEATHER.rain, { wind_deg: 90, wind: 0.5 }, 1, out)
    expect(out.y).toBeGreaterThan(0)
    windDrift(WEATHER.rain, { wind_deg: 90, wind: 0 }, 1, out)
    expect(Math.abs(out.x) + Math.abs(out.y)).toBe(0)
  })
  it('knows when weather is on', () => {
    expect(isWeatherOn(undefined)).toBe(false)
    expect(isWeatherOn({ kind: 'none', intensity: 1, wind: 0, wind_deg: 0 })).toBe(false)
    expect(isWeatherOn({ kind: 'rain', intensity: 0, wind: 0, wind_deg: 0 })).toBe(false)
    expect(isWeatherOn({ kind: 'snow', intensity: 0.3, wind: 0, wind_deg: 0 })).toBe(true)
  })
})

describe('WeatherField', () => {
  const rect = { x: 100, y: 50, w: 400, h: 300 }
  it('fills up to count, keeps particles inside the frame and shrinks on demand', () => {
    const f = new WeatherField(50)
    const wind = { wind_deg: 45, wind: 1 }
    f.step(16, 'rain', wind, rect, 30, 1)
    expect(f.n).toBe(30)
    for (let s = 0; s < 200; s++) f.step(16, 'rain', wind, rect, 30, 1)
    for (let i = 0; i < f.n; i++) {
      expect(f.x[i]).toBeGreaterThanOrEqual(rect.x)
      expect(f.x[i]).toBeLessThan(rect.x + rect.w)
      expect(f.y[i]).toBeGreaterThanOrEqual(rect.y)
      expect(f.y[i]).toBeLessThan(rect.y + rect.h)
    }
    f.step(16, 'rain', wind, rect, 500, 1)
    expect(f.n).toBe(50)
    f.step(16, 'rain', wind, rect, 10, 1)
    expect(f.n).toBe(10)
  })
  it('rain falls, embers rise, none clears', () => {
    const f = new WeatherField(4, () => 0.5)
    const big = { x: 0, y: 0, w: 1e6, h: 1e6 }
    const calm = { wind_deg: 0, wind: 0 }
    f.step(0, 'rain', calm, big, 1, 1)
    const y0 = f.y[0]
    f.step(16, 'rain', calm, big, 1, 1)
    expect(f.y[0]).toBeGreaterThan(y0)
    f.step(0, 'embers', calm, big, 1, 1)
    const e0 = f.y[0]
    f.step(16, 'embers', calm, big, 1, 1)
    expect(f.y[0]).toBeLessThan(e0)
    f.step(16, 'none', calm, big, 1, 1)
    expect(f.n).toBe(0)
  })
})

describe('weather masks', () => {
  const grid = { kind: 'square', cell_px: 50, feet_per_cell: 5, cols: 20, rows: 20, offset_x: 0, offset_y: 0 }
  const roof = (over: Partial<MapLayer> = {}): MapLayer => ({ id: 'r', x: 100, y: 100, w: 200, h: 100, rotation: 0, z: 1, kind: 'roof', opacity: 1, ...over })
  const zone = (shape: MapZone['shape'], over: Partial<MapZone> = {}): MapZone => ({ id: 'z', name: 'z', shape, visible_to_players: true, enabled: true, no_weather: true, ...over })
  const map = (layers: MapLayer[], zones: MapZone[] = [], extra: Partial<BattleMap> = {}): BattleMap => ({ id: 'm', grid, layers, zones, tokens: [], ...extra }) as unknown as BattleMap

  it('is empty without roofs and flagged zones', () => {
    const m = buildWeatherMasks(map([roof({ kind: 'overlay' })], [zone({ kind: 'circle', center: { x: 0, y: 0 }, radius_ft: 10 }, { no_weather: false })]))
    expect(m.empty).toBe(true)
    expect(isMasked(m, 150, 150)).toBe(false)
  })
  it('hides weather under roofs, also rotated ones', () => {
    const m = buildWeatherMasks(map([roof()]))
    expect(isMasked(m, 150, 150)).toBe(true)
    expect(isMasked(m, 50, 150)).toBe(false)
    // повёрнутая на 90° крыша 200×100 с центром (200, 150): x от 150 до 250, y от 50 до 250
    const r = buildWeatherMasks(map([roof({ rotation: 90 })]))
    expect(isMasked(r, 200, 60)).toBe(true)
    expect(isMasked(r, 120, 150)).toBe(false)
  })
  it('hides weather in no_weather zones: circle, polygon, cells and hidden masks', () => {
    const m = buildWeatherMasks(
      map(
        [],
        [
          zone({ kind: 'circle', center: { x: 500, y: 500 }, radius_ft: 10 }),
          zone({
            kind: 'polygon',
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 0, y: 100 },
            ],
          }),
          zone({ kind: 'cells', cells: ['10,2'] }),
          zone({ kind: 'circle', center: { x: 900, y: 900 }, radius_ft: 10 }, { enabled: false }),
        ],
        { weather_masks: [{ kind: 'circle', center: { x: 700, y: 100 }, radius_ft: 5 }] },
      ),
    )
    expect(isMasked(m, 580, 500)).toBe(true) // 10 фт = 100 px
    expect(isMasked(m, 620, 500)).toBe(false)
    expect(isMasked(m, 20, 20)).toBe(true)
    expect(isMasked(m, 90, 90)).toBe(false)
    expect(isMasked(m, 525, 125)).toBe(true)
    expect(isMasked(m, 575, 125)).toBe(false)
    expect(isMasked(m, 900, 900)).toBe(false)
    expect(isMasked(m, 720, 100)).toBe(true)
  })
  it('moves an attached circle with its token', () => {
    const base = map([], [zone({ kind: 'circle', center: { x: 0, y: 0 }, radius_ft: 5, attached_to: 't1' })])
    const m = buildWeatherMasks({ ...base, tokens: [{ id: 't1', x: 300, y: 300 }] } as unknown as BattleMap)
    expect(isMasked(m, 310, 300)).toBe(true)
    expect(isMasked(m, 10, 0)).toBe(false)
  })
})
