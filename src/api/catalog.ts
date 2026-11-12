import { registerTermLinks } from '../terms/registry'
import { API_BASE, request } from './http'
import type { Background, Book, BookContents, BookFull, BookMap, ContentTotals, Equipment, EquipmentIndex, GameClass, MetaEnums, Paged, SearchResult, Setting, Subrace } from './types'
import { splitTitle } from './text'

export async function fetchPage<T>(
  resource: string,
  opts: { skip?: number; limit?: number; q?: string } = {},
): Promise<Paged<T>> {
  const params = new URLSearchParams()
  params.set('skip', String(opts.skip ?? 0))
  params.set('limit', String(opts.limit ?? 50))
  if (opts.q) params.set('q', opts.q)
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
export async function fetchAll<T>(resource: string, opts: { q?: string } = {}, cap = 3000): Promise<T[]> {
  const first = await fetchPage<T>(resource, { skip: 0, limit: 500, q: opts.q })
  const all = [...first.items]
  const total = Math.min(first.total, cap)
  while (all.length < total) {
    const page = await fetchPage<T>(resource, { skip: all.length, limit: 500, q: opts.q })
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

export async function getOne<T>(resource: string, id: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${resource}/${id}`)
  if (!res.ok) throw new Error(`${resource}: ${res.status}`)
  const data = (await res.json()) as T
  // ссылки на термины в текстах детали — до того, как текст отрисуется
  registerTermLinks(data)
  cacheEntity(resource, id, data)
  return data
}

let equipmentIndexPromise: Promise<EquipmentIndex> | null = null

export function getEquipmentIndex(): Promise<EquipmentIndex> {
  if (!equipmentIndexPromise) {
    equipmentIndexPromise = fetchAll<Equipment>('equipment')
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
export async function getSubList<T>(resource: string, id: string, sub: string): Promise<T[]> {
  const res = await fetch(`${API_BASE}/${resource}/${id}/${sub}`)
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
export async function getSubraces(raceId: string): Promise<Subrace[]> {
  const list = await getSubList<Subrace>('races', raceId, 'subraces')
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

/** Поиск по каталогу: русский, английский, неверная раскладка и опечатки */
export function searchCatalog(q: string, opts: { entities?: string[]; skip?: number; limit?: number; signal?: AbortSignal } = {}): Promise<SearchResult> {
  const params = new URLSearchParams({ q, skip: String(opts.skip ?? 0), limit: String(opts.limit ?? 20) })
  for (const e of opts.entities ?? []) params.append('entities', e)
  return request<SearchResult>(`/search?${params}`, { auth: 'optional', signal: opts.signal })
}
