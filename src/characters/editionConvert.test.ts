import { describe, expect, it } from 'vitest'
import type { EditionIssue } from '../types/character'
import {
  catalogSearchPath,
  convertActionFor,
  convertBody,
  editionOf,
  entityName,
  groupIssues,
  keptLine,
  needsCatalogSearch,
  resolveBody,
  sortIssues,
} from './editionConvert'

const issue = (over: Partial<EditionIssue>): EditionIssue => ({
  key: over.key ?? 'k',
  kind: 'feat',
  field: 'feat_ids',
  old: null,
  options: [],
  status: 'open',
  message: 'Нет пары',
  ...over,
})

describe('editionOf', () => {
  it('без поля — 2014', () => {
    expect(editionOf({})).toBe('2014')
    expect(editionOf(null)).toBe('2014')
    expect(editionOf({ edition: '2024' })).toBe('2024')
  })
})

describe('convertActionFor', () => {
  it('2014 и без редакции — заметное «по правилам 2024»', () => {
    expect(convertActionFor({ edition: '2014' }, true)).toEqual({ to: '2024', label: 'Пересоздать по правилам 2024', prominent: true })
    expect(convertActionFor({}, true)?.to).toBe('2024')
  })
  it('2024 — тихое обратное', () => {
    expect(convertActionFor({ edition: '2024' }, true)).toEqual({ to: '2014', label: 'Пересоздать по правилам 2014', prominent: false })
  })
  it('чужой лист или нет персонажа — ничего', () => {
    expect(convertActionFor({ edition: '2014' }, false)).toBeNull()
    expect(convertActionFor(null, true)).toBeNull()
  })
})

describe('тела запросов', () => {
  it('convert', () => {
    expect(convertBody('2024')).toEqual({ to: '2024' })
  })
  it('resolve: keep без замены, replace с id', () => {
    expect(resolveBody()).toEqual({ action: 'keep' })
    expect(resolveBody(null)).toEqual({ action: 'keep' })
    expect(resolveBody('  ')).toEqual({ action: 'keep' })
    expect(resolveBody('abc')).toEqual({ action: 'replace', replacement_id: 'abc' })
  })
})

describe('группировка и порядок вопросов', () => {
  const list = [
    issue({ key: 's1', kind: 'spell', old: { id: '1', name: 'Щит', slug: null } }),
    issue({ key: 'f1', kind: 'feat', status: 'kept', old: { id: '2', name: 'Бдительный', slug: null } }),
    issue({ key: 'c1', kind: 'class' }),
    issue({ key: 'b1', kind: 'background', status: 'replaced' }),
    issue({ key: 's0', kind: 'spell', old: { id: '3', name: 'Агония', slug: null } }),
    issue({ key: 'r1', kind: 'race' }),
  ]
  it('сортирует по виду, затем по названию', () => {
    expect(sortIssues(list).map((i) => i.key)).toEqual(['c1', 'r1', 'b1', 'f1', 's0', 's1'])
  })
  it('делит по статусу', () => {
    const g = groupIssues(list)
    expect(g.open.map((i) => i.key)).toEqual(['c1', 'r1', 's0', 's1'])
    expect(g.kept.map((i) => i.key)).toEqual(['f1'])
    expect(g.replaced.map((i) => i.key)).toEqual(['b1'])
  })
  it('пустой список и отсутствие поля', () => {
    expect(groupIssues(undefined)).toEqual({ open: [], kept: [], replaced: [] })
  })
  it('не меняет исходный массив', () => {
    const copy = [...list]
    sortIssues(list)
    expect(list).toEqual(copy)
  })
  it('строка оставленного', () => {
    expect(keptLine(list[1], '2014')).toBe('Бдительный — оставлено из 2014')
    expect(keptLine(issue({ kind: 'ability_scores' }), '2014')).toBe('Характеристики — оставлено из 2014')
  })
})

describe('поиск по каталогу', () => {
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `x${i}`, slug: null }))
  it('нужен, когда вариантов нет или много, и только для ищущихся разделов', () => {
    expect(needsCatalogSearch({ kind: 'feat', options: [] })).toBe(true)
    expect(needsCatalogSearch({ kind: 'spell', options: opts(3) })).toBe(false)
    expect(needsCatalogSearch({ kind: 'item', options: opts(12) })).toBe(true)
    expect(needsCatalogSearch({ kind: 'class', options: [] })).toBe(false)
    expect(needsCatalogSearch({ kind: 'ability', options: opts(20) })).toBe(false)
  })
  it('адрес поиска с редакцией', () => {
    expect(catalogSearchPath('feats', ' Бдит ', '2024')).toBe(`/feats?skip=0&limit=20&edition=2024&q=${encodeURIComponent('Бдит').replace(/%20/g, '+')}`)
    expect(catalogSearchPath('spells', '', '2014', 5)).toBe('/spells?skip=0&limit=5&edition=2014')
  })
  it('название записи из поля своего раздела', () => {
    expect(entityName({ id: '1', feat_name: 'Бдительный' })).toBe('Бдительный')
    expect(entityName({ id: '2', equipment_name: 'Длинный лук' })).toBe('Длинный лук')
    expect(entityName({ id: '3' })).toBe('3')
  })
})
