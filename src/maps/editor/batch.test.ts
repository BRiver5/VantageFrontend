import { describe, expect, it } from 'vitest'
import type { BattleMap, MapLight, MapWall } from '../types'
import { applyBatch, diffBatch, errText, uid } from './batch'

const wall = (id: string, x = 0): MapWall => ({
  id,
  a: { x, y: 0 },
  b: { x, y: 10 },
  kind: 'wall',
  height_ft: 10,
  base_ft: 0,
  blocks: { move: true, sight: true, light: true, sound: true },
})

const light = (id: string, bright = 20): MapLight => ({
  id,
  x: 0,
  y: 0,
  elevation_ft: 0,
  bright_ft: bright,
  dim_ft: bright * 2,
  angle: 360,
  rotation: 0,
  flicker: false,
  enabled: true,
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

describe('uid / errText', () => {
  it('uid с префиксом и случайным хвостом', () => {
    const a = uid('w')
    expect(a).toMatch(/^w_[0-9a-z]{1,8}$/)
    expect(uid('w')).not.toBe(a)
  })

  it('errText', () => {
    expect(errText(new Error('упало'))).toBe('упало')
    expect(errText('строка')).toBe('Не получилось')
  })
})

describe('diffBatch', () => {
  it('одинаковые карты — null', () => {
    const m = baseMap({ walls: [wall('a')] })
    expect(diffBatch(m, structuredClone(m))).toBeNull()
  })

  it('add / update / remove по видам, пустые ключи не попадают', () => {
    const saved = baseMap({ walls: [wall('a'), wall('b')], lights: [light('l1')] })
    const cur = baseMap({ walls: [wall('a', 5), wall('c')], lights: [light('l1')] })
    expect(diffBatch(saved, cur)).toEqual({ walls: { add: [wall('c')], update: [wall('a', 5)], remove: ['b'] } })
  })

  it('учитывает необязательные виды (triggers отсутствуют в исходной)', () => {
    const cur = baseMap({ triggers: [{ id: 't1' } as never] })
    expect(diffBatch(baseMap(), cur)).toEqual({ triggers: { add: [{ id: 't1' }] } })
  })
})

describe('applyBatch', () => {
  it('не мутирует исходную карту', () => {
    const fresh = baseMap({ walls: [wall('a')] })
    const copy = structuredClone(fresh)
    applyBatch(fresh, { walls: { remove: ['a'], add: [wall('b')] } })
    expect(fresh).toEqual(copy)
  })

  it('удаление, замена на месте, добавление в конец', () => {
    const fresh = baseMap({ walls: [wall('a'), wall('b'), wall('c')] })
    const out = applyBatch(fresh, { walls: { remove: ['a'], update: [wall('c', 9)], add: [wall('d')] } })
    expect(out.walls).toEqual([wall('b'), wall('c', 9), wall('d')])
  })

  it('обновление удалённого на сервере объекта не воскрешает его', () => {
    const out = applyBatch(baseMap({ walls: [wall('b')] }), { walls: { update: [wall('a', 3)] } })
    expect(out.walls).toEqual([wall('b')])
  })

  it('поля вне KINDS (revision) не трогает', () => {
    expect(applyBatch(baseMap({ revision: 7 }), { revision: 1 }).revision).toBe(7)
  })
})

describe('diffBatch → applyBatch', () => {
  it('roundtrip: saved + diff(saved, cur) = cur (новые в конце)', () => {
    const saved = baseMap({ walls: [wall('a'), wall('b'), wall('c')], lights: [light('l1'), light('l2')] })
    const cur = baseMap({ walls: [wall('a'), wall('c', 4), wall('d')], lights: [light('l2', 40)], triggers: [{ id: 't' } as never] })
    const batch = diffBatch(saved, cur)
    expect(batch).not.toBeNull()
    expect(applyBatch(saved, batch!)).toEqual(cur)
  })

  it('пакет поверх чужой свежей версии сохраняет чужие правки', () => {
    const saved = baseMap({ walls: [wall('a')] })
    const mine = baseMap({ walls: [wall('a'), wall('mine')] })
    const fresh = baseMap({ revision: 2, walls: [wall('a'), wall('theirs')] })
    const out = applyBatch(fresh, diffBatch(saved, mine)!)
    expect(out.walls.map((w) => w.id)).toEqual(['a', 'theirs', 'mine'])
    expect(out.revision).toBe(2)
  })
})
