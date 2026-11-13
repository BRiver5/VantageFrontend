import { describe, expect, it } from 'vitest'
import type { CharacterCard, CombatView, CreaturePlayerView, RoomCreature } from '../types/rooms'
import { isAnimated, lookOf, tokenLooks } from './tokenLooks'
import type { BattleMap, MapToken } from './types'

const tk = (id: string, over: Partial<MapToken> = {}): MapToken => ({ id, label: id, x: 0, y: 0, elevation_ft: 0, size: 1, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: false, ...over })
const map = (tokens: MapToken[]): BattleMap => ({ id: 'm', tokens }) as unknown as BattleMap
const card = (id: string, effects: string[], hp = 5): CharacterCard => ({ id, user_id: null, name: id, avatar_url: null, level: 1, ac: 12, hp: { current: hp, max: 10, temp: 0 }, effects })

describe('lookOf', () => {
  it('maps condition labels through the table', () => {
    expect(lookOf(['Невидимость'])).toEqual({ invisible: true })
    expect(lookOf(['Отравлен'])).toEqual({ poisoned: true })
    expect(lookOf(['Парализован'])).toEqual({ grey: true })
    expect(lookOf(['Окаменение'])).toEqual({ stone: true })
    expect(lookOf(['Испуган'])).toEqual({ frightened: true })
    expect(lookOf(['Концентрация: Благословение'])).toEqual({ concentration: true })
    expect(lookOf(['Сбит с ног'])).toEqual({ prone: true })
    expect(lookOf(['Без сознания'])).toEqual({ prone: true, grey: true })
  })
  it('knows burning and ignores unrelated effects', () => {
    expect(lookOf(['Горит'])).toEqual({ burning: true })
    expect(lookOf(['в огне'])).toEqual({ burning: true })
    expect(lookOf(['Благословение', 'Оглох', ''])).toBeNull()
  })
  it('defeated wins over prone and grey; a downed hero lies grey', () => {
    expect(lookOf(['Сбит с ног', 'Отравлен'], { defeated: true })).toEqual({ dead: true, poisoned: true })
    expect(lookOf([], { down: true })).toEqual({ prone: true, grey: true })
  })
  it('tells animated looks apart', () => {
    expect(isAnimated({ grey: true })).toBe(false)
    expect(isAnimated({ grey: true, burning: true })).toBe(true)
    expect(isAnimated(null)).toBe(false)
  })
})

describe('tokenLooks', () => {
  it('reads heroes, player-view creatures, full creatures and defeated combatants', () => {
    const goblin: CreaturePlayerView = { id: 'cr1', name: 'Существо', image_url: null, effects: ['Отравлен'], hp_band: 'critical' }
    const ogre = { id: 'cr2', snapshot: {}, hp_current: 0, hp_max: 50, conditions: [] } as unknown as RoomCreature
    const wolf: CreaturePlayerView = { id: 'cr3', name: 'Волк', image_url: null, effects: [] }
    const combat = { id: 'c', status: 'active', combatants: [{ id: 'u3', kind: 'creature', ref_id: 'cr3', defeated: true }] } as unknown as CombatView
    const m = map([tk('a', { character_id: 'h1' }), tk('b', { creature_id: 'cr1' }), tk('c', { creature_id: 'cr2' }), tk('d', { combatant_id: 'u3' }), tk('e', { character_id: 'h2' }), tk('f')])
    const looks = tokenLooks(m, { characters: [card('h1', ['Невидим']), card('h2', [], 0)], creatures: [goblin, ogre, wolf], combat })
    expect(looks).toEqual({ a: { invisible: true }, b: { poisoned: true }, c: { dead: true }, d: { dead: true }, e: { prone: true, grey: true } })
  })
})
