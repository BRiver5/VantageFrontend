import { describe, expect, it } from 'vitest'
import { bestScore, fuzzyScore, rankByQuery, swapLayout } from './fuzzy'

const items = [
  { label: 'Открыть мой лист', keywords: ['персонаж'] },
  { label: 'К столу и карте', keywords: ['map'] },
  { label: 'Линейка: включить или выключить', keywords: ['ruler'] },
  { label: 'Пауза' },
  { label: 'Таблицы случайных результатов' },
  { label: 'Разместить существо', keywords: ['монстр'] },
]

describe('нечёткий поиск палитры', () => {
  it('буквы по порядку, не обязательно подряд', () => {
    expect(fuzzyScore('отлис', 'Открыть мой лист')).not.toBeNull()
    expect(fuzzyScore('тсило', 'Открыть мой лист')).toBeNull()
    expect(fuzzyScore('', 'что угодно')).toBe(0)
  })

  it('подряд и с начала слова — выше', () => {
    expect(fuzzyScore('лист', 'Открыть мой лист')!).toBeGreaterThan(fuzzyScore('лсит', 'Открыть мой лист и стол') ?? -Infinity)
    expect(fuzzyScore('пау', 'Пауза')!).toBeGreaterThan(fuzzyScore('пау', 'Показать участникам')!)
  })

  it('регистр, ё и неверная раскладка не мешают', () => {
    expect(fuzzyScore('ЛИНЕЙКА', 'Линейка')).not.toBeNull()
    expect(fuzzyScore('еж', 'Ёжик')).not.toBeNull()
    expect(swapLayout('kbytqrf')).toBe('линейка')
    expect(bestScore('kbytqrf', ['Линейка'])).not.toBeNull()
  })

  it('ранжирует, учитывает ключевые слова, пустой запрос — исходный порядок', () => {
    expect(rankByQuery('лин', items)[0].label).toMatch(/Линейка/)
    expect(rankByQuery('монстр', items)[0].label).toBe('Разместить существо')
    expect(rankByQuery('ruler', items)[0].label).toMatch(/Линейка/)
    expect(rankByQuery('', items).map((i) => i.label)).toEqual(items.map((i) => i.label))
    expect(rankByQuery('ъъъ', items)).toEqual([])
    expect(rankByQuery('а', items, 2)).toHaveLength(2)
  })
})
