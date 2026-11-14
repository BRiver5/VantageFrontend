import { describe, expect, it } from 'vitest'
import { embedsOf, embedText, ensureSecretId, parseBlocks, parseInline, plainText, secretSpans, stripSecrets } from './mdparse'

const PAGE = ['# Таверна', '', 'Хозяин улыбается.', '', ':::secret id=a1 Кто он', 'Хозяин — **оборотень**.', ':::', '', 'Пиво тёплое.', '', ':::secret', 'Под стойкой кинжал.', ':::'].join('\n')

describe('встраивание @Embed', () => {
  it('строчное и отдельной строкой', () => {
    expect(parseInline('см. @Embed[spell:abc-1] тут')).toEqual([
      { t: 'text', v: 'см. ' },
      { t: 'embed', kind: 'spell', id: 'abc-1' },
      { t: 'text', v: ' тут' },
    ])
    expect(parseBlocks('до\n@Embed[page:p1]\nпосле')).toEqual([
      { t: 'p', text: 'до' },
      { t: 'embed', kind: 'page', id: 'p1' },
      { t: 'p', text: 'после' },
    ])
  })

  it('неизвестный вид — просто текст', () => {
    expect(parseInline('@Embed[map:1]')).toEqual([{ t: 'text', v: '@Embed[map:1]' }])
  })

  it('список встраиваний без повторов', () => {
    const src = `${embedText('item', 'i1')} и ${embedText('creature', 'c1')} снова ${embedText('item', 'i1')}`
    expect(embedsOf(src)).toEqual([
      { kind: 'item', id: 'i1' },
      { kind: 'creature', id: 'c1' },
    ])
  })

  it('в отрывке для поиска встраиваний нет', () => {
    expect(plainText('Лавка @Embed[item:i1] открыта')).toBe('Лавка открыта')
  })
})

describe('тайные блоки', () => {
  it('разбираются в блок с номером и заголовком', () => {
    const blocks = parseBlocks(PAGE)
    const secrets = blocks.filter((b) => b.t === 'secret')
    expect(secrets).toHaveLength(2)
    expect(secrets[0]).toMatchObject({ id: 'a1', title: 'Кто он', from: 4, to: 6 })
    expect(secrets[0].t === 'secret' && secrets[0].blocks).toEqual([{ t: 'p', text: 'Хозяин — **оборотень**.' }])
    expect(secrets[1]).toMatchObject({ id: null, title: '' })
  })

  it('внутри выноски тайна не распознаётся (сервер ищет только на верхнем уровне)', () => {
    const blocks = parseBlocks('> :::secret id=x\n> тайна\n> :::')
    expect(JSON.stringify(blocks)).not.toContain('"secret"')
  })

  it('::: в коде не закрывает тайну, а :::secret в коде — просто код', () => {
    expect(secretSpans('a\n:::secret id=s\n```\n:::\n```\nтайна\n:::\nb')).toEqual([{ id: 's', title: '', from: 1, to: 6 }])
    expect(secretSpans('```\n:::secret id=s\n```')).toEqual([])
  })

  it('незакрытая тайна тянется до конца', () => {
    expect(secretSpans('a\n:::secret id=s\nтайна')).toEqual([{ id: 's', title: '', from: 1, to: 2 }])
    expect(stripSecrets('a\n:::secret id=s\nтайна', [])).toBe('a')
  })

  it('вырезание как на сервере: нераскрытые и без номера — прочь', () => {
    const player = stripSecrets(PAGE, ['a1'])
    expect(player).toContain('оборотень')
    expect(player).not.toContain('кинжал')
    expect(stripSecrets(PAGE, [])).not.toContain('оборотень')
  })

  it('номер выдаётся блоку без номера и не меняется у блока с номером', () => {
    const given = ensureSecretId(PAGE, 10)
    expect(given?.id).toMatch(/^[\w-]{6}$/)
    expect(given?.src.split('\n')[10]).toBe(`:::secret id=${given?.id}`)
    expect(ensureSecretId(PAGE, 4)).toEqual({ src: PAGE, id: 'a1' })
    expect(ensureSecretId(PAGE, 0)).toBeNull()
  })

  it('номера строк считаются с base (после шапки страницы)', () => {
    const [b] = parseBlocks(':::secret id=q\nx\n:::', 5)
    expect(b).toMatchObject({ t: 'secret', from: 5, to: 7 })
  })
})
