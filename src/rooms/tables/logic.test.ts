import { describe, expect, it } from 'vitest'
import { applyRef, chance, decodeRef, defaultFormula, drawnSummary, encodeRef, groupTables, KB_PAGE_DRAG, newResult, normalizeResults, rangeIssues, rangeLabel, REF_MIME, refFromDrop } from './logic'
import type { RollTable, TableResult } from './types'

const res = (text: string, weight = 1, range: [number, number] | null = null): TableResult => ({ id: text, range, weight, type: 'text', text, drawn: false })

const table = (name: string, folder: string | null, results: TableResult[] = []): RollTable => ({
  id: name,
  room_id: 'r',
  name,
  description: '',
  formula: '',
  replacement: true,
  results,
  folder,
  visibility: 'gm',
  image: null,
})

describe('диапазоны', () => {
  it('нормализует по весам', () => {
    const out = normalizeResults([res('a', 1), res('b', 3), res('c', 2)])
    expect(out.map((r) => r.range)).toEqual([[1, 1], [2, 4], [5, 6]])
    expect(defaultFormula(out)).toBe('1d6')
    expect(chance(out[1], out)).toBe(50)
    expect(rangeLabel(out[0])).toBe('1')
    expect(rangeLabel(out[1])).toBe('2–4')
  })

  it('новая строка встаёт после последней', () => {
    const list = normalizeResults([res('a', 2)])
    expect(newResult(list, { weight: 3 }).range).toEqual([3, 5])
    expect(defaultFormula([res('x', 1, [1, 1])])).toBe('1')
  })

  it('находит пересечения и дыры', () => {
    expect(rangeIssues([res('a', 1, [1, 3]), res('b', 1, [3, 4])])).toEqual({ overlap: true, gaps: false })
    expect(rangeIssues([res('a', 1, [1, 2]), res('b', 1, [5, 6])])).toEqual({ overlap: false, gaps: true })
    expect(rangeIssues(normalizeResults([res('a'), res('b')]))).toEqual({ overlap: false, gaps: false })
  })
})

describe('список', () => {
  it('группирует по папкам, без папки — в конце, ищет и по результатам', () => {
    const list = [table('Лес', 'Встречи'), table('Сундук', null, [res('Монеты')]), table('Город', 'Встречи'), table('Яды', 'Алхимия')]
    expect(groupTables(list).map((f) => [f.path, f.tables.map((t) => t.name)])).toEqual([
      ['Алхимия', ['Яды']],
      ['Встречи', ['Город', 'Лес']],
      ['', ['Сундук']],
    ])
    expect(groupTables(list, 'монет').map((f) => f.tables[0].name)).toEqual(['Сундук'])
  })
})

describe('ссылки', () => {
  it('кодирует и проверяет перетаскивание', () => {
    const pick = { type: 'item' as const, ref_id: 'i1', ref_kind: 'template' as const, text: 'Меч', image: null }
    expect(decodeRef(encodeRef(pick))).toEqual(pick)
    expect(decodeRef('{"type":"spell","ref_id":"x"}')).toBeNull()
    expect(decodeRef('не json')).toBeNull()
  })

  it('понимает страницу из базы знаний', () => {
    const data: Record<string, string> = { [KB_PAGE_DRAG]: 'p1' }
    expect(refFromDrop((t) => data[t] ?? '', () => 'Таверна')).toEqual({ type: 'kb_page', ref_id: 'p1', ref_kind: null, text: 'Таверна', image: null })
    expect(refFromDrop((t) => ({ [REF_MIME]: '' })[t] ?? '', () => undefined)).toBeNull()
  })

  it('подставляет ссылку, не затирая свой текст', () => {
    const own = { ...res('Ржавый меч'), ref_id: 'i1' }
    expect(applyRef(own, { type: 'item', ref_id: 'i1', ref_kind: 'equipment', text: 'Меч', image: 'm.png' }).text).toBe('Ржавый меч')
    expect(applyRef(res(''), { type: 'creature', ref_id: 'c', ref_kind: 'catalog', text: 'Волк', image: null })).toMatchObject({ type: 'creature', text: 'Волк', ref_kind: 'catalog' })
  })
})

describe('журнал', () => {
  it('пишет итог с вложенными таблицами', () => {
    const text = drawnSummary({
      table_id: 't',
      table_name: 'Сундук',
      mode: 'gm',
      draws: [
        { table_id: 't', table_name: 'Сундук', roll: { expression: '1d6', total: 4 }, forced: false, results: [{ ...res('Карта'), nested: { table_id: 'n', table_name: 'Куда', roll: null, forced: true, results: [{ ...res('Пещера'), nested: null }] } }] },
        { table_id: 't', table_name: 'Сундук', roll: { expression: '1d6', total: 1 }, forced: false, results: [{ ...res(''), type: 'creature', nested: null }] },
      ],
    })
    expect(text).toBe('скрыто · «Сундук»: (4) Карта → Пещера; (1) Существо')
  })
})
