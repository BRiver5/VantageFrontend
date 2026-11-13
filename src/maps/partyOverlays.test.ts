import { describe, expect, it } from 'vitest'
import type { CharacterCard, CombatView, CreaturePlayerView } from '../types/rooms'
import { maskTokenLabels, tokenHealth, turnTokenId } from './partyOverlays'
import type { BattleMap, MapToken } from './types'

const tk = (id: string, over: Partial<MapToken> = {}): MapToken => ({ id, label: id, x: 0, y: 0, elevation_ft: 0, size: 1, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: false, ...over })
const map = (tokens: MapToken[]): BattleMap => ({ id: 'm', tokens }) as unknown as BattleMap
const card = (id: string): CharacterCard => ({ id, user_id: null, name: id, avatar_url: null, level: 1, ac: 12, hp: { current: 5, max: 10, temp: 0 }, effects: [] })
const goblin: CreaturePlayerView = { id: 'cr1', name: 'Существо', image_url: null, effects: [], hp_band: 'critical' }

describe('maskTokenLabels', () => {
  it('replaces creature labels with the public name for players', () => {
    const m = map([tk('a', { creature_id: 'cr1', label: 'Гоблин-шаман' }), tk('b', { character_id: 'h1', label: 'Брина' })])
    const out = maskTokenLabels(m, [goblin], false)
    expect(out.tokens.map((t) => t.label)).toEqual(['Существо', 'Брина'])
    expect(m.tokens[0].label).toBe('Гоблин-шаман')
  })
  it('keeps the map untouched for the DM or when nothing changes', () => {
    const m = map([tk('a', { creature_id: 'cr1', label: 'Существо' })])
    expect(maskTokenLabels(m, [goblin], false)).toBe(m)
    expect(maskTokenLabels(m, [goblin], true)).toBe(m)
  })
})

describe('tokenHealth', () => {
  it('gives players only the band for enemies and exact HP for heroes', () => {
    const m = map([tk('a', { creature_id: 'cr1' }), tk('b', { character_id: 'h1' }), tk('c', { creature_id: 'gone' })])
    const h = tokenHealth(m, { characters: [card('h1')], creatures: [goblin], combat: null }, false)
    expect(h.a).toEqual({ kind: 'band', ratio: 0.25, band: 'critical' })
    expect(h.b).toMatchObject({ kind: 'exact', current: 5, max: 10 })
    expect(h.c).toBeUndefined()
  })
  it('skips creatures whose HP is hidden', () => {
    const m = map([tk('a', { creature_id: 'cr1' })])
    expect(tokenHealth(m, { characters: [], creatures: [{ ...goblin, hp_band: undefined }], combat: null }, false)).toEqual({})
  })
})

describe('turnTokenId', () => {
  const combat = (over: Partial<CombatView> = {}): CombatView => ({
    id: 'cb',
    status: 'active',
    round: 1,
    revision: 1,
    map_id: 'm',
    current_combatant_id: 'u2',
    combatants: [
      { id: 'u1', kind: 'character', ref_id: 'h1', side: 'party', slot: 0, initiative: 15, initiative_bonus: 0, defeated: false, hidden: false },
      { id: 'u2', kind: 'creature', ref_id: 'cr1', side: 'enemies', slot: 0, initiative: 10, initiative_bonus: 0, defeated: false, hidden: false },
    ],
    ...over,
  })
  it('finds the token by combatant or by its creature', () => {
    expect(turnTokenId(map([tk('a', { combatant_id: 'u2' })]), combat())).toBe('a')
    expect(turnTokenId(map([tk('b', { creature_id: 'cr1' })]), combat())).toBe('b')
  })
  it('is null outside an active turn', () => {
    const m = map([tk('a', { combatant_id: 'u2' })])
    expect(turnTokenId(m, combat({ status: 'setup' }))).toBeNull()
    expect(turnTokenId(m, combat({ current_combatant_id: null }))).toBeNull()
    expect(turnTokenId(m, null)).toBeNull()
  })
})
