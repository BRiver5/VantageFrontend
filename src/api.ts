/**
 * API без CORS-заголовков, поэтому запросы идут через same-origin `/api`
 * (в dev/preview его проксирует Vite, см. vite.config.ts; в проде нужен
 * такой же прокси на хостинге). Переопределяется через VITE_API_BASE.
 */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export interface Setting {
  id: string
  settings_title: string
  settings_description: string | null
  settings_picture_urls: string[]
}

export interface Book {
  id: string
  title: string
  book_code: string
  author: string
  book_cover_url: string | null
  settings_id: string | null
  is_basic: boolean
  pages_count: number
  published_date: string | null
  supported_versions: string[] | null
  new_classes: string[] | null
  new_races: string[] | null
  new_subclasses: string[] | null
  new_subraces: string[] | null
  new_feats: string[] | null
  new_backgrounds: string[] | null
  new_items: string[] | null
  new_spells: string[] | null
}

export interface BookFull extends Book {
  new_classes_count: number
  new_races_count: number
  new_subclasses_count: number
  new_subraces_count: number
  new_feats_count: number
  new_backgrounds_count: number
  new_items_count: number
  new_spells_count: number
}

export interface GameClass {
  id: string
  class_name: string
  description: string | null
  image_gallery: string[] | null
  hit_dice: number
  is_caster: boolean
  saving_throw_proficiencies: string[] | null
  armor_proficiencies: string[] | null
  weapon_proficiencies: string[] | null
  book_source_id: string | null
}

export interface Subclass {
  id: string
  subclass_name: string
  parent_class_id: string
  subclass_flavor: string | null
  description: string | null
  level_available: number | null
  is_caster: boolean
  book_source_id: string | null
}

export interface Subrace {
  id: string
  subrace_name: string
  parent_race_id: string
  description: string | null
  traits: string | null
  increase_ability_scores: Record<string, number> | null
  extra_languages: string[] | null
  speed_bonus: number
  darkvision_override: number | null
  flight_speed: number
  swimming_speed: number
  climbing_speed: number
  book_source_id: string | null
}

export interface Race {
  id: string
  race_name: string
  description: string | null
  image_gallery: string[] | null
  increase_ability_scores: Record<string, number> | null
  size: string | null
  speed: number
  darkvision: number
  flight_speed: number
  swimming_speed: number
  climbing_speed: number
  race_type: string | null
  languages: string[] | null
  age_of_adulthood: number | null
  max_age: number | null
  book_source_id: string | null
}

export interface Spell {
  id: string
  spell_name: string
  spell_level: number
  school: string | null
  casting_time: string | null
  range: string | null
  duration: string | null
  concentration: boolean
  ritual: boolean
  components: { verbal?: boolean; somatic?: boolean; material?: boolean } | null
  material_components: string | null
  description: string | null
  higher_levels: string | null
  available_classes: string[] | null
  available_subclasses: string[] | null
  available_races: string[] | null
  spell_source: string | null
}

/** Черта/действие существа: обычно { name, description }, но ключи бывают любыми */
export type CreatureTrait = Record<string, string | null | undefined>

export interface Creature {
  id: string
  name: string
  description: string | null
  creature_description: string | null
  image_gallery: string[] | null
  image_url: string[] | null
  size: string | null
  creature_type: string | null
  alignment: string | null
  ac: number
  ac_source: string | null
  hp: number
  hp_formula: string | null
  speed: number | null
  flight_speed: number | null
  swim_speed: number | null
  burrow_speed: number | null
  climb_speed: number | null
  strenght: number | null
  dexterity: number | null
  constitution: number | null
  intelligence: number | null
  wisdom: number | null
  charisma: number | null
  saving_throws: Record<string, number> | null
  skills: Record<string, number> | null
  damage_imunities: string[] | null
  damage_resistances: string[] | null
  damage_vulnerabilities: string[] | null
  condition_imunities: string[] | null
  night_vision: number | null
  blind_vision: number | null
  true_vision: number | null
  languages: string[] | null
  challenge_rating: number | null
  proficiency_bonus: number | null
  area_of_living: string[] | null
  features: CreatureTrait[] | null
  actions: CreatureTrait[] | null
  actions_description: string | null
  legendary_actions: CreatureTrait[] | null
  legendary_description: string | null
  mythical_actions: CreatureTrait[] | null
  is_unique: boolean
  is_npc: boolean
  book_source_id: string | null
}

export interface Feat {
  id: string
  feat_name: string
  description: string | null
  prerequisite: string | null
  increase_ability_scores: Record<string, number> | null
  image_gallery: string[] | null
  book_source_id: string | null
}

export interface Item {
  id: string
  item_name: string
  item_type: string | null
  rarity: string | null
  attunement_required: boolean
  weight: number | null
  cost_copper: number | null
  description: string | null
  item_image_gallery: string[] | null
  item_source: string | null
}

export interface Paged<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

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

/** Карта книг по id — для отображения источника (аббревиатура + полное название) */
export type BookMap = Record<string, Book>

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

export async function getOne<T>(resource: string, id: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${resource}/${id}`)
  if (!res.ok) throw new Error(`${resource}: ${res.status}`)
  return res.json()
}

/** Вспомогательные под-списки: /classes/{id}/subclasses, /races/{id}/subraces */
export async function getSubList<T>(resource: string, id: string, sub: string): Promise<T[]> {
  const res = await fetch(`${API_BASE}/${resource}/${id}/${sub}`)
  if (!res.ok) return []
  const data: T[] | { items: T[] } = await res.json()
  return Array.isArray(data) ? data : data.items
}

/**
 * Арт для баннера сеттинга. У API нет картинок сеттингов
 * (settings_picture_urls пустые), поэтому строим URL миниатюры Bing —
 * тем же способом, каким бэкенд формирует book_cover_url у книг.
 */
export function settingArt(titleEn: string | null, titleRu: string, w = 420, h = 800): string {
  const q = encodeURIComponent(`Dungeons and Dragons ${titleEn ?? titleRu} setting fantasy art`)
  return `https://tse1.mm.bing.net/th?q=${q}&w=${w}&h=${h}&c=7&pid=Api`
}

export async function getBookFull(id: string): Promise<BookFull> {
  const res = await fetch(`${API_BASE}/books/${id}/full`)
  if (!res.ok) throw new Error(`book: ${res.status}`)
  return res.json()
}

/** Всё содержимое книги: списки записей каталога, ссылающихся на неё */
export type BookContents = Record<string, Record<string, unknown>[]>

export async function getBookContents(id: string): Promise<BookContents> {
  const res = await fetch(`${API_BASE}/books/${id}/contents`)
  if (!res.ok) throw new Error(`contents: ${res.status}`)
  return res.json()
}

/** Имя записи каталога независимо от типа (class_name / race_name / name …) */
export function displayName(entry: Record<string, unknown>): string {
  for (const key of Object.keys(entry)) {
    if ((key === 'name' || key.endsWith('_name')) && typeof entry[key] === 'string') {
      return entry[key] as string
    }
  }
  return '—'
}

/** Суммарные нововведения по набору книг */
export interface ContentTotals {
  classes: number
  subclasses: number
  races: number
  subraces: number
  feats: number
  backgrounds: number
  spells: number
  items: number
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

/** «Книга игрока [Player's Handbook]» → { ru: 'Книга игрока', en: "Player's Handbook" } */
export function splitTitle(title: string): { ru: string; en: string | null } {
  const m = title.match(/^(.*?)\s*\[(.+?)\]\s*$/)
  if (!m) return { ru: title, en: null }
  return { ru: m[1].trim() || m[2], en: m[2] }
}

/** Убирает служебную строку «Источник: «…»» из начала описания */
export function cleanDescription(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/^Источник:\s*«[^»]*»\s*/u, '').trim()
}

/** Плейсхолдер dnd.su вместо настоящей картинки */
export function realImage(urls: string[] | null | undefined): string | null {
  const u = urls?.find((x) => x && !x.includes('thumbnail'))
  return u ?? null
}

/** Показатель опасности: 0.125 → «1/8» */
export function formatCR(cr: number | null): string {
  if (cr == null) return '—'
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

export const ABILITY_RU: Record<string, string> = {
  strength: 'СИЛ',
  dexterity: 'ЛОВ',
  constitution: 'ТЕЛ',
  intelligence: 'ИНТ',
  wisdom: 'МДР',
  charisma: 'ХАР',
}
