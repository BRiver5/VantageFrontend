import { describe, expect, it } from 'vitest'
import { catalogSearch, pageFromSearch } from './config'

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
