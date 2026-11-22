import { describe, expect, it } from 'vitest'
import {
  backgroundAsiMode,
  backgroundAsiOptions,
  backgroundBonuses,
  bgAsiAnswer,
  evenBackgroundAsi,
  originAsiNote,
  pickTwoOne,
} from './originAsi'
import { initialDraft } from './draft'
import { finalScores, originBonuses } from './deriveCharacter'
import { bgAsiPromptAnswer } from './autoDecisions'
import type { Prompt } from '../types/character'

const bg2024 = { ability_score_options: ['str', 'dex', 'cha'], ability_score_patterns: [[2, 1], [1, 1, 1]] }
const bg2014 = { ability_score_options: [], ability_score_patterns: [] }
const opt = (v: string) => ({ value: v, label: v })

describe('повышение характеристик предыстории 2024', () => {
  it('варианты — из полей предыстории; у 2014 их нет', () => {
    expect(backgroundAsiOptions(bg2024)).toEqual({ abilities: ['strength', 'dexterity', 'charisma'], modes: ['2,1', '1,1,1'] })
    expect(backgroundAsiOptions(bg2014)).toBeNull()
    expect(backgroundAsiOptions(null)).toBeNull()
  })

  it('засчитывается только распределение по схеме и среди своих характеристик', () => {
    expect(backgroundAsiMode(bg2024, { strength: 2, dexterity: 1 })).toBe('2,1')
    expect(backgroundAsiMode(bg2024, { strength: 1, dexterity: 1, charisma: 1 })).toBe('1,1,1')
    expect(backgroundAsiMode(bg2024, { strength: 2 })).toBeNull()
    expect(backgroundAsiMode(bg2024, { wisdom: 2, dexterity: 1 })).toBeNull()
    expect(backgroundBonuses(bg2024, { strength: 2 })).toEqual({})
    expect(backgroundBonuses(bg2014, { strength: 2, dexterity: 1 })).toEqual({})
  })

  it('«+2 и +1»: у каждого значения один владелец', () => {
    let asi = pickTwoOne({}, 'strength', 2)
    asi = pickTwoOne(asi, 'dexterity', 1)
    expect(asi).toEqual({ strength: 2, dexterity: 1 })
    asi = pickTwoOne(asi, 'charisma', 2)
    expect(asi).toEqual({ charisma: 2, dexterity: 1 })
    asi = pickTwoOne(asi, 'dexterity', 2)
    expect(asi).toEqual({ dexterity: 2 })
    expect(pickTwoOne(evenBackgroundAsi(backgroundAsiOptions(bg2024)!), 'strength', 2)).toEqual({ strength: 2, dexterity: 1 })
    expect(pickTwoOne({ strength: 2, dexterity: 1 }, 'strength', 0)).toEqual({ dexterity: 1 })
  })

  it('ответ на выбор bg_asi сервера', () => {
    expect(bgAsiAnswer(bg2024, { dexterity: 1, strength: 2 })).toEqual({ mode: '2,1', a: 'str', b: 'dex' })
    expect(bgAsiAnswer(bg2024, evenBackgroundAsi(backgroundAsiOptions(bg2024)!))).toEqual({ mode: '1,1,1', a: 'str', b: 'dex', c: 'cha' })
    expect(bgAsiAnswer(bg2024, {})).toBeNull()
    const prompt: Prompt = {
      key: 'bg_asi',
      title: '',
      inputs: [
        { key: 'mode', label: '', type: 'choice', required: true, options: [opt('2,1'), opt('1,1,1')] },
        ...['a', 'b', 'c'].map((key) => ({ key, label: '', type: 'choice', required: false, options: ['str', 'dex', 'cha'].map(opt) })),
      ],
    }
    expect(bgAsiPromptAnswer(prompt, { mode: '2,1', a: 'str', b: 'dex' })).toEqual({ mode: '2,1', a: 'str', b: 'dex' })
    expect(bgAsiPromptAnswer(prompt, { mode: '2,1', a: 'wis', b: 'dex' })).toBeNull()
    // поп-ап ASI класса (plus2 / plus11) — не наш
    const classAsi: Prompt = { ...prompt, inputs: [{ key: 'mode', label: '', type: 'choice', required: true, options: [opt('plus2'), opt('plus11')] }] }
    expect(bgAsiPromptAnswer(classAsi, { mode: '2,1', a: 'str', b: 'dex' })).toBeNull()
  })

  it('смешанный герой: раса 2014 и предыстория 2024 — оба источника в итоге', () => {
    const d = {
      ...initialDraft('private', '2024'),
      race: { id: 'r', increase_ability_scores: { Сила: 2, Телосложение: 1 } } as never,
      background: { id: 'b', ...bg2024 } as never,
      backgroundAsi: { dexterity: 2, charisma: 1 },
      baseScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    }
    expect(originBonuses(d)).toEqual({ strength: 2, constitution: 1, dexterity: 2, charisma: 1 })
    expect(finalScores(d)).toMatchObject({ strength: 12, constitution: 11, dexterity: 12, charisma: 11, wisdom: 10 })
  })

  it('подсказка: оба источника, ни одного, или всё как обычно', () => {
    const both = { racial: { strength: 2 }, hasRace: true, hasBackground: true, background: bg2024 }
    expect(originAsiNote(both)).toBe('both')
    expect(originAsiNote({ ...both, racial: {}, background: bg2014 })).toBe('none')
    expect(originAsiNote({ ...both, racial: {}, raceFlexible: true, background: bg2014 })).toBeNull()
    expect(originAsiNote({ ...both, racial: {} })).toBeNull()
    expect(originAsiNote({ ...both, background: bg2014 })).toBeNull()
    expect(originAsiNote({ ...both, hasBackground: false })).toBeNull()
  })
})
