import { describe, expect, it } from 'vitest'
import { applySort, byRating, catalogSearch, filtersFromSearch, flipSort, noRating, numCmp, pageFromSearch, parseSort, type SortOption } from './config'

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

describe('byRating', () => {
  it('сначала оценённые (лучшие сверху), потом без оценок', () => {
    const r = (average: number | null, count: number) => ({ rating: { average, count } })
    const list = [r(null, 0), r(2, 1), r(5, 3), r(null, 0), r(4, 1)].sort(byRating)
    expect(list.map((x) => x.rating.count)).toEqual([3, 1, 1, 0, 0])
    expect(list[0].rating.average).toBe(5)
    expect(list[2].rating.average).toBe(2)
  })
})

describe('обратная сортировка', () => {
  it('направление живёт в ключе и в адресе', () => {
    expect(parseSort('name')).toEqual({ key: 'name', reverse: false })
    expect(parseSort('-name')).toEqual({ key: 'name', reverse: true })
    expect(flipSort('name')).toBe('-name')
    expect(flipSort('-name')).toBe('name')
    expect(catalogSearch(new URLSearchParams(), { sort: '-name' })?.get('sort')).toBe('-name')
  })

  it('переворачивает порядок: без значения — в конце, равные не меняются местами', () => {
    type Row = { id: string; cost: number | null }
    const sort = { key: 'cost', label: 'Цена', cmp: (a: Row, b: Row) => numCmp(a.cost, b.cost), missing: (r: Row) => r.cost == null } as unknown as SortOption<Row>
    const rows: Row[] = [
      { id: 'нет', cost: null },
      { id: 'a', cost: 2 },
      { id: 'b', cost: 1 },
      { id: 'c', cost: 2 },
      { id: 'нет2', cost: null },
    ]
    expect(applySort(rows, sort, false, {}).map((r) => r.id)).toEqual(['b', 'a', 'c', 'нет', 'нет2'])
    expect(applySort(rows, sort, true, {}).map((r) => r.id)).toEqual(['a', 'c', 'b', 'нет', 'нет2'])
    expect(rows[0].id).toBe('нет')
  })

  it('рейтинг: худшие оценки первыми, без оценок всё равно в конце', () => {
    const r = (average: number | null, count: number) => ({ rating: { average, count } })
    const sort = { key: 'rating', label: 'Рейтинг', cmp: byRating, missing: noRating } as unknown as SortOption<ReturnType<typeof r>>
    expect(applySort([r(null, 0), r(5, 3), r(2, 1)], sort, true, {}).map((x) => x.rating.average)).toEqual([2, 5, null])
  })
})
