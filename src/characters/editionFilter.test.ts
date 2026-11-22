import { describe, expect, it } from 'vitest'
import {
  countByEdition,
  editionEmptyText,
  editionFilterOptions,
  heroEdition,
  matchesEditionFilter,
  sanitizeEditionFilter,
} from './editionFilter'

const heroes = [{ edition: '2024' }, { edition: '2014' }, {}, { edition: null }, { edition: '2024' }]

describe('фильтр героев по редакции', () => {
  it('без поля редакции — 2014', () => {
    expect(heroEdition({})).toBe('2014')
    expect(heroEdition({ edition: null })).toBe('2014')
    expect(heroEdition({ edition: 'мусор' })).toBe('2014')
    expect(heroEdition({ edition: '2024' })).toBe('2024')
  })

  it('считает героев по редакциям', () => {
    expect(countByEdition(heroes)).toEqual({ all: 5, '2014': 3, '2024': 2 })
    expect(countByEdition([])).toEqual({ all: 0, '2014': 0, '2024': 0 })
  })

  it('отбирает героев по фильтру', () => {
    expect(heroes.filter((h) => matchesEditionFilter(h, 'all'))).toHaveLength(5)
    expect(heroes.filter((h) => matchesEditionFilter(h, '2014'))).toHaveLength(3)
    expect(heroes.filter((h) => matchesEditionFilter(h, '2024'))).toHaveLength(2)
  })

  it('варианты «Все / 2014 / 2024» со счётчиками', () => {
    const opts = editionFilterOptions(countByEdition(heroes))
    expect(opts.map((o) => [o.value, o.label, o.count])).toEqual([
      ['all', 'Все', 5],
      ['2014', '2014', 3],
      ['2024', '2024', 2],
    ])
    expect(opts[1].title).toBe('Редакция 2014: 3 героя')
    expect(opts[2].title).toBe('Редакция 2024: 2 героя')
    expect(editionFilterOptions({ all: 5, '2014': 5, '2024': 0 })[2].title).toBe('Редакция 2024: 0 героев')
  })

  it('сохранённый выбор — только допустимый', () => {
    expect(sanitizeEditionFilter('2014')).toBe('2014')
    expect(sanitizeEditionFilter('all')).toBe('all')
    expect(sanitizeEditionFilter('2020')).toBe('all')
    expect(sanitizeEditionFilter(null)).toBe('all')
  })

  it('пустой ряд — своя подпись у каждой редакции', () => {
    expect(editionEmptyText('2014')).toBe('Героев по правилам 2014 пока нет.')
    expect(editionEmptyText('all')).toMatch(/другие фильтры/)
  })
})
