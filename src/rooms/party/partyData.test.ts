import { describe, expect, it } from 'vitest'
import type { BattleMap } from '../../maps/types'
import type { CharacterCard, CombatView, CombatantView } from '../../types/rooms'
import { durationText, effectsOfCard, myCombatants, nextUp, roundWord, selectParty, turnCue, turnKey } from './partyData'

const card = (id: string, over: Partial<CharacterCard> = {}): CharacterCard => ({ id, user_id: null, name: id, avatar_url: null, level: 1, ac: 12, hp: { current: 10, max: 10, temp: 0 }, effects: [], ...over })
const unit = (id: string, over: Partial<CombatantView> = {}): CombatantView => ({ id, kind: 'creature', ref_id: `r-${id}`, side: 'enemies', slot: 0, initiative: 10, initiative_bonus: 0, defeated: false, hidden: false, ...over })
const combat = (current: string | null, list: CombatantView[], over: Partial<CombatView> = {}): CombatView => ({ id: 'cb', status: 'active', round: 2, revision: 1, map_id: null, current_combatant_id: current, combatants: list, ...over })

describe('selectParty', () => {
  it('puts my hero first, finds tokens and the current turn', () => {
    const map = { tokens: [{ id: 't2', character_id: 'b' }] } as unknown as BattleMap
    const c = combat('u-b', [unit('u-b', { kind: 'character', ref_id: 'b' })])
    const out = selectParty([card('a'), card('b', { hp: { current: 0, max: 10, temp: 0 } })], { mine: 'b', map, combat: c })
    expect(out.map((m) => m.card.id)).toEqual(['b', 'a'])
    expect(out[0]).toMatchObject({ mine: true, tokenId: 't2', current: true, down: true })
    expect(out[1]).toMatchObject({ mine: false, tokenId: null, current: false })
  })
  it('keeps room order for the DM', () => {
    expect(selectParty([card('a'), card('b')], { mine: null, map: null, combat: null }).map((m) => m.card.id)).toEqual(['a', 'b'])
  })
})

describe('effects', () => {
  it('prefers detail with ids and falls back to labels', () => {
    expect(effectsOfCard(card('a', { effects: ['Отравлен'], effects_detail: [{ id: 'e1', label: 'Отравлен', expires: 'rounds', rounds_left: 3 }] }))[0].id).toBe('e1')
    expect(effectsOfCard(card('a', { effects: ['Отравлен'] }))).toEqual([{ id: '', label: 'Отравлен', expires: 'never', rounds_left: null }])
  })
  it('describes duration in Russian', () => {
    expect(durationText({ expires: 'rounds', rounds_left: 1 })).toBe('ещё 1 раунд')
    expect(durationText({ expires: 'rounds', rounds_left: 3 })).toBe('ещё 3 раунда')
    expect(durationText({ expires: 'rounds', rounds_left: 11 })).toBe('ещё 11 раундов')
    expect(durationText({ expires: 'save_ends', rounds_left: null })).toBe('до успешного спасброска')
    expect(durationText({ expires: 'weird', rounds_left: null })).toBe('пока не снимут')
    expect([21, 22, 25, 112].map(roundWord)).toEqual(['раунд', 'раунда', 'раундов', 'раундов'])
  })
})

describe('turn cues', () => {
  const list = [unit('a'), unit('b', { defeated: true }), unit('me', { kind: 'character', ref_id: 'h' }), unit('d')]
  it('finds the next living combatant, wrapping around', () => {
    expect(nextUp(list, 'a')?.id).toBe('me')
    expect(nextUp(list, 'd')?.id).toBe('a')
    expect(nextUp(list, null)).toBeNull()
    expect(nextUp([unit('solo')], 'solo')).toBeNull()
  })
  it('says "now" on my turn and "next" right before it', () => {
    const mine = new Set(['me'])
    expect(turnCue(combat('me', list), mine)).toBe('now')
    expect(turnCue(combat('a', list), mine)).toBe('next')
    expect(turnCue(combat('d', list), mine)).toBeNull()
    expect(turnCue(combat('a', list, { status: 'setup' }), mine)).toBeNull()
    expect(turnCue(combat(null, list), mine)).toBeNull()
    expect(turnCue(combat('a', list), new Set())).toBeNull()
  })
  it('changes key once per turn', () => {
    expect(turnKey(combat('a', list))).toBe('cb:2:a')
    expect(turnKey(combat('a', list, { round: 3 }))).toBe('cb:3:a')
    expect(turnKey(null)).toBeNull()
  })
  it('counts my hero and summons I control', () => {
    const c = combat('a', [unit('me', { kind: 'character', ref_id: 'h' }), unit('wolf', { controller_id: 'u1' }), unit('x')])
    expect([...myCombatants(c, { user_id: 'u1', room_character_id: 'h' })].sort()).toEqual(['me', 'wolf'])
  })
})
