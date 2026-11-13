import { describe, expect, it } from 'vitest'
import type { MapWall } from '../types'
import type { MapSound } from '../layers/types'
import { emitterVolume, falloff, mapDarkness, occlusion, segmentsIntersect, wallsBetween } from './volume'

const wall = (ax: number, ay: number, bx: number, by: number, extra: Partial<MapWall> = {}): MapWall => ({
  id: `${ax}${ay}${bx}${by}`,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  kind: 'wall',
  height_ft: 1000,
  base_ft: 0,
  blocks: { move: true, sight: true, light: true, sound: true },
  ...extra,
})
const sound = (over: Partial<MapSound> = {}): MapSound => ({ id: 's', map_id: 'm', name: '', asset_id: null, url: 'a.ogg', x: 0, y: 0, radius_ft: 30, volume: 1, easing: true, walls: true, darkness: null, enabled: true, ...over })

describe('затухание', () => {
  it('тише к краю и тишина за радиусом', () => {
    expect(falloff(0, 30, true)).toBe(1)
    expect(falloff(15, 30, true)).toBeCloseTo(0.25)
    expect(falloff(30, 30, true)).toBe(0)
    expect(falloff(40, 30, false)).toBe(0)
    expect(falloff(29, 30, false)).toBe(1)
  })
  it('темнота карты по освещению', () => {
    expect(mapDarkness('bright')).toBe(0)
    expect(mapDarkness('dim')).toBe(0.5)
    expect(mapDarkness('dark')).toBe(1)
  })
})

describe('стены глушат звук', () => {
  it('пересечение отрезков', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toBe(true)
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: -5 }, { x: 15, y: 5 })).toBe(false)
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false)
  })
  it('считаются только стены со звуком, открытая дверь пропускает', () => {
    const walls = [
      wall(5, -5, 5, 5),
      wall(6, -5, 6, 5, { blocks: { move: true, sight: true, light: true, sound: false } }),
      wall(7, -5, 7, 5, { kind: 'door', door: { open: true, locked: false } }),
      wall(8, -5, 8, 5, { kind: 'door', door: { open: false, locked: false } }),
    ]
    expect(wallsBetween(walls, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(2)
  })
  it('множитель за стены', () => {
    expect(occlusion(0)).toBe(1)
    expect(occlusion(1)).toBeCloseTo(0.3)
    expect(occlusion(3)).toBe(0)
  })
})

describe('громкость источника', () => {
  const ppf = 10 // 10 px = 1 фут
  it('по расстоянию и личной громкости источника', () => {
    expect(emitterVolume(sound({ volume: 0.5 }), { x: 0, y: 0 }, [], ppf, 0)).toBe(0.5)
    expect(emitterVolume(sound(), { x: 150, y: 0 }, [], ppf, 0)).toBeCloseTo(0.25)
    expect(emitterVolume(sound(), { x: 400, y: 0 }, [], ppf, 0)).toBe(0)
    expect(emitterVolume(sound(), null, [], ppf, 0)).toBe(0)
  })
  it('стена глушит, если включено «глушится стенами»', () => {
    const walls = [wall(50, -50, 50, 50)]
    expect(emitterVolume(sound({ easing: false }), { x: 100, y: 0 }, walls, ppf, 0)).toBeCloseTo(0.3)
    expect(emitterVolume(sound({ easing: false, walls: false }), { x: 100, y: 0 }, walls, ppf, 0)).toBe(1)
  })
  it('окно темноты и выключенный источник', () => {
    const night = sound({ darkness: { min: 0.5, max: 1 } })
    expect(emitterVolume(night, { x: 0, y: 0 }, [], ppf, 0)).toBe(0)
    expect(emitterVolume(night, { x: 0, y: 0 }, [], ppf, 1)).toBe(1)
    expect(emitterVolume(sound({ enabled: false }), { x: 0, y: 0 }, [], ppf, 0)).toBe(0)
  })
})
