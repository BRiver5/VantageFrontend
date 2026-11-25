import { describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({ fetchAll: vi.fn(), searchCatalog: vi.fn() }))

import { searchBothEditions, withoutCounterparts } from './otherEdition'

type S = { id: string; name: string; variant_group?: string | null; other_edition?: string }
const name = (s: S) => s.name
const id = (s: S) => s.id

const own: S[] = [
  { id: 'a24', name: 'Огненный шар', variant_group: 'fireball' },
  { id: 'b24', name: 'Щит' },
]
const others: S[] = [
  { id: 'a14', name: 'Огненный шар', variant_group: 'fireball', other_edition: '2014' },
  { id: 'c14', name: 'Огненные ладони', other_edition: '2014' },
  { id: 'd14', name: 'Щит', other_edition: '2014' },
]

describe('записи другой редакции', () => {
  it('пары по variant_group и названию не дублируются', () => {
    expect(withoutCounterparts(own, others, name).map(id)).toEqual(['c14'])
  })

  it('при поиске свои первыми, следом найденные другой редакции', () => {
    expect(searchBothEditions(own, others, 'огнен', null, id, name).map(id)).toEqual(['a24', 'c14'])
  })

  it('без запроса — только свои', () => {
    expect(searchBothEditions(own, others, '', null, id, name).map(id)).toEqual(['a24', 'b24'])
  })
})
