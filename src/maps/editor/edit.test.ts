import { describe, expect, it } from 'vitest'
import { nextStampNumber } from './edit'

describe('nextStampNumber', () => {
  it('пусто — первый', () => {
    expect(nextStampNumber([], 'Гоблин')).toBe(1)
  })

  it('«Гоблин» и «Гоблин 2» — дальше третий', () => {
    expect(nextStampNumber(['Гоблин'], 'Гоблин')).toBe(2)
    expect(nextStampNumber(['Гоблин', 'Гоблин 2'], 'Гоблин')).toBe(3)
  })

  it('похожие подписи не считаются', () => {
    expect(nextStampNumber(['Гоблин', 'Гоблин-вожак', 'Гоблин-вожак 2', 'Гоблины', 'Гоблин 2 б'], 'Гоблин')).toBe(2)
  })

  it('после наибольшего номера, без повторов', () => {
    expect(nextStampNumber(['Гоблин', 'Гоблин 3'], 'Гоблин')).toBe(4)
  })

  it('спецсимволы в названии', () => {
    expect(nextStampNumber(['Волк (лютый)', 'Волк (лютый) 2', 'Волк Xлютый) 5'], 'Волк (лютый)')).toBe(3)
  })
})
