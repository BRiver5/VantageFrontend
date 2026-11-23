import { describe, expect, it } from 'vitest'
import { catalogSearch, filtersFromSearch, pageFromSearch } from './config'

describe('catalogSearch', () => {
  it('адрес не меняется — навигации нет (иначе холостой replace затирает открытый /classes/:id)', () => {
    expect(catalogSearch(new URLSearchParams('ed=2014'), { open: undefined, page: 0 })).toBeNull()
    expect(catalogSearch(new URLSearchParams('page=3'), { page: 2 })).toBeNull()
    expect(catalogSearch(new URLSearchParams('open=x'), { open: 'x', page: undefined })).toBeNull()
  })

  it('ставит и снимает ?open= и ?page=, остальное сохраняет', () => {
    expect(catalogSearch(new URLSearchParams('ed=2014'), { open: 'x', page: 1 })?.toString()).toBe('ed=2014&open=x&page=2')
    expect(catalogSearch(new URLSearchParams('open=x&page=2&q=1'), { open: null, page: 0 })?.toString()).toBe('q=1')
    expect(pageFromSearch(new URLSearchParams('page=2'))).toBe(1)
  })
})

describe('фильтры, сортировка и поиск в адресе', () => {
  it('пишутся и стираются, чужие параметры не трогаются', () => {
    const next = catalogSearch(new URLSearchParams('ed=2024&class=бард'), {
      filters: { keys: ['class', 'level'], sel: { level: ['3', '9'] } },
      sort: 'name',
      q: 'огонь',
    })
    expect(next?.get('class')).toBeNull()
    expect(next?.get('level')).toBe('3,9')
    expect(next?.get('sort')).toBe('name')
    expect(next?.get('q')).toBe('огонь')
    expect(next?.get('ed')).toBe('2024')
    expect(catalogSearch(new URLSearchParams('sort=name&q=x'), { sort: 'none', q: '' })?.toString()).toBe('')
  })

  it('читаются обратно', () => {
    expect(filtersFromSearch(new URLSearchParams('class=колдун,бард&level=9&x=1'), ['class', 'level'])).toEqual({
      class: ['колдун', 'бард'],
      level: ['9'],
    })
  })
})
