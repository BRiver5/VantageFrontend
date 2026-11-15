import { describe, expect, it } from 'vitest'
import { cardEffects, CONDITIONS, describeEffect } from './effectDefs'
import { EFFECT_BY_CODE } from '../../rules/codes'

describe('describeEffect', () => {
  it('picks the sigil by code, falling back to the label', () => {
    expect(describeEffect('Сеть', { code: 'restrained' }).def.key).toBe('restrained')
    expect(describeEffect('Отравлен').def.key).toBe('poisoned')
    expect(describeEffect('отравление').code).toBe('poisoned')
    expect(describeEffect('Метка охотника').def.key).toBe('other')
  })
  it('strips the concentration prefix for the title', () => {
    expect(describeEffect('Концентрация: Невидимость').title).toBe('Невидимость')
    expect(describeEffect('Концентрация').title).toBe('Концентрация')
    expect(describeEffect('Держит щит', { code: 'concentration' }).title).toBe('Держит щит')
  })
  it('keys every sigil by a known code', () => {
    for (const c of CONDITIONS) expect(EFFECT_BY_CODE[c.key]?.ru).toBe(c.label)
  })
})

describe('cardEffects', () => {
  it('uses detail with codes, else labels zipped with effect_codes', () => {
    expect(cardEffects({ effects: ['А'], effects_detail: [{ id: '1', label: 'А', code: 'prone', expires: 'never', rounds_left: null }] })[0].code).toBe('prone')
    expect(cardEffects({ effects: ['А', 'Б'], effect_codes: ['dodge', null] })).toEqual([{ label: 'А', code: 'dodge' }, { label: 'Б', code: null }])
    expect(cardEffects({ effects: ['Отход'] })).toEqual([{ label: 'Отход', code: null }])
  })
})
