import { describe, expect, it } from 'vitest'
import type { CharacterCard, CreaturePlayerView, RoomCreature } from '../types/rooms'
import { BAND_LABEL, bandOf, creatureHealth, creatureLabel, healthText, heroHealth } from './health'

const VIS = { name: false, image: true, hp: 'band', ac: false, stats: false, actions: false, description: false } as const

const full = (over: Partial<RoomCreature> = {}): RoomCreature =>
  ({ id: 'c1', display_name: 'Ужасный лич', public_name: 'Тёмная фигура', hp_current: 30, hp_max: 100, hp_temp: 0, conditions: [], visibility: VIS, snapshot: {}, ...over }) as unknown as RoomCreature

const view = (over: Partial<CreaturePlayerView> = {}): CreaturePlayerView => ({ id: 'c1', name: 'Тёмная фигура', image_url: null, effects: [], ...over })

describe('bandOf', () => {
  it('matches server thresholds', () => {
    expect(bandOf(100, 100)).toBe('healthy')
    expect(bandOf(51, 100)).toBe('healthy')
    expect(bandOf(50, 100)).toBe('bloodied')
    expect(bandOf(26, 100)).toBe('bloodied')
    expect(bandOf(25, 100)).toBe('critical')
    expect(bandOf(1, 100)).toBe('critical')
    expect(bandOf(0, 100)).toBe('down')
    expect(bandOf(-3, 10)).toBe('down')
  })
  it('has Russian labels', () => {
    expect(Object.values(BAND_LABEL)).toEqual(['Невредим', 'Ранен', 'При смерти', 'Повержен'])
  })
})

describe('creatureHealth', () => {
  it('gives the DM exact numbers', () => {
    expect(creatureHealth(full(), true)).toMatchObject({ kind: 'exact', current: 30, max: 100, band: 'bloodied' })
  })
  it('never shows exact HP of a full creature to a player', () => {
    expect(creatureHealth(full(), false)).toEqual({ kind: 'band', ratio: 0.5, band: 'bloodied' })
    expect(creatureHealth(full({ visibility: { ...VIS, hp: 'hidden' } }), false)).toEqual({ kind: 'hidden' })
  })
  it('follows what the server opened in the player view', () => {
    expect(creatureHealth(view({ hp_band: 'critical' }), false)).toEqual({ kind: 'band', ratio: 0.25, band: 'critical' })
    expect(creatureHealth(view({ hp: { current: 5, max: 7, temp: 0 } }), false)).toMatchObject({ kind: 'exact', current: 5 })
    expect(creatureHealth(view(), false)).toEqual({ kind: 'hidden' })
  })
  it('band text does not reveal numbers', () => {
    const t = healthText(creatureHealth(view({ hp_band: 'bloodied' }), false))
    expect(t).toBe('Состояние: Ранен')
    expect(t).not.toMatch(/\d/)
  })
})

describe('names', () => {
  it('shows the public name to players and the real one to the DM', () => {
    expect(creatureLabel(full(), true)).toBe('Ужасный лич')
    expect(creatureLabel(full(), false)).toBe('Тёмная фигура')
    expect(creatureLabel(view(), false)).toBe('Тёмная фигура')
  })
})

describe('heroHealth', () => {
  it('is exact with temp', () => {
    const card = { hp: { current: 0, max: 20, temp: 4 } } as CharacterCard
    expect(heroHealth(card)).toMatchObject({ kind: 'exact', band: 'down', temp: 4, ratio: 0 })
  })
})
