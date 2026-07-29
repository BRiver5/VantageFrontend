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
  /** опционально: у неразмеченных классов может не быть или прийти пустым */
  starting_equipment?: EquipmentGrant[] | null
  /** сырой текст из книги, включая альтернативу «взять золото вместо снаряжения» */
  starting_equipment_text?: string | null
}

export interface Subclass {
  id: string
  subclass_name: string
  parent_class_id: string
  subclass_flavor: string | null
  description: string | null
  image_gallery: string[] | null
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

/* ---------- Снаряжение ---------- */

export type Currency = 'cp' | 'sp' | 'ep' | 'gp' | 'pp'

export interface Cost {
  amount: number
  currency: Currency
}

/** Ссылка на вложенный предмет — всегда по slug, не по id */
export interface ContentEntry {
  slug: string
  quantity: number
}

/**
 * Профиль контейнера. Все три `accepts_*` пустые — принимает что угодно (рюкзак),
 * иначе достаточно совпадения хотя бы по одному списку. `sealed` — набор, из
 * которого содержимое вынимается, но обратно не складывается.
 */
export interface ContainerProfile {
  container_kind: string
  slots: number | null
  capacity_pounds: number | null
  capacity_cubic_feet: number | null
  accepts_slugs: string[]
  accepts_tags: string[]
  accepts_categories: string[]
  sealed: boolean
  default_contents: ContentEntry[]
}

export interface WeaponProfile {
  weapon_kind: string | null
  attack_kind: string | null
  damage_dice: string | null
  damage_type: string | null
  versatile_dice: string | null
  properties: string[]
  mastery: string | null
  ammunition_type: string | null
  range_normal: number | null
  range_long: number | null
}

export interface DefenseProfile {
  armor_class: number | null
  armor_class_formula: string | null
  armor_kind: string | null
  add_dex_modifier: boolean
  dex_modifier_cap: number | null
  strength_requirement: number | null
  stealth_disadvantage: boolean
  hit_points: number | null
  damage_threshold: number | null
}

export interface Equipment {
  id: string
  /** стабильный ключ вида «longbow-phb»; ссылки в грантах идут только по нему */
  slug: string
  equipment_name: string
  equipment_name_en: string | null
  category: string
  subcategory: string | null
  tags: string[]
  weight: number | null
  cost: Cost | null
  cost_copper: number | null
  /** размер пачки в каталоге («Стрелы (20)»), не путать с stack_size */
  bundle_size: number | null
  stackable: boolean
  stack_size: number
  container: ContainerProfile | null
  description: string | null
  weapon: WeaponProfile | null
  defense: DefenseProfile | null
  book_source_id: string | null
  source_url: string | null
  equipment_image_gallery: string[] | null
}

/**
 * Один предмет варианта выдачи. Ровно один режим: либо конкретный `slug`
 * (тогда возможны `contents` — стартовое наполнение контейнера), либо выбор из
 * каталога по непустым `choose_from_*` (пересечение измерений).
 */
export interface GrantEntry {
  slug: string | null
  quantity: number
  contents: ContentEntry[]
  choose_count: number
  choose_from_slugs: string[]
  choose_from_tags: string[]
  choose_from_categories: string[]
  choose_from_weapon_kinds: string[]
  choose_from_attack_kinds: string[]
  label: string | null
}

export interface GrantOption {
  /** «а» | «б» | «в»; null, если вариант единственный */
  marker: string | null
  note: string | null
  entries: GrantEntry[]
}

/** Один пункт стартового снаряжения: один option — фиксированная выдача, несколько — выбор */
export interface EquipmentGrant {
  label: string | null
  options: GrantOption[]
}

/** Справочники для селектов и фильтров — не хардкодим их на клиенте */
export interface MetaEnums {
  equipment_categories: string[]
  equipment_tags: string[]
  container_kinds: string[]
  weapon_kinds: string[]
  weapon_attack_kinds: string[]
  weapon_properties: string[]
  weapon_masteries: string[]
  damage_types: string[]
  armor_kinds: string[]
  currencies: Currency[]
  abilities: string[]
}

export interface Termin {
  id: string
  name: string
  description: string | null
  image_gallery: string[] | null
  book_source_id: string | null
}

export interface Background {
  id: string
  background_name: string
  description: string | null
  skill_proficiencies: string[] | null
  tool_proficiencies: string[] | null
  languages: string[] | null
  /** текст снаряжения из книги; разобранная версия — в starting_equipment */
  equipment: string | null
  starting_equipment?: EquipmentGrant[] | null
  feature_name: string | null
  feature_description: string | null
  image_gallery: string[] | null
  book_source_id: string | null
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
export const getClasses = () => fetchList<GameClass>('classes', 100)

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
  cacheEntity(resource, id, data)
  return data
}

/**
 * Каталог снаряжения целиком, с индексом по slug. Гранты классов и предысторий
 * ссылаются на предметы ТОЛЬКО по slug, а деталь открывается по uuid
 * (`/equipment/{slug}` отдаёт 422) — поэтому нужен индекс slug → запись.
 * Каталог небольшой (≈400 записей, одна страница по 500), поэтому тянем разово
 * и держим промис синглтоном: параллельные вызывающие получат тот же запрос.
 */
export interface EquipmentIndex {
  list: Equipment[]
  bySlug: Map<string, Equipment>
  byId: Map<string, Equipment>
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

const HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', shy: '',
}

/** Декодирует базовые HTML-сущности (именованные и числовые). */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    const rep = HTML_ENTITIES[code.toLowerCase()]
    return rep !== undefined ? rep : m
  })
}

/** Превращает HTML-разметку в читаемый простой текст (для превью-карточек и т.п.). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      // служебные блоки целиком
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      // дублирующее свёрнутое превью спойлера dnd.su
      .replace(/<blockquote class="spoiler_neck"[\s\S]*?<\/blockquote>/gi, '')
      // блочные теги → перенос строки
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|ul|ol|table)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // остальные теги убираем
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Убирает служебную строку «Источник: «…»» из начала описания */
export function cleanDescription(text: string | null | undefined): string {
  if (!text) return ''
  const plain = /<[a-z!/][\s\S]*>/i.test(text) ? htmlToText(text) : text
  return plain.replace(/^Источник:\s*«[^»]*»\s*/u, '').trim()
}

/** Короткое превью описания для карточек каталога (очищает HTML и подрезает). */
export function descriptionPreview(text: string | null | undefined, max = 300): string {
  const clean = cleanDescription(text)
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '').trimEnd() + '…'
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

/** Категории размера приходят по-английски — показываем по-русски */
const SIZE_RU: Record<string, string> = {
  tiny: 'Крошечный',
  small: 'Маленький',
  medium: 'Средний',
  large: 'Большой',
  huge: 'Огромный',
  gargantuan: 'Громадный',
}
export function sizeRu(size: string | null | undefined): string | null {
  if (!size) return null
  return SIZE_RU[size.trim().toLowerCase()] ?? size
}

export const ABILITY_RU: Record<string, string> = {
  strength: 'СИЛ',
  dexterity: 'ЛОВ',
  constitution: 'ТЕЛ',
  intelligence: 'ИНТ',
  wisdom: 'МДР',
  charisma: 'ХАР',
}
