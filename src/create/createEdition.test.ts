import { describe, expect, it } from 'vitest'
import {
  childEdition,
  editionFromSearch,
  keptChoiceNote,
  mixedSteps,
  newHeroHref,
  stepEdition,
  withHeroEdition,
  withStepEdition,
} from './createEdition'
import { initialDraft } from './draft'
import { draftToInput } from './deriveCharacter'
import { emptySheetView } from '../types/character'

describe('редакция нового героя', () => {
  it('«Новый герой» передаёт редакцию в адрес, конструктор её читает', () => {
    expect(newHeroHref('2014')).toBe('/characters/new?ed=2014')
    expect(editionFromSearch('?ed=2014')).toBe('2014')
    expect(editionFromSearch(new URL(`http://x${newHeroHref('2024')}`).search)).toBe('2024')
  })

  it('без ?ed= или с мусором — 2024', () => {
    expect(editionFromSearch('')).toBe('2024')
    expect(editionFromSearch('?ed=1999')).toBe('2024')
  })

  it('черновик и тело создания несут редакцию героя', () => {
    const d = initialDraft('private', '2014')
    expect(d.edition).toBe('2014')
    expect(draftToInput(d, emptySheetView()).edition).toBe('2014')
    expect(draftToInput(initialDraft('private'), emptySheetView()).edition).toBe('2024')
  })

  it('смешанный герой: записи уходят со своими id', () => {
    const d = {
      ...initialDraft('private', '2024'),
      race: { id: 'race-2014' } as never,
      cls: { id: 'class-2024' } as never,
      catalogEditions: { races: '2014' as const },
    }
    const input = draftToInput(d, emptySheetView())
    expect(input.edition).toBe('2024')
    expect(input.race_id).toBe('race-2014')
    expect(input.classes?.[0]?.class_id).toBe('class-2024')
  })
})

describe('редакция каталога шага', () => {
  const base = { edition: '2024' as const, catalogEditions: {} }

  it('по умолчанию — редакция героя', () => {
    expect(stepEdition(base, 'races')).toBe('2024')
    expect(stepEdition({ edition: '2014', catalogEditions: {} }, 'spells')).toBe('2014')
  })

  it('шаг переключается сам по себе', () => {
    const d = { ...base, ...withStepEdition(base, 'races', '2014') }
    expect(stepEdition(d, 'races')).toBe('2014')
    expect(stepEdition(d, 'classes')).toBe('2024')
    expect(mixedSteps(d)).toEqual(['races'])
  })

  it('вернули шаг к редакции героя — переопределение снято', () => {
    const d = { ...base, ...withStepEdition(base, 'races', '2014') }
    expect(withStepEdition(d, 'races', '2024').catalogEditions).toEqual({})
  })

  it('смена редакции героя: шаги без переопределения идут следом, совпавшие снимаются', () => {
    const d = { edition: '2024' as const, catalogEditions: { races: '2014' as const, feats: '2014' as const } }
    const to14 = withHeroEdition(d, '2014')
    expect(to14).toEqual({ edition: '2014', catalogEditions: {} })
    expect(stepEdition(to14, 'classes')).toBe('2014')
    const back = withHeroEdition({ edition: '2014', catalogEditions: { classes: '2024' } }, '2024')
    expect(back.catalogEditions).toEqual({})
    const kept = withHeroEdition({ edition: '2024', catalogEditions: { races: '2014' } }, '2024')
    expect(stepEdition(kept, 'races')).toBe('2014')
  })

  it('подрасы и подклассы — в редакции шага, если запись в ней есть', () => {
    expect(childEdition({ editions: ['2014', '2024'] }, '2024')).toBe('2024')
    expect(childEdition({ editions: ['2014'] }, '2024')).toBe('2014')
    expect(childEdition({ editions: null }, '2024')).toBe('2014')
    expect(childEdition(null, '2024')).toBe('2024')
  })

  it('выбранная запись не из показанного каталога — подсказка, что выбор сохранён', () => {
    expect(keptChoiceNote('Дварф', false)).toBe('выбрано: Дварф')
    expect(keptChoiceNote('Дварф', true)).toBeNull()
    expect(keptChoiceNote(null, false)).toBeNull()
  })
})
