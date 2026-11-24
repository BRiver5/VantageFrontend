import { describe, expect, it } from 'vitest'
import { splitBackgroundText } from './backgroundText'

describe('splitBackgroundText', () => {
  it('шапка 2024 отделяется от рассказа', () => {
    const r = splitBackgroundText('Характеристики: Телосложение, Мудрость\nЧерта: Лекарь\nСнаряжение: (А) Посох; или (Б) 50 ЗМ\n\nВы провели ранние годы в одиночестве.')
    expect(r.header).toEqual({ Характеристики: 'Телосложение, Мудрость', Черта: 'Лекарь', Снаряжение: '(А) Посох; или (Б) 50 ЗМ' })
    expect(r.lore).toBe('Вы провели ранние годы в одиночестве.')
  })

  it('текст без шапки — как есть', () => {
    expect(splitBackgroundText('Просто рассказ.')).toEqual({ header: {}, lore: 'Просто рассказ.' })
  })
})
