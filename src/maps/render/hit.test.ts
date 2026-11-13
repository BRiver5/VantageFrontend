import { describe, expect, it } from 'vitest'
import type { BattleMap, MapToken, MapWall, Pt } from '../types'
import { doorAt, tokenAt } from './hit'

const token = (id: string, x: number, y: number, over: Partial<MapToken> = {}): MapToken => ({
  id,
  label: id,
  x,
  y,
  elevation_ft: 0,
  size: 1,
  rotation: 0,
  vision_mode: 'normal',
  senses: {},
  flying: false,
  hidden: false,
  ...over,
})

const wall = (id: string, kind: MapWall['kind']): MapWall => ({
  id,
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  kind,
  height_ft: 10,
  base_ft: 0,
  blocks: { move: true, sight: true, light: true, sound: true },
  door: kind === 'door' || kind === 'secret' ? { open: false, locked: false } : null,
})

const mapOf = (over: Partial<BattleMap> = {}): BattleMap => ({
  id: 'm1',
  room_id: null,
  name: 'Карта',
  description: '',
  revision: 1,
  revealed: true,
  grid: { kind: 'square', cell_px: 50, feet_per_cell: 5, cols: 10, rows: 10, offset_x: 0, offset_y: 0, area_rule: 'center', diagonal: '5' },
  layers: [],
  terrain: { elevation: {}, difficult: [], water: [], climbable: [] },
  objects: [],
  walls: [],
  lights: [],
  ambient: { level: 'bright', color: null },
  tokens: [],
  items: [],
  zones: [],
  fog: { mode: 'off', honest: false, shared_party_vision: false },
  ...over,
})

describe('tokenAt', () => {
  it('без нарисованного положения — по данным', () => {
    const m = mapOf({ tokens: [token('a', 100, 100)] })
    expect(tokenAt(m, false, new Map(), { x: 110, y: 100 })?.id).toBe('a')
    expect(tokenAt(m, false, new Map(), { x: 200, y: 100 })).toBeNull()
  })

  it('попадание там, где жетон нарисован (шаг, перетаскивание)', () => {
    const m = mapOf({ tokens: [token('a', 100, 100)] })
    const pos = new Map<string, Pt>([['a', { x: 300, y: 300 }]])
    expect(tokenAt(m, false, pos, { x: 100, y: 100 })).toBeNull()
    expect(tokenAt(m, false, pos, { x: 305, y: 300 })?.id).toBe('a')
  })

  it('скрытый — только мастеру; меньший сверху', () => {
    const m = mapOf({ tokens: [token('big', 100, 100, { size: 2 }), token('h', 100, 100, { hidden: true })] })
    expect(tokenAt(m, false, new Map(), { x: 100, y: 100 })?.id).toBe('big')
    expect(tokenAt(m, true, new Map(), { x: 100, y: 100 })?.id).toBe('h')
  })
})

describe('doorAt', () => {
  const mid = { x: 50, y: 5 }
  it('обычная дверь — всем, стена — никому', () => {
    expect(doorAt(mapOf({ walls: [wall('d', 'door')] }), false, mid)).toBe('d')
    expect(doorAt(mapOf({ walls: [wall('w', 'wall')] }), true, mid)).toBeNull()
  })

  it('тайная дверь — только мастеру, как её рисуют', () => {
    const m = mapOf({ walls: [wall('s', 'secret')] })
    expect(doorAt(m, true, mid)).toBe('s')
    expect(doorAt(m, false, mid)).toBeNull()
  })

  it('далеко от середины — мимо', () => {
    expect(doorAt(mapOf({ walls: [wall('d', 'door')] }), false, { x: 0, y: 0 })).toBeNull()
  })
})
