import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EDITION,
  appendEdition,
  docEditions,
  editionHref,
  editionRedirectHref,
  withEditionParam,
  editionParamFor,
  otherEditionCaption,
  otherEditionOf,
  preferredEditionFirst,
  withRecordEdition,
  planElementEdition,
  pruneSectionEditions,
  resolveEdition,
  sanitizeEditionsMap,
  sanitizeSectionEditions,
  sectionEditionOf,
  sectionOf,
  shownEdition,
  withSectionEdition,
  type EditionsMap,
} from './edition'
import { globalEdition, resourceEdition, sectionEdition, setGlobalEdition, setSectionEdition } from './store'
import { getUserSettings, reloadSettings, setUserSettingsSyncer } from '../settings/settings'
import { catalogParams, searchEdition, searchQueryParams } from '../api/catalog'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  setUserSettingsSyncer(null)
  reloadSettings()
})

describe('resolution', () => {
  it('element beats section beats global', () => {
    expect(resolveEdition({ global: '2024' })).toBe('2024')
    expect(resolveEdition({ section: '2014', global: '2024' })).toBe('2014')
    expect(resolveEdition({ element: '2024', section: '2014', global: '2014' })).toBe('2024')
    expect(resolveEdition({ element: null, section: null, global: '2014' })).toBe('2014')
  })

  it('section edition is its override or the global one', () => {
    expect(sectionEditionOf('spells', '2024', {})).toBe('2024')
    expect(sectionEditionOf('spells', '2024', { spells: '2014' })).toBe('2014')
    expect(sectionEditionOf('feats', '2024', { spells: '2014' })).toBe('2024')
    expect(sectionEditionOf(null, '2014', { spells: '2024' })).toBe('2014')
  })

  it('child resources belong to their parent section', () => {
    expect(sectionOf('subclasses')).toBe('classes')
    expect(sectionOf('subraces')).toBe('races')
    expect(sectionOf('spells')).toBe('spells')
    expect(sectionOf('books')).toBeNull()
  })
})

describe('section overrides', () => {
  it('setting the global value removes the override', () => {
    const a = withSectionEdition({}, 'spells', '2014', '2024')
    expect(a).toEqual({ spells: '2014' })
    expect(withSectionEdition(a, 'spells', '2024', '2024')).toEqual({})
    expect(withSectionEdition(a, 'spells', null, '2024')).toEqual({})
    expect(withSectionEdition(a, 'items', '2014', '2024')).toEqual({ spells: '2014', items: '2014' })
  })

  it('global change drops overrides that now match it', () => {
    expect(pruneSectionEditions({ spells: '2014', items: '2024' }, '2014')).toEqual({ items: '2024' })
  })

  it('sanitizes junk', () => {
    expect(sanitizeSectionEditions({ spells: '2014', nope: '2014', items: '1999', feats: 2024 })).toEqual({ spells: '2014' })
    expect(sanitizeSectionEditions(null)).toEqual({})
    expect(sanitizeSectionEditions(['2014'])).toEqual({})
  })
})

describe('settings', () => {
  it('defaults to 2024 everywhere', () => {
    expect(DEFAULT_EDITION).toBe('2024')
    expect(globalEdition()).toBe('2024')
    expect(sectionEdition('spells')).toBe('2024')
    expect(getUserSettings().editionSections).toEqual({})
  })

  it('section override, follow global, reset', () => {
    setSectionEdition('spells', '2014')
    expect(sectionEdition('spells')).toBe('2014')
    expect(sectionEdition('items')).toBe('2024')
    // общая сменилась: раздел без переопределения идёт следом, переопределённый — нет
    setGlobalEdition('2014')
    expect(sectionEdition('items')).toBe('2014')
    expect(sectionEdition('spells')).toBe('2014')
    // совпавшее с общей переопределение снялось — раздел снова следует общей
    expect(getUserSettings().editionSections).toEqual({})
    setGlobalEdition('2024')
    expect(sectionEdition('spells')).toBe('2024')
    setSectionEdition('items', '2014')
    setSectionEdition('items', null)
    expect(sectionEdition('items')).toBe('2024')
    expect(getUserSettings().editionSections).toEqual({})
  })

  it('child resources use their section edition', () => {
    setSectionEdition('classes', '2014')
    expect(resourceEdition('subclasses')).toBe('2014')
    expect(resourceEdition('classes')).toBe('2014')
    expect(resourceEdition('spells')).toBe('2024')
  })
})

describe('api params', () => {
  it('only editioned resources get the param', () => {
    expect(editionParamFor('spells', '2014')).toBe('2014')
    expect(editionParamFor('books', '2014')).toBeNull()
    expect(editionParamFor('settings', '2024')).toBeNull()
    expect(editionParamFor('spells', null)).toBeNull()
    expect(appendEdition(new URLSearchParams('q=x'), 'creatures', '2024').toString()).toBe('q=x&edition=2024')
  })

  it('list params default to the section edition, null means none', () => {
    setSectionEdition('spells', '2014')
    expect(catalogParams('spells', { skip: 50, limit: 50, q: 'огонь' }).toString()).toBe(
      `skip=50&limit=50&q=${encodeURIComponent('огонь').replace(/%20/g, '+')}&edition=2014`,
    )
    expect(catalogParams('feats').get('edition')).toBe('2024')
    expect(catalogParams('feats', { edition: '2014' }).get('edition')).toBe('2014')
    expect(catalogParams('feats', { edition: null }).has('edition')).toBe(false)
    expect(catalogParams('books', { limit: 500 }).has('edition')).toBe(false)
  })

  it('search uses the single section edition or the global one', () => {
    setSectionEdition('spells', '2014')
    expect(searchEdition(['spells'])).toBe('2014')
    expect(searchEdition(['spells', 'feats'])).toBe('2024')
    expect(searchEdition(undefined)).toBe('2024')
    const p = searchQueryParams('меч', { entities: ['spells'], limit: 10 })
    expect(p.get('edition')).toBe('2014')
    expect(p.getAll('entities')).toEqual(['spells'])
    expect(searchQueryParams('меч', { edition: null }).has('edition')).toBe(false)
  })
})

describe('search across editions', () => {
  it('asks for the other edition only with a search query and an edition', () => {
    expect(catalogParams('spells', { q: 'огонь', edition: '2024', otherEditions: true }).get('other_editions')).toBe('1')
    expect(catalogParams('spells', { edition: '2024', otherEditions: true }).has('other_editions')).toBe(false)
    expect(catalogParams('spells', { q: 'огонь', edition: null, otherEditions: true }).has('other_editions')).toBe(false)
    expect(catalogParams('books', { q: 'x', otherEditions: true }).has('other_editions')).toBe(false)
    expect(catalogParams('spells', { q: 'огонь', edition: '2024' }).has('other_editions')).toBe(false)

    const p = searchQueryParams('меч', { edition: '2014', otherEditions: true })
    expect(p.get('edition')).toBe('2014')
    expect(p.get('other_editions')).toBe('1')
    expect(searchQueryParams('меч', { edition: null, otherEditions: true }).has('other_editions')).toBe(false)
    expect(searchQueryParams('меч', { edition: '2024' }).has('other_editions')).toBe(false)
  })

  it('reads the flag and builds the caption', () => {
    expect(otherEditionOf({ other_edition: '2014' })).toBe('2014')
    expect(otherEditionOf({ other_edition: null })).toBeNull()
    expect(otherEditionOf({ other_edition: '3.5' })).toBeNull()
    expect(otherEditionOf({})).toBeNull()
    expect(otherEditionOf(null)).toBeNull()
    expect(otherEditionCaption('2014')).toBe('из редакции 2014')
    expect(otherEditionCaption('2024')).toBe('из редакции 2024')
  })

  it('keeps the selected edition first without reordering inside parts', () => {
    const list = [
      { id: 'o1', other_edition: '2014' as const },
      { id: 'a' },
      { id: 'o2', other_edition: '2014' as const },
      { id: 'b', other_edition: null },
    ]
    expect(preferredEditionFirst(list).map((x) => x.id)).toEqual(['a', 'b', 'o1', 'o2'])
    const plain = [{ id: 'x' }, { id: 'y' }]
    expect(preferredEditionFirst(plain)).toEqual(plain)
    expect(preferredEditionFirst(plain)).not.toBe(plain)
  })

  it('links other-edition records with ?ed=', () => {
    expect(withRecordEdition('/spells/a', { other_edition: '2014' })).toBe('/spells/a?ed=2014')
    expect(withRecordEdition('/spells/a?x=1#top', { other_edition: '2024' })).toBe('/spells/a?x=1&ed=2024#top')
    expect(withRecordEdition('/spells/a', { other_edition: null })).toBe('/spells/a')
  })
})

describe('one record', () => {
  const shared: EditionsMap = { '2014': { id: 'a', name: 'Огненный шар' }, '2024': { id: 'a', name: 'Огненный шар' } }
  const variant: EditionsMap = { '2014': { id: 'a', name: 'Волшебник' }, '2024': { id: 'b', name: 'Волшебник' } }
  const only2014: EditionsMap = { '2014': { id: 'a', name: 'Старое' }, '2024': null }

  it('parses the editions endpoint', () => {
    expect(sanitizeEditionsMap({ editions: { '2014': { id: 'a', name: 'X' }, '2024': null } })).toEqual({ '2014': { id: 'a', name: 'X' }, '2024': null })
    expect(sanitizeEditionsMap({ detail: 'Not Found' })).toBeNull()
    expect(sanitizeEditionsMap(null)).toBeNull()
  })

  it('record editions: map first, then the field, missing field means 2014', () => {
    expect(docEditions('a', variant, ['2024'])).toEqual(['2014'])
    expect(docEditions('a', null, ['2014', '2024'])).toEqual(['2014', '2024'])
    expect(docEditions('a', null, null)).toEqual(['2014'])
    expect(docEditions('a', null, undefined)).toEqual([])
    expect(shownEdition(['2014'], '2024')).toBe('2014')
    expect(shownEdition(['2014', '2024'], '2024')).toBe('2024')
    expect(shownEdition(undefined, '2024')).toBe('2014')
  })

  it('variant: switch to the other id, follow the wanted edition', () => {
    const p = planElementEdition({ id: 'a', map: variant, recordEditions: ['2014'], wanted: '2014' })
    expect(p).toMatchObject({ shown: '2014', canSwitch: true, targetId: 'b', redirectId: null, pending: false })
    const q = planElementEdition({ id: 'a', map: variant, recordEditions: ['2014'], wanted: '2024' })
    expect(q).toMatchObject({ shown: '2014', redirectId: 'b' })
    expect(planElementEdition({ id: 'a', map: variant, recordEditions: ['2014'], wanted: '2024', follow: false }).redirectId).toBeNull()
  })

  it('shared document: same id, only the edition flips', () => {
    const p = planElementEdition({ id: 'a', map: shared, recordEditions: ['2014', '2024'], wanted: '2024' })
    expect(p).toMatchObject({ shown: '2024', canSwitch: true, targetId: 'a', redirectId: null })
  })

  it('single edition: disabled with a reason', () => {
    const p = planElementEdition({ id: 'a', map: only2014, recordEditions: ['2014'], wanted: '2024' })
    expect(p).toMatchObject({ shown: '2014', canSwitch: false, targetId: null, redirectId: null, reason: 'Есть только в редакции 2014' })
  })

  it('without the endpoint falls back to the record field', () => {
    expect(planElementEdition({ id: 'a', map: null, recordEditions: ['2014', '2024'], wanted: '2014' })).toMatchObject({ shown: '2014', targetId: 'a' })
    expect(planElementEdition({ id: 'a', map: null, recordEditions: ['2024'], wanted: '2014' })).toMatchObject({ shown: '2024', canSwitch: false })
    expect(planElementEdition({ id: 'a', map: null, recordEditions: undefined, wanted: '2014' })).toMatchObject({ pending: true, canSwitch: false })
  })

  it('builds shareable urls', () => {
    expect(editionHref({ pathname: '/spells/a', search: '' }, 'a', 'b', '2014')).toBe('/spells/b?ed=2014')
    expect(editionHref({ pathname: '/classes/a', search: '?subclass=x&ed=2014' }, 'a', 'b', '2024')).toBe('/classes/b?subclass=x&ed=2024')
    expect(editionHref({ pathname: '/items', search: '?open=a&page=2' }, 'a', 'b', '2014')).toBe('/items?open=b&page=2&ed=2014')
    expect(editionHref({ pathname: '/spells/a', search: '?ed=2014', hash: '#x' }, 'a', 'b', null)).toBe('/spells/b#x')
  })
})

describe('переключение записи «на месте» (классы)', () => {
  const A = 'e3ab' // Монах 2014
  const B = '8d88' // Монах 2024

  it('editionHref снимает параметры прежней версии (?subclass=) только при смене записи', () => {
    expect(editionHref({ pathname: `/classes/${B}`, search: '?subclass=x&page=2' }, B, A, '2014', ['subclass'])).toBe(
      `/classes/${A}?page=2&ed=2014`,
    )
    expect(editionHref({ pathname: `/classes/${A}`, search: '?subclass=x' }, A, A, '2024', ['subclass'])).toBe(
      `/classes/${A}?subclass=x&ed=2024`,
    )
  })

  it('авто-переход на версию раздела не перебивает переход переключателя и «Назад»', () => {
    // запись ещё прежняя (B), а адрес уже новой (A?ed=2014) — уводить некуда и незачем
    expect(editionRedirectHref({ pathname: `/classes/${A}`, search: '?ed=2014' }, B, A, '2014')).toBeNull()
    // «Назад» на /classes/B, пока рисуется A — тоже не трогаем
    expect(editionRedirectHref({ pathname: `/classes/${B}`, search: '' }, A, B, null)).toBeNull()
    // открыт 2014 без ?ed= при разделе 2024 — уводим на 2024
    expect(editionRedirectHref({ pathname: `/classes/${A}`, search: '' }, A, B, null)).toBe(`/classes/${B}`)
    // в ?open= (предметы) — тоже
    expect(editionRedirectHref({ pathname: '/items', search: `?open=${A}` }, A, B, null)).toBe(`/items?open=${B}`)
    expect(editionRedirectHref({ pathname: `/classes/${A}`, search: '' }, A, null, null)).toBeNull()
  })

  it('withEditionParam: ссылка на запись другой редакции держит её ?ed=', () => {
    expect(withEditionParam('/subclasses/s1', ['2014'], '2024')).toBe('/subclasses/s1?ed=2014')
    expect(withEditionParam('/classes/c?subclass=s1', null, '2024')).toBe('/classes/c?subclass=s1&ed=2014')
    expect(withEditionParam('/subclasses/s2', ['2024'], '2024')).toBe('/subclasses/s2')
    expect(withEditionParam('/subraces/r?ed=2014#x', ['2014', '2024'], '2024')).toBe('/subraces/r#x')
  })
})
