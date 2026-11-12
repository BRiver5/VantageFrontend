import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../api'
import type { CombatTargetResult, CombatantView, CreaturePlayerView, RolledDice, RoomCreature } from '../../../types/rooms'
import { dealtBy, diceOf, effectsOf, errText, impactOf, landed, legendaryOf, nameOf, sizeK, verdictOf } from './combatMath'

const roll = (total: number, dice: RolledDice['dice'] = []): RolledDice => ({ expression: '', dice, modifier: 0, total, mode: null, discarded_total: null })

const target = (over: Partial<CombatTargetResult> = {}): CombatTargetResult => ({
  combatant_id: 'c1',
  hit: false,
  crit: false,
  saved: false,
  attack: null,
  save: null,
  damage: [],
  healed: null,
  effect: null,
  ...over,
})

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  id: 'c1',
  kind: 'creature',
  ref_id: 'r1',
  side: 'enemies',
  slot: 0,
  initiative: null,
  initiative_bonus: 0,
  defeated: false,
  hidden: false,
  ...over,
})

const playerView = (over: Partial<CreaturePlayerView> = {}): CreaturePlayerView => ({ id: 'cr', name: 'Гоблин', image_url: null, effects: [], ...over })

const fullCreature = (over: Partial<RoomCreature> = {}, snapshot: Record<string, unknown> = {}): RoomCreature =>
  ({ id: 'cr', display_name: 'Дракон', image_url: null, conditions: [], snapshot: { size: 'Huge', ...snapshot }, ...over }) as unknown as RoomCreature

describe('errText', () => {
  it('статусы ApiError переводятся в понятный текст', () => {
    expect(errText(new ApiError('x', 409))).toBe('Сейчас так нельзя: не ваш ход или бой изменился.')
    expect(errText(new ApiError('нет слота', 422))).toBe('Не получилось: нет слота')
    expect(errText(new ApiError('x', 404))).toBe('Цель или участник не найден.')
    expect(errText(new ApiError('сломалось', 500))).toBe('сломалось')
  })

  it('прочие ошибки', () => {
    expect(errText(new Error('упало'))).toBe('упало')
    expect(errText(42)).toBe('Ошибка сервера')
  })
})

describe('участник', () => {
  it('nameOf: карточка, существо, заглушка', () => {
    expect(nameOf(combatant({ card: { name: 'Арвен' } as CombatantView['card'] }))).toBe('Арвен')
    expect(nameOf(combatant({ creature: playerView() }))).toBe('Гоблин')
    expect(nameOf(combatant({ creature: fullCreature() }))).toBe('Дракон')
    expect(nameOf(combatant())).toBe('Участник')
  })

  it('sizeK по размеру существа', () => {
    expect(sizeK(combatant())).toBe(1)
    expect(sizeK(combatant({ creature: playerView({ size: 'Large' }) }))).toBe(1.32)
    expect(sizeK(combatant({ creature: playerView({ size: null }) }))).toBe(1)
    expect(sizeK(combatant({ creature: playerView({ size: 'Огромный' }) }))).toBe(1)
    expect(sizeK(combatant({ creature: fullCreature() }))).toBe(1.68)
  })

  it('effectsOf', () => {
    expect(effectsOf(combatant({ card: { effects: ['Благословение'] } as CombatantView['card'] }))).toEqual(['Благословение'])
    expect(effectsOf(combatant({ creature: playerView({ effects: ['Яд'] }) }))).toEqual(['Яд'])
    expect(effectsOf(combatant({ creature: fullCreature({ conditions: [{ label: 'Ослеплён' }] as RoomCreature['conditions'] }) }))).toEqual(['Ослеплён'])
    expect(effectsOf(combatant())).toEqual([])
  })

  it('legendaryOf у полного существа', () => {
    expect(legendaryOf(combatant())).toBeNull()
    expect(legendaryOf(combatant({ creature: fullCreature() }))).toBeNull()
    expect(legendaryOf(combatant({ creature: fullCreature({ legendary_actions: 3, legendary_actions_left: 1 }) }))).toEqual({ actions: 3, actionsLeft: 1, resist: 0, resistLeft: 0 })
    expect(legendaryOf(combatant({ creature: fullCreature({ legendary_resistances: 2 }) }))).toEqual({ actions: 0, actionsLeft: 0, resist: 2, resistLeft: 2 })
  })

  it('legendaryOf у игрового вида', () => {
    expect(legendaryOf(combatant({ creature: playerView() }))).toBeNull()
    const legendary = { actions: 3, actions_left: 2, resistances: 1, resistances_left: 0 }
    expect(legendaryOf(combatant({ creature: playerView({ legendary } as Partial<CreaturePlayerView>) }))).toEqual({ actions: 3, actionsLeft: 2, resist: 1, resistLeft: 0 })
  })
})

describe('кости', () => {
  it('diceOf: грани, прибавочные — с цветом', () => {
    expect(diceOf(null)).toEqual([])
    const faces = diceOf(roll(9, [{ sides: 6, sign: 1, rolls: [2, 3] }, { sides: 4, sign: 1, rolls: [4], source: 'Благословение' }]))
    expect(faces.map((f) => [f.sides, f.value])).toEqual([[6, 2], [6, 3], [4, 4]])
    expect(faces[0].color).toBeUndefined()
    expect(faces[2].color).toBeTruthy()
  })
})

describe('урон и вердикт', () => {
  it('dealtBy: taken → amount → итог броска', () => {
    const t = target({
      damage: [
        { roll: roll(10), type: 'fire', taken: 5 },
        { roll: roll(7), type: 'cold', amount: 3 },
        { roll: roll(4), type: null },
        { roll: roll(8), type: null, taken: null, amount: 6 },
        { roll: roll(9), type: null, taken: 0 },
      ],
    })
    expect(dealtBy(t)).toBe(5 + 3 + 4 + 6 + 0)
  })

  it('landed: попадание или без броска атаки', () => {
    expect(landed(target({ attack: roll(15), hit: true }))).toBe(true)
    expect(landed(target({ attack: roll(5), hit: false }))).toBe(false)
    expect(landed(target())).toBe(true)
  })

  it('verdictOf: атака', () => {
    expect(verdictOf(target({ attack: roll(5) }), 'k')).toEqual([{ id: 'k-v', text: '5 · Промах', tone: 'miss', delay: 0 }])
    expect(verdictOf(target({ attack: roll(17), hit: true }), 'k')[0]).toMatchObject({ text: '17 · Попал', tone: 'hit' })
    expect(verdictOf(target({ attack: roll(25), hit: true, crit: true }), 'k')[0]).toMatchObject({ text: '25 · Крит!', tone: 'crit' })
  })

  it('verdictOf: спасбросок и пусто', () => {
    expect(verdictOf(target({ save: roll(14), saved: true }), 'k')[0]).toMatchObject({ text: '14 · Спасся', tone: 'save' })
    expect(verdictOf(target({ save: roll(3) }), 'k')[0]).toMatchObject({ text: '3 · Не спасся', tone: 'miss' })
    expect(verdictOf(target(), 'k')).toEqual([])
  })

  it('impactOf: урон, лечение, эффект с нарастающей задержкой', () => {
    const t = target({ attack: roll(20), hit: true, crit: true, damage: [{ roll: roll(12), type: null }], healed: 4, effect: 'Горит' })
    expect(impactOf(t, 'k')).toEqual([
      { id: 'k-i0', text: '−12', tone: 'crit', delay: 0 },
      { id: 'k-i1', text: '+4', tone: 'heal', delay: 220 },
      { id: 'k-i2', text: 'Горит', tone: 'fx', delay: 440 },
    ])
  })

  it('impactOf: промах не показывает урон', () => {
    expect(impactOf(target({ attack: roll(3), damage: [{ roll: roll(6), type: null }] }), 'k')).toEqual([])
    expect(impactOf(target({ damage: [{ roll: roll(6), type: null }] }), 'k')).toEqual([{ id: 'k-i0', text: '−6', tone: 'dmg', delay: 0 }])
  })
})
