import { describe, expect, it, vi } from 'vitest'
import type { MapToken } from '../types'
import { heroVitals, parseHpInput } from './hpInput'
import { anyManage, hudPermissions, subjectOf } from './permissions'
import { createTargetStore, MAX_TARGETS, targetCombatants, tokensInBox } from './targets'

const tok = (id: string, extra: Partial<MapToken> = {}): MapToken =>
  ({ id, label: id, x: 0, y: 0, elevation_ft: 0, size: 1, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: false, dormant: false, ...extra }) as MapToken

describe('target store', () => {
  it('toggles, adds without duplicates, removes and clears', () => {
    const s = createTargetStore()
    const fn = vi.fn()
    s.subscribe(fn)
    s.toggle('a')
    s.add(['a', 'b'])
    expect(s.get()).toEqual(['a', 'b'])
    s.toggle('a')
    expect(s.get()).toEqual(['b'])
    s.remove(['b'])
    expect(s.get()).toEqual([])
    s.clear()
    expect(fn).toHaveBeenCalledTimes(4) // последний clear ничего не менял
  })

  it('keeps the same snapshot when nothing changed and prunes dead tokens', () => {
    const s = createTargetStore()
    s.set(['a', 'b', 'c'])
    const snap = s.get()
    s.add(['a'])
    expect(s.get()).toBe(snap)
    s.prune(['a', 'c'])
    expect(s.get()).toEqual(['a', 'c'])
  })

  it('caps the number of targets', () => {
    const s = createTargetStore()
    s.set(Array.from({ length: MAX_TARGETS + 5 }, (_, i) => `t${i}`))
    expect(s.get()).toHaveLength(MAX_TARGETS)
  })

  it('maps targets to combatants and box-selects visible tokens', () => {
    const tokens = [tok('a', { combatant_id: 'c1', x: 10, y: 10 }), tok('b', { x: 50, y: 50 }), tok('h', { x: 20, y: 20, hidden: true, combatant_id: 'c3' })]
    expect(targetCombatants(tokens, ['b', 'a', 'gone'])).toEqual(['c1'])
    expect(tokensInBox(tokens, { x: 60, y: 60 }, { x: 0, y: 0 }, false)).toEqual(['a', 'b'])
    expect(tokensInBox(tokens, { x: 0, y: 0 }, { x: 30, y: 30 }, true)).toEqual(['a', 'h'])
  })
})

describe('parseHpInput', () => {
  it.each([
    ['-7', { op: 'damage', amount: 7 }],
    ['−7', { op: 'damage', amount: 7 }],
    [' + 5 ', { op: 'heal', amount: 5 }],
    ['=12', { op: 'set', amount: 12 }],
    ['12', { op: 'set', amount: 12 }],
    ['0', { op: 'set', amount: 0 }],
    ['в5', { op: 'temp', amount: 5 }],
    ['t5', { op: 'temp', amount: 5 }],
  ])('%s', (text, want) => expect(parseHpInput(text)).toEqual(want))

  it.each(['', '-', '-0', '+0', 'abc', '5-', '1.5', '--3', '12345'])('rejects %j', (text) => expect(parseHpInput(text)).toBeNull())

  it('turns «set» into damage or heal for a hero', () => {
    expect(heroVitals({ op: 'set', amount: 10 }, { current: 15, temp: 0 })).toEqual({ op: 'damage', amount: 5 })
    expect(heroVitals({ op: 'set', amount: 20 }, { current: 15, temp: 0 })).toEqual({ op: 'heal', amount: 5 })
    expect(heroVitals({ op: 'set', amount: 15 }, { current: 15, temp: 0 })).toBeNull()
    expect(heroVitals({ op: 'set', amount: 10 }, { current: 15, temp: 3 })).toHaveProperty('error')
    expect(heroVitals({ op: 'damage', amount: 4 }, { current: 15, temp: 3 })).toEqual({ op: 'damage', amount: 4 })
  })
})

describe('hud permissions', () => {
  const hero = tok('h', { character_id: 'ch1' })
  const goblin = tok('g', { creature_id: 'cr1', hidden: true })
  const owners = { ch1: 'u1' }
  const live = { live: true, combatantId: null }

  it('gives the DM everything on linked tokens', () => {
    const p = hudPermissions(goblin, subjectOf(goblin, owners), live, { isDm: true, userId: 'dm' })
    expect(p).toEqual({ hp: true, effects: true, elevation: true, target: true, combat: true, hide: true })
  })

  it('lets the owner change only hero hit points and targets', () => {
    const p = hudPermissions(hero, subjectOf(hero, owners), live, { isDm: false, userId: 'u1' })
    expect(p).toEqual({ hp: true, effects: false, elevation: false, target: true, combat: false, hide: false })
    expect(anyManage(p)).toBe(true)
  })

  it('gives other players only targeting, and not on hidden tokens', () => {
    const p = hudPermissions(hero, subjectOf(hero, owners), live, { isDm: false, userId: 'u2' })
    expect(anyManage(p)).toBe(false)
    expect(p.target).toBe(true)
    expect(hudPermissions(goblin, subjectOf(goblin, owners), live, { isDm: false, userId: 'u2' }).target).toBe(false)
  })

  it('hides combat and linked actions without a fight or a link', () => {
    const plain = tok('p')
    const p = hudPermissions(plain, subjectOf(plain, owners), { live: false, combatantId: null }, { isDm: true, userId: 'dm' })
    expect(p).toMatchObject({ hp: false, effects: false, combat: false, elevation: true, hide: true })
  })
})
