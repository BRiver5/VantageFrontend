import { describe, expect, it } from 'vitest'
import { routeVerdict, type RoutePreview } from './api'

const route = (over: Partial<RoutePreview>): RoutePreview => ({ path: [[0, 0], [1, 0]], cost: 5, valid: true, budget: 30, provokes: [], ...over })

describe('routeVerdict', () => {
  it('идёт сразу, если никто не ударит', () => {
    expect(routeVerdict(route({}))).toBe('go')
  })
  it('спрашивает, если путь провоцирует атаку по возможности (и при перетаскивании, и при клике по клетке)', () => {
    expect(routeVerdict(route({ provokes: [{ token_id: 'orc', combatant_id: 'c', name: 'Орк', at_cell: [0, 0], step: 0, reach_ft: 10 }] }))).toBe('ask')
  })
  it('не пройти — не спрашивает', () => {
    expect(routeVerdict(route({ valid: false, reason: 'Не хватает движения', provokes: [{ token_id: 'orc', combatant_id: 'c', name: 'Орк', at_cell: [0, 0], step: 0 }] }))).toBe('blocked')
  })
})
