import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CombatActionResult } from '../types/rooms'
import { AutoAttackFx, damageOf, isMiss, missPoint, planAttackFx } from './attackFx'

describe('planAttackFx', () => {
  it('melee gesture by physical damage, colour by element', () => {
    expect(planAttackFx({ kind: 'attack', ranged: false, damageTypes: ['slashing'] })).toEqual({ gesture: 'slash', element: 'slashing', travel: null, impact: 'impact.slashing', melee: true })
    expect(planAttackFx({ kind: 'attack', ranged: false, damageTypes: ['piercing'] })?.gesture).toBe('thrust')
    expect(planAttackFx({ kind: 'attack', ranged: false, damageTypes: ['bludgeoning'] })?.gesture).toBe('smash')
    expect(planAttackFx({ kind: 'attack', ranged: false, damageTypes: ['slashing', 'fire'] })).toMatchObject({ gesture: 'slash', element: 'fire', impact: 'impact.fire' })
    expect(planAttackFx({ kind: 'attack', ranged: false, damageTypes: [] })).toMatchObject({ gesture: 'slash', element: 'slashing' })
  })
  it('ranged: projectile, beam or burst by element', () => {
    expect(planAttackFx({ kind: 'attack', ranged: true, damageTypes: ['piercing'] })).toEqual({ gesture: 'projectile', element: 'piercing', travel: 'projectile.piercing', impact: 'impact.piercing', melee: false })
    const table = [
      ['fire', 'projectile'],
      ['cold', 'projectile'],
      ['acid', 'projectile'],
      ['poison', 'projectile'],
      ['force', 'projectile'],
      ['lightning', 'beam'],
      ['radiant', 'beam'],
      ['necrotic', 'beam'],
    ] as const
    for (const [el, g] of table) expect(planAttackFx({ kind: 'spell', ranged: true, damageTypes: [el] })).toMatchObject({ gesture: g, travel: `${g}.${el}`, impact: `impact.${el}` })
    for (const el of ['psychic', 'thunder']) expect(planAttackFx({ kind: 'spell', ranged: true, damageTypes: [el] })).toEqual({ gesture: 'burst', element: el, travel: null, impact: `burst.${el}`, melee: false })
  })
  it('without the ranged flag guesses by distance', () => {
    expect(planAttackFx({ kind: 'attack', damageTypes: ['piercing'], distanceFt: 5 })?.melee).toBe(true)
    expect(planAttackFx({ kind: 'attack', damageTypes: ['piercing'], distanceFt: 60 })?.gesture).toBe('projectile')
  })
  it('an explicit preset wins', () => {
    expect(planAttackFx({ kind: 'attack', ranged: true, damageTypes: ['fire'], vfx: 'beam.fire' })).toMatchObject({ gesture: 'beam', travel: 'beam.fire', impact: 'impact.fire' })
    expect(planAttackFx({ kind: 'attack', ranged: false, damageTypes: ['slashing'], vfx: 'impact.radiant' })).toMatchObject({ gesture: 'slash', travel: null, impact: 'impact.radiant', melee: true })
    expect(planAttackFx({ kind: 'other', ranged: true, damageTypes: [], vfx: 'burst.arcane' })).toMatchObject({ gesture: 'burst', impact: 'burst.arcane' })
  })
  it('healing and actions without damage', () => {
    expect(planAttackFx({ kind: 'spell', ranged: true, damageTypes: [], healed: true })).toMatchObject({ impact: 'heal.heal', travel: null })
    expect(planAttackFx({ kind: 'ability', ranged: true, damageTypes: [] })).toBeNull()
  })
})

describe('miss and damage helpers', () => {
  it('a miss lands behind and beside the target', () => {
    const p = missPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 1)
    expect(p.x).toBeCloseTo(160)
    expect(p.y).toBeCloseTo(30)
    expect(missPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, -1).y).toBeCloseTo(-30)
    expect(missPoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 50, 1)).toEqual({ x: 35, y: 5 })
  })
  type Row = CombatActionResult['targets'][number]
  const row = (over: Partial<Row>): Row => ({ combatant_id: 'b', hit: true, crit: false, saved: false, attack: null, save: null, damage: [], healed: null, effect: null, ...over })
  const roll = (total: number) => ({ expression: '', dice: [], modifier: 0, total, mode: null, discarded_total: null })
  it('sums damage and detects misses', () => {
    expect(
      damageOf(
        row({
          damage: [
            { roll: roll(5), type: 'fire', taken: 3 },
            { roll: roll(4), type: 'fire' },
          ],
        }),
      ),
    ).toBe(7)
    expect(isMiss(row({ attack: roll(3), hit: false }))).toBe(true)
    expect(isMiss(row({ attack: roll(18), hit: true }))).toBe(false)
    expect(isMiss(row({ save: roll(15), saved: true }))).toBe(true)
    expect(isMiss(row({ save: roll(15), saved: true, damage: [{ roll: roll(4), type: 'fire', amount: 4 }] }))).toBe(false)
  })
})

describe('AutoAttackFx', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  const res = (kind: string, label = 'Огненный снаряд'): CombatActionResult => ({ action_id: 'x', actor_combatant_id: 'a', kind, label, secret: false, targets: [] })
  it('plays attacks at once, waits for spells and drops them when map.vfx arrives', () => {
    vi.useFakeTimers()
    const played: string[] = []
    const q = new AutoAttackFx((r) => played.push(r.kind), 400)
    q.action(res('attack', 'Меч'))
    expect(played).toEqual(['attack'])
    q.action(res('spell'))
    q.action(res('spell'))
    q.vfx({ actor_combatant_id: 'a', spell: 'Огненный снаряд' })
    vi.advanceTimersByTime(500)
    expect(played).toEqual(['attack'])
    q.action(res('spell', 'Шквал'))
    vi.advanceTimersByTime(500)
    expect(played).toEqual(['attack', 'spell'])
    q.action(res('spell', 'Шквал'))
    q.dispose()
    vi.advanceTimersByTime(500)
    expect(played).toHaveLength(2)
  })
})
