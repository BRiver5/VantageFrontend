import { describe, expect, it } from 'vitest'
import { applySmartSearch, localMatch, typoMatch } from './sectionSearch'

const items = [
  { id: 'a', name: 'Огненный шар' },
  { id: 'b', name: 'Отшельник' },
  { id: 'c', name: 'Шар молний' },
]
const id = (x: { id: string }) => x.id
const name = (x: { name: string }) => x.name

describe('sectionSearch', () => {
  it('локально понимает неверную раскладку', () => {
    expect(localMatch('Отшельник', 'jnitkm')).toBe(true)
    expect(localMatch('Отшельник', 'отшельн')).toBe(true)
    expect(localMatch('Отшельник', 'шар')).toBe(false)
  })

  it('найденное сервером — по релевантности, потом локальные совпадения', () => {
    const ranks = new Map([['c', 0], ['a', 1]])
    expect(applySmartSearch(items, 'шар', ranks, id, name).map(id)).toEqual(['c', 'a'])
    // сервер ещё не ответил — только локальные
    expect(applySmartSearch(items, 'шар', null, id, name).map(id)).toEqual(['a', 'c'])
    expect(applySmartSearch(items, '', null, id, name)).toHaveLength(3)
  })
})

describe('typoMatch', () => {
  it('опечатка в слове находится, короткий запрос — нет', () => {
    expect(typoMatch('Отшельник', 'отшелник')).toBe(true)
    expect(typoMatch('Огненный шар', 'огненый')).toBe(true)
    expect(typoMatch('Шепчущие духи', 'шар')).toBe(false)
    expect(typoMatch('Отшельник', 'отшельниками')).toBe(false)
  })
})
