import { describe, expect, it } from 'vitest'
import type { BattleMap, MapObject, MapToken, MapWall } from '../types'
import { diffBatch } from './batch'
import { applyPalette, applyWallPreset, clonePalette, countKinds, defaultPalette, paletteWall, presetOf, resetPalette, setPaletteField, withNewDefaults } from './palette'

const wall = (id: string, over: Partial<MapWall> = {}): MapWall => ({
  id,
  a: { x: 0, y: 0 },
  b: { x: 50, y: 0 },
  kind: 'wall',
  height_ft: 10,
  base_ft: 0,
  blocks: { move: true, sight: true, light: true, sound: true },
  ...over,
})

const obj = (id: string, over: Partial<MapObject> = {}): MapObject => ({
  id,
  name: 'Ящик',
  x: 25,
  y: 25,
  w: 50,
  h: 50,
  rotation: 0,
  z: 2,
  height_ft: 5,
  base_ft: 0,
  climbable: true,
  cover: 'half',
  blocks_move: true,
  blocks_sight: false,
  blocks_light: false,
  walkable_top: true,
  container: false,
  hidden: false,
  ...over,
})

const token = (id: string, over: Partial<MapToken> = {}): MapToken => ({
  id,
  label: 'Гоблин',
  x: 25,
  y: 25,
  elevation_ft: 0,
  size: 1,
  rotation: 0,
  vision_mode: 'normal',
  senses: {},
  flying: false,
  hidden: false,
  side: 'enemies',
  ...over,
})

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

describe('заготовки стен', () => {
  it('эфирная: взгляд и звук, без хода и света', () => {
    const p = applyWallPreset(defaultPalette(), 'ethereal')
    expect(p.walls).toMatchObject({ kind: 'wall', move: false, sight: true, light: false, sound: true })
    expect(presetOf(p.walls)).toBe('ethereal')
    expect(p.touched.walls).toEqual(expect.arrayContaining(['kind', 'move', 'sight', 'light', 'sound']))
  })

  it('новая стена по палитре: секретная дверь получает door.secret', () => {
    const p = applyWallPreset(defaultPalette(), 'secret')
    const w = paletteWall(p.walls, { x: 0, y: 0 }, { x: 50, y: 0 })
    expect(w.kind).toBe('secret')
    expect(w.door).toEqual({ open: false, locked: false, secret: true })
    const solid = paletteWall(applyWallPreset(p, 'solid').walls, { x: 0, y: 0 }, { x: 1, y: 0 })
    expect(solid.door).toBeNull()
  })
})

describe('Применить', () => {
  it('только тронутые поля и только выбранные стены, одним шагом', () => {
    const map = baseMap({ walls: [wall('a', { height_ft: 20 }), wall('b'), wall('c')] })
    const p = applyWallPreset(defaultPalette(), 'door')
    const next = applyPalette(map, ['a', 'b'], 'walls', p)
    expect(next.walls[0]).toMatchObject({ kind: 'door', height_ft: 20, door: { open: false, locked: false, secret: false } })
    expect(next.walls[1].kind).toBe('door')
    expect(next.walls[2]).toBe(map.walls[2])
    const batch = diffBatch(map, next)
    expect(batch?.walls?.update?.map((x) => (x as MapWall).id)).toEqual(['a', 'b'])
  })

  it('дверь остаётся запертой, если меняем только высоту', () => {
    const map = baseMap({ walls: [wall('a', { kind: 'door', door: { open: false, locked: true, lock_dc: 15 } })] })
    const p = setPaletteField(defaultPalette(), 'walls', { height_ft: 30 })
    const next = applyPalette(map, ['a'], 'walls', p)
    expect(next.walls[0]).toMatchObject({ kind: 'door', height_ft: 30, door: { locked: true, lock_dc: 15 } })
  })

  it('ничего не тронуто — все поля; чужие виды не задеты', () => {
    const map = baseMap({ objects: [obj('o1')], tokens: [token('t1')] })
    const next = applyPalette(map, ['o1', 't1'], 'objects', defaultPalette())
    expect(next.objects[0]).toMatchObject({ cover: 'none', blocks_move: false, climbable: false, height_ft: 0, name: 'Ящик' })
    expect(next.tokens).toBe(map.tokens)
  })

  it('нет выбранных этого вида — карта та же', () => {
    const map = baseMap({ walls: [wall('a')] })
    expect(applyPalette(map, ['x'], 'walls', defaultPalette())).toBe(map)
  })

  it('жетоны: сторона и скрытость', () => {
    const map = baseMap({ tokens: [token('t1'), token('t2')] })
    const p = setPaletteField(defaultPalette(), 'tokens', { hidden: true, side: 'neutral' })
    const next = applyPalette(map, ['t2'], 'tokens', p)
    expect(next.tokens[1]).toMatchObject({ hidden: true, side: 'neutral', label: 'Гоблин' })
    expect(next.tokens[0].hidden).toBe(false)
  })
})

describe('Клонировать и Сбросить', () => {
  it('клонирует первое выбранное своего вида и обнуляет тронутое', () => {
    const map = baseMap({ walls: [wall('a', { kind: 'window', blocks: { move: false, sight: false, light: false, sound: true }, one_way: true })] })
    const p = clonePalette(setPaletteField(defaultPalette(), 'walls', { height_ft: 99 }), map, ['a'], 'walls')!
    expect(p.walls).toEqual({ kind: 'window', height_ft: 10, one_way: true, move: false, sight: false, light: false, sound: true })
    expect(p.touched.walls).toEqual([])
    expect(presetOf(p.walls)).toBe('window')
    expect(clonePalette(p, map, ['zzz'], 'walls')).toBeNull()
  })

  it('сброс возвращает только тронутые поля к выбранному', () => {
    const map = baseMap({ objects: [obj('o1', { height_ft: 15, cover: 'full' })] })
    let p = setPaletteField(defaultPalette(), 'objects', { height_ft: 40 })
    p = { ...p, objects: { ...p.objects, cover: 'three_quarters' } } // не тронуто
    const r = resetPalette(p, map, ['o1'], 'objects')
    expect(r.objects.height_ft).toBe(15)
    expect(r.objects.cover).toBe('three_quarters')
    expect(r.touched.objects).toEqual([])
  })

  it('сброс без выбора — к исходным', () => {
    const p = applyWallPreset(defaultPalette(), 'window')
    const r = resetPalette(p, baseMap(), [], 'walls')
    expect(r.walls).toEqual(defaultPalette().walls)
  })
})

describe('прочее', () => {
  it('countKinds', () => {
    const map = baseMap({ walls: [wall('a'), wall('b')], objects: [obj('o')], tokens: [token('t')] })
    expect(countKinds(map, ['a', 'b', 't', 'nope'])).toEqual({ walls: 2, objects: 0, tokens: 1 })
  })

  it('новым объектам — только если включено', () => {
    const map = baseMap({ objects: [obj('o')] })
    const p = setPaletteField(defaultPalette(), 'objects', { hidden: true })
    expect(withNewDefaults(map, 'o', p)).toBe(map)
    const on = { ...p, forNew: { ...p.forNew, objects: true } }
    expect(withNewDefaults(map, 'o', on).objects[0].hidden).toBe(true)
  })

  it('жетон героя палитра не трогает', () => {
    const map = baseMap({ tokens: [token('h', { character_id: 'c1', side: 'party' })] })
    const p = { ...setPaletteField(defaultPalette(), 'tokens', { side: 'enemies' }), forNew: { objects: false, tokens: true } }
    expect(withNewDefaults(map, 'h', p)).toBe(map)
  })
})
