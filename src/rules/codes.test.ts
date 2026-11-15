import { describe, expect, it } from 'vitest'
import { codeOf, concentrationSpell, DAMAGE_TYPES, damageCode, EFFECTS, effectCode, effectLabel, isIncapacitated } from './codes'
import parity from './codesParity.json'

// Та же таблица — tests/rules/codes_parity.json на сервере (tests/rules/test_codes.py)

describe('codes parity with the server', () => {
  it('has the same effect and damage-type tables', () => {
    expect(EFFECTS).toEqual(parity.effects)
    expect(DAMAGE_TYPES).toEqual(parity.damage_types)
  })
  it('parses label variants the same way', () => {
    for (const [label, code] of parity.parse) expect([label, effectCode(label)]).toEqual([label, code])
  })
  it('parses damage types the same way', () => {
    for (const [text, code] of parity.damage_parse) expect([text, damageCode(text)]).toEqual([text, code])
  })
  it('extracts the spell from a concentration label', () => {
    for (const [label, spell] of parity.concentration_spell) expect(concentrationSpell(label as string)).toBe(spell)
  })
})

describe('codeOf', () => {
  it('prefers the explicit code and falls back to the label', () => {
    expect(codeOf({ label: 'Удержание личности', code: 'paralyzed' })).toBe('paralyzed')
    expect(codeOf({ label: 'Отравлен' })).toBe('poisoned')
    expect(codeOf({ label: 'Отравлен', code: null })).toBe('poisoned')
    expect(codeOf('Метка охотника')).toBeNull()
  })
  it('knows incapacitating conditions', () => {
    expect(isIncapacitated([{ label: 'Сеть', code: 'restrained' }, 'Ошеломлён'])).toBe(true)
    expect(isIncapacitated(['Опутан', { label: 'Проклят' }])).toBe(false)
  })
  it('gives labels by code', () => {
    expect(effectLabel('prone')).toBe('Сбит с ног')
    expect(effectLabel('prone', 'en')).toBe('Prone')
    expect(effectLabel('custom')).toBe('custom')
  })
})
