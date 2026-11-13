import { describe, expect, it } from 'vitest'
import type { BattleMap, MapLight, MapToken, Pt } from '../types'
import { lightOrigin } from './fog'

const light = (over: Partial<MapLight> = {}): MapLight => ({
  id: 'l',
  x: 10,
  y: 20,
  elevation_ft: 0,
  bright_ft: 20,
  dim_ft: 20,
  angle: 360,
  rotation: 0,
  flicker: false,
  enabled: true,
  ...over,
})

const token = (id: string, x: number, y: number): MapToken => ({ id, label: id, x, y, elevation_ft: 0, size: 1, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: false })

const mapWith = (tokens: MapToken[]) => ({ tokens }) as unknown as BattleMap

describe('lightOrigin', () => {
  it('свободный источник — на своём месте', () => {
    expect(lightOrigin(mapWith([]), light(), new Map())).toEqual({ x: 10, y: 20 })
  })

  it('прикреплённый — за нарисованным жетоном, иначе за жетоном из данных', () => {
    const m = mapWith([token('t', 100, 200)])
    const l = light({ attached_to: 't' })
    expect(lightOrigin(m, l, new Map<string, Pt>([['t', { x: 150, y: 250 }]]))).toEqual({ x: 150, y: 250 })
    expect(lightOrigin(m, l, new Map())).toEqual({ x: 100, y: 200 })
  })

  it('жетона нет в данных — источник не рисуется', () => {
    expect(lightOrigin(mapWith([]), light({ attached_to: 't' }), new Map())).toBeNull()
  })
})
