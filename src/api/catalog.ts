import { registerTermLinks } from '../terms/registry'
import { API_BASE, request } from './http'
import type { Background, Book, BookContents, BookFull, BookMap, ContentTotals, Equipment, EquipmentIndex, GameClass, MetaEnums, Paged, SearchResult, Setting, Subrace } from './types'
import { splitTitle } from './text'
import { appendEdition, isEditionSection, sanitizeEditionsMap, type Edition, type EditionsMap } from '../editions/edition'
import { globalEdition, resourceEdition, sectionEdition } from '../editions/store'

/**
 * Редакция запроса: `undefined` — редакция раздела ресурса из настроек
 * (переопределение раздела или общая), `null` — без редакции (точный
 * документ или всё подряд), иначе — названная.
 */
export type EditionOpt = Edition | null | undefined

export const requestEdition = (resource: string, edition: EditionOpt): Edition | null =>
  edition === undefined ? resourceEdition(resource) : edition

/** Параметры списка каталога: страница, поиск и редакция (если ресурс её понимает) */
export function catalogParams(
  resource: string,
  opts: { skip?: number; limit?: number; q?: string; edition?: EditionOpt } = {},
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('skip', String(opts.skip ?? 0))
  params.set('limit', String(opts.limit ?? 50))
  if (opts.q) params.set('q', opts.q)
  return appendEdition(params, resource, requestEdition(resource, opts.edition))
}

export async function fetchPage<T>(
  resource: string,
  opts: { skip?: number; limit?: number; q?: string; edition?: EditionOpt } = {},
): Promise<Paged<T>> {
  const params = catalogParams(resource, opts)
  const res = await fetch(`${API_BASE}/${resource}?${params}`)
  if (!res.ok) throw new Error(`${resource}: ${res.status}`)
  return res.json()
}

async function fetchList<T>(resource: string, limit = 200): Promise<T[]> {
  return (await fetchPage<T>(resource, { limit })).items
}

export const getSettings = () => fetchList<Setting>('settings')

export const getBooks = () => fetchList<Book>('books', 500)

export const getClasses = () => fetchList<GameClass>('classes', 100)

export async function getBookMap(): Promise<BookMap> {
  const books = await getBooks()
  const map: BookMap = {}
  for (const b of books) map[b.id] = b
  return map
}

/**
 * Забирает весь отфильтрованный список (постранично по 500, максимум API) —
 * нужно для клиентской сортировки, т.к. бэкенд её не поддерживает.
 * cap ограничивает на случай аномально большого каталога.
 */
export async function fetchAll<T>(resource: string, opts: { q?: string; edition?: EditionOpt } = {}, cap = 3000): Promise<T[]> {
  // редакцию фиксируем на весь обход: смена посреди него не смешает страницы
  const edition = requestEdition(resource, opts.edition)
  const first = await fetchPage<T>(resource, { skip: 0, limit: 500, q: opts.q, edition })
  const all = [...first.items]
  const total = Math.min(first.total, cap)
  while (all.length < total) {
    const page = await fetchPage<T>(resource, { skip: all.length, limit: 500, q: opts.q, edition })
    if (page.items.length === 0) break
    all.push(...page.items)
  }
  return all
}

/**
 * Кэш записей по «resource:id». Каталог кладёт сюда объекты из списка, а деталь
 * читает их МГНОВЕННО при монтировании — чтобы страница рисовалась сразу (арт и
 * заголовок), а не заглушкой загрузки. Это критично для перехода-морфа: иначе в
 * новом кадре нет элементов, к которым должна лететь карточка.
 */
const entityCache = new Map<string, unknown>()

export function cacheEntity(resource: string, id: string, data: unknown): void {
  entityCache.set(`${resource}:${id}`, data)
}

export function getCachedEntity<T>(resource: string, id: string | undefined): T | null {
  if (!id) return null
  return (entityCache.get(`${resource}:${id}`) as T) ?? null
}

/**
 * Одна запись. По умолчанию — ровно этот документ (id однозначен). С
 * `edition` сервер может вернуть вариант другой редакции с другим id — он и
 * кладётся в кэш под своим id.
 */
export async function getOne<T>(resource: string, id: string, opts: { edition?: Edition | null } = {}): Promise<T> {
  const qs = appendEdition(new URLSearchParams(), resource, opts.edition ?? null).toString()
  const res = await fetch(`${API_BASE}/${resource}/${id}${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`${resource}: ${res.status}`)
  const data = (await res.json()) as T
  // ссылки на термины в текстах детали — до того, как текст отрисуется
  registerTermLinks(data)
  const realId = (data as { id?: unknown })?.id
  cacheEntity(resource, typeof realId === 'string' && opts.edition ? realId : id, data)
  return data
}

/**
 * Версии записи по редакциям: `GET /{entity}/{id}/editions`. `null` — сервер
 * не знает этого эндпоинта или записи; тогда судим по полю `editions`.
 */
const editionsCache = new Map<string, Promise<EditionsMap | null>>()

export function getEditions(resource: string, id: string): Promise<EditionsMap | null> {
  const key = `${resource}:${id}`
  let p = editionsCache.get(key)
  if (!p) {
    p = fetch(`${API_BASE}/${resource}/${id}/editions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => sanitizeEditionsMap(raw))
      .catch(() => null)
      .then((map) => {
        // неудача не залипает: в следующий раз спросим снова
        if (!map) editionsCache.delete(key)
        return map
      })
    editionsCache.set(key, p)
  }
  return p
}

let equipmentIndexPromise: Promise<EquipmentIndex> | null = null

/**
 * Всё снаряжение обеих редакций: индекс ищет по slug и id из грантов и
 * начального снаряжения — ссылка 2014 должна находиться и при общей 2024.
 */
export function getEquipmentIndex(): Promise<EquipmentIndex> {
  if (!equipmentIndexPromise) {
    equipmentIndexPromise = fetchAll<Equipment>('equipment', { edition: null })
      .then((list) => {
        const bySlug = new Map<string, Equipment>()
        const byId = new Map<string, Equipment>()
        for (const eq of list) {
          bySlug.set(eq.slug, eq)
          byId.set(eq.id, eq)
          // деталь предмета откроется мгновенно, без ожидания запроса
          cacheEntity('equipment', eq.id, eq)
        }
        return { list, bySlug, byId }
      })
      .catch((e: unknown) => {
        // иначе неудачная загрузка залипла бы синглтоном до перезагрузки страницы
        equipmentIndexPromise = null
        throw e
      })
  }
  return equipmentIndexPromise
}

/**
 * Справочники для фильтров и селектов. `null` вместо исключения, если бэкенд
 * ещё/уже без этого роутера — UI просто прячет соответствующие фильтры.
 */
let metaEnumsPromise: Promise<MetaEnums | null> | null = null

export function getMetaEnums(): Promise<MetaEnums | null> {
  if (!metaEnumsPromise) {
    metaEnumsPromise = fetch(`${API_BASE}/meta/enums`)
      .then((res) => (res.ok ? (res.json() as Promise<MetaEnums>) : null))
      .catch(() => null)
  }
  return metaEnumsPromise
}

/** Несколько записей по id (для предысторий книги — API не отдаёт их в /contents) */
export async function getManyByIds<T>(resource: string, ids: string[]): Promise<T[]> {
  const unique = [...new Set(ids)]
  const out: T[] = []
  for (const id of unique) {
    try {
      out.push(await getOne<T>(resource, id))
    } catch {
      /* skip missing */
    }
  }
  return out
}

/** Дополняет contents предысториями из book.new_backgrounds */
export async function enrichBookContents(
  contents: BookContents,
  book: Pick<Book, 'new_backgrounds'>,
): Promise<BookContents> {
  if ((contents.backgrounds?.length ?? 0) > 0) return contents
  const ids = book.new_backgrounds ?? []
  if (ids.length === 0) return contents
  const backgrounds = await getManyByIds<Background>('backgrounds', ids)
  return { ...contents, backgrounds: backgrounds as unknown as Record<string, unknown>[] }
}

/** Сводит предыстории нескольких книг в общий contents */
export async function enrichBooksBackgrounds(contents: BookContents, books: Book[]): Promise<BookContents> {
  const ids = [...new Set(books.flatMap((b) => b.new_backgrounds ?? []))]
  if (ids.length === 0) return contents
  const fetched = await getManyByIds<Background>('backgrounds', ids)
  const merged = { ...contents }
  const list = [...(merged.backgrounds ?? [])]
  const seen = new Set(list.map((e) => String(e.id)))
  for (const bg of fetched) {
    if (seen.has(bg.id)) continue
    seen.add(bg.id)
    list.push(bg as unknown as Record<string, unknown>)
  }
  merged.backgrounds = list
  return merged
}

/** Вспомогательные под-списки: /classes/{id}/subclasses, /races/{id}/subraces */
export async function getSubList<T>(resource: string, id: string, sub: string, edition: Edition | null = null): Promise<T[]> {
  // Редакцию называет вызывающий — это редакция, которую показывает родитель
  // (shownEdition): класс 2014 при общей 2024 должен получить подклассы 2014.
  // Без редакции — дети всех версий родителя, как раньше.
  const qs = appendEdition(new URLSearchParams(), sub, edition).toString()
  const res = await fetch(`${API_BASE}/${resource}/${id}/${sub}${qs ? `?${qs}` : ''}`)
  if (!res.ok) return []
  const data: T[] | { items: T[] } = await res.json()
  return Array.isArray(data) ? data : data.items
}

/**
 * Подрасы расы без точных дублей. При импорте одна и та же подраса местами
 * записана дважды (то же имя и тот же текст) — такие схлопываем. Записи с
 * одинаковым именем, но разным текстом и бонусами — это разные подрасы
 * с неудачным заголовком, их оставляем.
 */
export async function getSubraces(raceId: string, edition: Edition | null = null): Promise<Subrace[]> {
  const list = await getSubList<Subrace>('races', raceId, 'subraces', edition)
  const seen = new Set<string>()
  return list.filter((sr) => {
    const key = `${sr.subrace_name}|${sr.traits ?? sr.description ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Запасной арт баннера, если у сеттинга нет settings_picture_urls.
 */
export function settingArt(titleEn: string | null, titleRu: string, w = 420, h = 800): string {
  const q = encodeURIComponent(`Dungeons and Dragons ${titleEn ?? titleRu} setting fantasy art`)
  return `https://tse1.mm.bing.net/th?q=${q}&w=${w}&h=${h}&c=7&pid=Api`
}

/** Картинка баннера сеттинга: сначала media из API, иначе settingArt. */
export function settingPictureUrl(
  setting: Pick<Setting, 'settings_picture_urls' | 'settings_title'>,
  w = 420,
  h = 800,
): string {
  const url = setting.settings_picture_urls?.[0]
  if (url) return url
  const { ru, en } = splitTitle(setting.settings_title)
  return settingArt(en, ru, w, h)
}

export async function getBookFull(id: string): Promise<BookFull> {
  const res = await fetch(`${API_BASE}/books/${id}/full`)
  if (!res.ok) throw new Error(`book: ${res.status}`)
  return res.json()
}

export async function getBookContents(id: string): Promise<BookContents> {
  const res = await fetch(`${API_BASE}/books/${id}/contents`)
  if (!res.ok) throw new Error(`contents: ${res.status}`)
  return res.json()
}

export function totalsOf(books: Book[]): ContentTotals {
  const n = (a: string[] | null | undefined) => a?.length ?? 0
  return books.reduce(
    (t, b) => ({
      classes: t.classes + n(b.new_classes),
      subclasses: t.subclasses + n(b.new_subclasses),
      races: t.races + n(b.new_races),
      subraces: t.subraces + n(b.new_subraces),
      feats: t.feats + n(b.new_feats),
      backgrounds: t.backgrounds + n(b.new_backgrounds),
      spells: t.spells + n(b.new_spells),
      items: t.items + n(b.new_items),
    }),
    { classes: 0, subclasses: 0, races: 0, subraces: 0, feats: 0, backgrounds: 0, spells: 0, items: 0 },
  )
}

/**
 * Редакция поиска: по одному разделу — его редакция, по нескольким или по
 * всем — общая. Сущности вне редакций сервер не фильтрует.
 */
export function searchEdition(entities: string[] | undefined): Edition {
  const one = entities?.length === 1 ? entities[0] : null
  return one && isEditionSection(one) ? sectionEdition(one) : globalEdition()
}

export function searchQueryParams(q: string, opts: { entities?: string[]; skip?: number; limit?: number; edition?: EditionOpt } = {}): URLSearchParams {
  const params = new URLSearchParams({ q, skip: String(opts.skip ?? 0), limit: String(opts.limit ?? 20) })
  for (const e of opts.entities ?? []) params.append('entities', e)
  const edition = opts.edition === undefined ? searchEdition(opts.entities) : opts.edition
  if (edition) params.set('edition', edition)
  return params
}

/** Поиск по каталогу: русский, английский, неверная раскладка и опечатки */
export function searchCatalog(q: string, opts: { entities?: string[]; skip?: number; limit?: number; signal?: AbortSignal; edition?: EditionOpt } = {}): Promise<SearchResult> {
  return request<SearchResult>(`/search?${searchQueryParams(q, opts)}`, { auth: 'optional', signal: opts.signal })
}
