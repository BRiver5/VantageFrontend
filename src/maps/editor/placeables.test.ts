import { describe, expect, it } from 'vitest'
import type { BattleMap, MapLight, MapWall, MapZone } from '../types'
import { hitAt } from './edit'
import { EMPTY_FILTER, filterPlaceables, idsInBox, kindOf, placeables, removeIds, setLocked, toggleId } from './placeables'

const wall = (id: string, a: [number, number], b: [number, number], over: Partial<MapWall> = {}): MapWall => ({
  id,
  a: { x: a[0], y: a[1] },
  b: { x: b[0], y: b[1] },
  kind: 'wall',
  height_ft: 10,
  base_ft: 0,
  blocks: { move: true, sight: true, light: true, sound: true },
  ...over,
})

const light = (id: string, x: number, y: number, over: Partial<MapLight> = {}): MapLight => ({ id, x, y, elevation_ft: 5, bright_ft: 20, dim_ft: 20, angle: 360, rotation: 0, flicker: false, enabled: true, ...over })

const zone = (id: string, name: string, over: Partial<MapZone> = {}): MapZone => ({ id, name, shape: { kind: 'circle', center: { x: 200, y: 200 }, radius_ft: 5 }, visible_to_players: true, enabled: true, ...over })

const baseMap = (over: Partial<BattleMap> = {}): BattleMap => ({
  id: 'm1',
  room_id: null,
  name: 'Карта',
  description: '',
  revision: 1,
  revealed: false,
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

const map = baseMap({
  walls: [wall('w1', [0, 0], [100, 0]), wall('w2', [0, 0], [0, 100], { kind: 'secret', door: { open: false, locked: false, secret: true } })],
  lights: [light('l1', 50, 50, { locked: true })],
  tokens: [{ id: 't1', label: 'Гоблин', x: 75, y: 75, elevation_ft: 0, size: 1, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: true, side: 'enemies' }],
  zones: [zone('z1', 'Ловушка', { visible_to_players: false })],
})

describe('список объектов сцены', () => {
  it('имена, виды, скрытость, закрепление', () => {
    const list = placeables(map)
    expect(list.map((x) => [x.id, x.kind, x.name])).toEqual([
      ['w1', 'walls', 'Стена 1'],
      ['w2', 'walls', 'Секретная дверь 1'],
      ['l1', 'lights', 'Свет 1'],
      ['t1', 'tokens', 'Гоблин'],
      ['z1', 'zones', 'Ловушка'],
    ])
    expect(list.find((x) => x.id === 'w1')!.at).toEqual({ x: 50, y: 0 })
    expect(list.filter((x) => x.hidden).map((x) => x.id)).toEqual(['w2', 't1', 'z1'])
    expect(list.filter((x) => x.locked).map((x) => x.id)).toEqual(['l1'])
  })

  it('фильтры: вид, имя, скрытые, закреплённые', () => {
    const list = placeables(map)
    expect(filterPlaceables(list, EMPTY_FILTER)).toHaveLength(5)
    expect(filterPlaceables(list, { ...EMPTY_FILTER, kinds: ['walls', 'zones'] }).map((x) => x.id)).toEqual(['w1', 'w2', 'z1'])
    expect(filterPlaceables(list, { ...EMPTY_FILTER, q: 'гоб' }).map((x) => x.id)).toEqual(['t1'])
    expect(filterPlaceables(list, { ...EMPTY_FILTER, hidden: 'no' }).map((x) => x.id)).toEqual(['w1', 'l1'])
    expect(filterPlaceables(list, { ...EMPTY_FILTER, locked: 'yes' }).map((x) => x.id)).toEqual(['l1'])
    expect(filterPlaceables(list, { ...EMPTY_FILTER, kinds: ['walls'], hidden: 'yes' }).map((x) => x.id)).toEqual(['w2'])
  })

  it('kindOf', () => {
    expect(kindOf(map, 'z1')).toBe('zones')
    expect(kindOf(map, 'nope')).toBeNull()
  })
})

describe('выбор', () => {
  it('рамка: целиком внутри, закреплённое пропускается', () => {
    expect(idsInBox(map, { x: -5, y: -5 }, { x: 105, y: 105 }).sort()).toEqual(['t1', 'w1', 'w2'])
    expect(idsInBox(map, { x: 105, y: 105 }, { x: -5, y: 50 })).toEqual(['t1'])
    expect(idsInBox(map, { x: 150, y: 150 }, { x: 260, y: 260 })).toEqual(['z1'])
  })

  it('закреплённое не выбирается кликом', () => {
    expect(hitAt(map, { x: 50, y: 50 })).toBeNull()
    const free = setLocked(map, ['l1'], false)
    expect(hitAt(free, { x: 50, y: 50 })).toBe('l1')
  })

  it('setLocked меняет только нужные списки', () => {
    const next = setLocked(map, ['w1', 'z1'], true)
    expect(next.walls[0].locked).toBe(true)
    expect(next.zones[0].locked).toBe(true)
    expect(next.lights).toBe(map.lights)
    expect(next.tokens).toBe(map.tokens)
  })

  it('toggleId и removeIds', () => {
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleId(['a'], 'c')).toEqual(['a', 'c'])
    const next = removeIds(map, ['w1', 't1', 'z1'])
    expect(next.walls.map((w) => w.id)).toEqual(['w2'])
    expect(next.tokens).toHaveLength(0)
    expect(next.zones).toHaveLength(0)
  })
})
