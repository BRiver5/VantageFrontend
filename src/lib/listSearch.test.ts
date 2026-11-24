import { describe, expect, it } from 'vitest'
import { withRecordEdition } from '../editions/edition'
import { listSearch } from './listSearch'

describe('listSearch', () => {
  it('оставляет состояние списка и убирает параметры записи', () => {
    expect(listSearch('?class=x&sort=-name&q=y&page=2&ed=2014&open=1&subclass=2')).toBe('?class=x&sort=-name&q=y&page=2')
  })

  it('пустой, если состояния нет', () => {
    expect(listSearch('')).toBe('')
    expect(listSearch(new URLSearchParams('ed=2014'))).toBe('')
  })

  it('не меняет исходные параметры', () => {
    const src = new URLSearchParams('ed=2014&sort=name')
    listSearch(src)
    expect(src.toString()).toBe('ed=2014&sort=name')
  })

  it('уживается с редакцией записи', () => {
    const href = withRecordEdition(`/spells/1${listSearch('?sort=name')}`, { other_edition: '2014' })
    expect(href).toBe('/spells/1?sort=name&ed=2014')
  })
})
