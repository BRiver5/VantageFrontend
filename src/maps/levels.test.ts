import { describe, expect, it } from 'vitest'
import { layerOnLevel, levelAt, mapOnLevel, nextLevel, pruneLevels, setLevelOf, stampLevel, tokenLevel, viewLevel } from './levels'
import type { BattleMap, MapLevel, MapToken } from './types'

const LEVELS: MapLevel[] = [
  { id: 'up', name: 'Второй', bottom_ft: 10, top_ft: 20 },
  { id: 'g', name: 'Первый', bottom_ft: 0, top_ft: 10 },
  { id: 'cellar', name: 'Подвал', bottom_ft: -10, top_ft: 0 },
]
const tk = (id: string, elevation_ft = 0, over: Partial<MapToken> = {}): MapToken => ({ id, label: id, x: 0, y: 0, elevation_ft, size: 1, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: false, ...over })
const base = (over: Partial<BattleMap> = {}): BattleMap =>
  ({
    id: 'm',
    levels: LEVELS,
    layers: [{ id: 'bg', kind: 'background', x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, opacity: 1 }],
    walls: [
      { id: 'w-g', level_id: 'g' },
      { id: 'w-up', level_id: 'up' },
      { id: 'w-all' },
    ],
    objects: [{ id: 'o-up', level_id: 'up' }],
    items: [{ id: 'i-g', level_id: 'g' }, { id: 'i-carried', carried_by: 'owl', level_id: 'g' }],
    zones: [{ id: 'z-up', level_id: 'up' }],
    lights: [{ id: 'l-g', level_id: 'g' }, { id: 'torch', attached_to: 'owl', level_id: 'g' }],
    tokens: [tk('hero'), tk('owl', 12), tk('rat', -5)],
    fog: { mode: 'dynamic', honest: false, shared_party_vision: true, explored: ['0,0', '5,5'], explored_levels: { g: ['0,0'], up: ['5,5'] } },
    ...over,
  }) as unknown as BattleMap
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('levelAt', () => {
  it('finds the level by [bottom, top) and falls back below', () => {
    expect(levelAt(LEVELS, 0)?.id).toBe('g')
    expect(levelAt(LEVELS, 10)?.id).toBe('up')
    expect(levelAt(LEVELS, -3)?.id).toBe('cellar')
    expect(levelAt(LEVELS, -40)?.id).toBe('cellar')
    expect(levelAt(LEVELS, 99)?.id).toBe('up')
    expect(levelAt([], 5)).toBeNull()
    expect(tokenLevel(base(), tk('x', 12))).toBe('up')
  })
})

describe('mapOnLevel', () => {
  it('returns the same map without levels or for "all levels"', () => {
    const m = base()
    expect(mapOnLevel(m, null)).toBe(m)
    const flat = base({ levels: [] })
    expect(mapOnLevel(flat, 'g')).toBe(flat)
  })
  it('keeps things of the level and things on all levels', () => {
    const m = mapOnLevel(base(), 'up')
    expect(ids(m.tokens)).toEqual(['owl'])
    expect(ids(m.walls)).toEqual(['w-up', 'w-all'])
    expect(ids(m.objects)).toEqual(['o-up'])
    expect(ids(m.zones)).toEqual(['z-up'])
    // свет в руке и несомое едут с жетоном, а не по своему level_id
    expect(ids(m.lights)).toEqual(['torch'])
    expect(ids(m.items)).toEqual(['i-carried'])
    expect(m.fog.explored).toEqual(['5,5'])
    const g = mapOnLevel(base(), 'g')
    expect(ids(g.tokens)).toEqual(['hero'])
    expect(ids(g.lights)).toEqual(['l-g'])
    expect(ids(g.items)).toEqual(['i-g'])
    expect(g.fog.explored).toEqual(['0,0'])
  })
  it('puts the level background instead of the map background', () => {
    const bg = { id: 'bg-up', image_url: 'x.png', kind: 'background' as const, x: 0, y: 0, w: 1, h: 1, rotation: 0, z: -1, opacity: 1 }
    const m = base({ levels: LEVELS.map((l) => (l.id === 'up' ? { ...l, background: bg } : l)) })
    expect(ids(mapOnLevel(m, 'up').layers)).toEqual(['bg-up'])
    expect(ids(mapOnLevel(m, 'g').layers)).toEqual(['bg'])
  })
})

describe('viewLevel', () => {
  const m = base()
  it('lets the DM choose or see all', () => {
    expect(viewLevel(m, { isDm: true, chosen: null, selected: null, mine: [] })).toBeNull()
    expect(viewLevel(m, { isDm: true, chosen: 'up', selected: null, mine: [] })).toBe('up')
    expect(viewLevel(m, { isDm: true, chosen: 'gone', selected: null, mine: [] })).toBeNull()
  })
  it('follows the selected or own token for players', () => {
    const mine = [tk('hero'), tk('owl', 12)]
    expect(viewLevel(m, { isDm: false, chosen: null, selected: 'owl', mine })).toBe('up')
    expect(viewLevel(m, { isDm: false, chosen: null, selected: null, mine })).toBe('g')
    expect(viewLevel(m, { isDm: false, chosen: null, selected: null, mine: [] })).toBe('g')
    expect(viewLevel(base({ levels: [] }), { isDm: false, chosen: null, selected: null, mine })).toBeNull()
  })
})

describe('layerOnLevel', () => {
  it('filters notes, sounds and drawings and keeps the array when nothing to drop', () => {
    const xs = [{ id: 'a' }, { id: 'b', level_id: 'g' }]
    expect(layerOnLevel(xs, 'g')).toBe(xs)
    expect(layerOnLevel(xs, null)).toBe(xs)
    expect(ids(layerOnLevel(xs, 'up'))).toEqual(['a'])
  })
})

describe('editor helpers', () => {
  it('stamps new things with the current level and lifts new tokens to its floor', () => {
    const prev = base()
    const next = { ...prev, walls: [...prev.walls, { id: 'new' }], tokens: [...prev.tokens, tk('fresh')] } as unknown as BattleMap
    const out = stampLevel(prev, next, 'up')
    expect(out.walls.find((w) => w.id === 'new')?.level_id).toBe('up')
    expect(out.walls.find((w) => w.id === 'w-all')?.level_id).toBeUndefined()
    expect(out.tokens.find((t) => t.id === 'fresh')?.elevation_ft).toBe(10)
    expect(stampLevel(prev, next, null)).toBe(next)
  })
  it('respects an explicit "all levels" on a new thing', () => {
    const prev = base()
    const next = { ...prev, lights: [...prev.lights, { id: 'sun', level_id: null }] } as unknown as BattleMap
    expect(stampLevel(prev, next, 'g').lights.find((l) => l.id === 'sun')?.level_id).toBeNull()
  })
  it('prunes things of a removed level and moves one thing between levels', () => {
    const m = { ...base(), levels: LEVELS.filter((l) => l.id !== 'up'), zones: [{ id: 'z', level_id: 'up', stairs_to: 'up' }] } as unknown as BattleMap
    const out = pruneLevels(m)
    expect(out.walls.find((w) => w.id === 'w-up')?.level_id).toBeNull()
    expect(out.zones[0]).toMatchObject({ level_id: null, stairs_to: null })
    expect(setLevelOf(base(), 'w-all', 'g').walls.find((w) => w.id === 'w-all')?.level_id).toBe('g')
  })
  it('adds the next level above the top one', () => {
    expect(nextLevel(LEVELS, 'n')).toMatchObject({ bottom_ft: 20, top_ft: 30, name: 'Этаж 4' })
    expect(nextLevel([], 'n')).toMatchObject({ bottom_ft: 0, top_ft: 10, name: 'Первый этаж' })
  })
})
