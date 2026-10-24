import type { AbilityRef } from './abilities/abilityData'
import { clearAccessToken, getAccessToken, TOKEN_EXPIRED_EVENT } from './auth/token'
import type {
  LoginBody,
  PatchMeBody,
  RegisterBody,
  TokenResponse,
  UserMe,
} from './types/auth'
import type {
  Character,
  CharacterEvent,
  CharacterInput,
  LevelUpResult,
  RunInputs,
  RunResult,
  Sheet,
} from './types/character'
import { characterPayload } from './types/character'

export type { Character, CharacterInput, Sheet } from './types/character'
export type {
  LoginBody,
  PatchMeBody,
  RegisterBody,
  TokenResponse,
  UserMe,
  PublicUser,
  UserPreferences,
  DicePreferences,
  CharacterVisibility,
  Locale,
  UserRole,
} from './types/auth'
export { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from './types/character'
export { DEFAULT_DICE_PREFERENCES } from './types/auth'

/**
 * API без CORS-заголовков, поэтому запросы идут через same-origin `/api`
 * (в dev/preview его проксирует Vite, см. vite.config.ts; в проде нужен
 * такой же прокси на хостинге). Переопределяется через VITE_API_BASE.
 */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

type RequestOpts = {
  method?: string
  body?: unknown
  /** If true, require token and send Authorization. If 'optional', send when present. */
  auth?: boolean | 'optional'
  signal?: AbortSignal
}

/**
 * Текст ошибки FastAPI: строка как есть, ошибки валидации (422) — списком
 * «поле: сообщение», а не «[object Object]».
 */
function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (!e || typeof e !== 'object') return String(e)
        const { loc, msg } = e as { loc?: unknown[]; msg?: string }
        const field = (loc ?? []).filter((x) => x !== 'body').join('.')
        return field ? `${field}: ${msg ?? ''}` : (msg ?? '')
      })
      .join('; ')
  }
  return JSON.stringify(detail)
}

/** Сервер ещё на старой схеме персонажа (v1): ждёт basic_info и т.п. */
export function isLegacySchemaError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 422 && /basic_info|ability_scores|combat/.test(e.message)
}

/**
 * Универсальный fetch к API. Каталог по-прежнему может использовать fetchPage/getOne;
 * auth и characters — через request().
 */
export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = opts
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const token = getAccessToken()
  if (auth === true) {
    if (!token) throw new ApiError('Требуется авторизация', 401)
    headers.Authorization = `Bearer ${token}`
  } else if (auth === 'optional' && token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  // токен с запросом ушёл, а сервер его не принял — значит, истёк: выходим
  if (res.status === 401 && headers.Authorization) {
    clearAccessToken()
    window.dispatchEvent(new Event(TOKEN_EXPIRED_EVENT))
  }

  if (!res.ok) {
    const raw = data && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : null
    throw new ApiError(raw != null ? detailText(raw) : `${path}: ${res.status}`, res.status, data)
  }

  return data as T
}

/* ---------- Auth ---------- */

export function register(body: RegisterBody): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/register', { method: 'POST', body })
}

export function login(body: LoginBody): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/login', { method: 'POST', body })
}

export function getMe(): Promise<UserMe> {
  return request<UserMe>('/auth/me', { auth: true })
}

export function patchMe(body: PatchMeBody): Promise<UserMe> {
  return request<UserMe>('/auth/me', { method: 'PATCH', body, auth: true })
}

/* ---------- Characters (schema v2) ---------- */

/** Ответ списка: массив или страница { items } — сервер отдаёт по-разному */
function itemsOf<T>(data: T[] | { items: T[] } | null): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray(data.items)) return data.items
  return []
}

export async function listMyCharacters(): Promise<Character[]> {
  return itemsOf(await request<Character[] | { items: Character[] }>('/me/characters', { auth: true }))
}

export async function listCharacters(opts: { mine?: boolean; q?: string } = {}): Promise<Character[]> {
  const params = new URLSearchParams()
  if (opts.mine) params.set('mine', 'true')
  if (opts.q) params.set('q', opts.q)
  const qs = params.toString()
  return itemsOf(
    await request<Character[] | { items: Character[] }>(`/characters${qs ? `?${qs}` : ''}`, {
      auth: opts.mine ? true : 'optional',
    }),
  )
}

export function getCharacter(id: string): Promise<Character> {
  return request<Character>(`/characters/${id}`, { auth: 'optional' })
}

/** Создать: только выбор игрока; способности по источникам сервер выдаст сам */
export function createCharacter(body: CharacterInput): Promise<Character> {
  return request<Character>('/characters', {
    method: 'POST',
    body: characterPayload(body),
    auth: true,
  })
}

/** PATCH — только изменённые поля; поля движка сервер не принимает */
export function updateCharacter(id: string, body: CharacterInput): Promise<Character> {
  return request<Character>(`/characters/${id}`, {
    method: 'PATCH',
    body: characterPayload(body),
    auth: true,
  })
}

export function deleteCharacter(id: string): Promise<void> {
  return request<void>(`/characters/${id}`, { method: 'DELETE', auth: true })
}

/* ---------- Лист и движок ---------- */

const ch = (id: string, path = '') => `/characters/${id}${path}`

/** Вычисленный лист: все числа, ресурсы, ячейки и доступные действия */
export function getSheet(id: string): Promise<Sheet> {
  return request<Sheet>(ch(id, '/sheet'), { auth: 'optional' })
}

/** Действие способности; при needs_input повторяется с накопленными ответами */
export function runAction(
  id: string,
  grantId: string,
  actionKey: string,
  inputs: RunInputs = {},
  dryRun = false,
): Promise<RunResult> {
  return request<RunResult>(ch(id, `/actions/${encodeURIComponent(grantId)}/${encodeURIComponent(actionKey)}`), {
    method: 'POST',
    body: { inputs, dry_run: dryRun },
    auth: true,
  })
}

/** Отдых; для короткого — сколько костей хитов какого класса бросить */
export function rest(id: string, kind: 'short' | 'long', hitDice: Record<string, number> = {}): Promise<RunResult> {
  return request<RunResult>(ch(id, '/rest'), {
    method: 'POST',
    body: kind === 'short' ? { kind, hit_dice: hitDice } : { kind },
    auth: true,
  })
}

export type VitalsOp = 'damage' | 'heal' | 'temp' | 'inspiration' | 'death_save'

/**
 * Хиты от игрока: урон (с типом — учтутся сопротивления и облик), лечение,
 * временные хиты, вдохновение (amount — прибавка, может быть отрицательной),
 * спасброски от смерти (amount — новое значение дорожки success/failure).
 */
export function applyVitals(
  id: string,
  body: { op: VitalsOp; amount: number; damage_type?: string | null; success?: boolean },
): Promise<RunResult> {
  return request<RunResult>(ch(id, '/vitals'), { method: 'POST', body, auth: true })
}

export type TurnEvent = 'turn.start' | 'turn.end' | 'combat.start' | 'combat.end'

export function sendEvent(id: string, name: TurnEvent, payload: Record<string, unknown> = {}): Promise<RunResult> {
  return request<RunResult>(ch(id, `/events/${name}`), { method: 'POST', body: { payload }, auth: true })
}

/** Новый уровень в классе; новый class_id — мультикласс; без hp_roll — среднее */
export function levelUp(
  id: string,
  body: { class_id: string; subclass_id?: string | null; hp_roll?: number | null },
): Promise<LevelUpResult> {
  return request<LevelUpResult>(ch(id, '/level-up'), { method: 'POST', body, auth: true })
}

export function resolvePending(id: string, decisionId: string, inputs: RunInputs = {}): Promise<RunResult> {
  return request<RunResult>(ch(id, `/pending/${encodeURIComponent(decisionId)}`), {
    method: 'POST',
    body: { inputs },
    auth: true,
  })
}

export function dismissPending(id: string, decisionId: string): Promise<Sheet> {
  return request<Sheet>(ch(id, `/pending/${encodeURIComponent(decisionId)}`), { method: 'DELETE', auth: true })
}

export function attachAbility(
  id: string,
  slug: string,
  choices: Record<string, unknown> = {},
): Promise<{ grant_id: string; sheet: Sheet }> {
  return request(ch(id, '/abilities'), { method: 'POST', body: { slug, choices }, auth: true })
}

export function detachAbility(id: string, grantId: string): Promise<Sheet> {
  return request<Sheet>(ch(id, `/abilities/${encodeURIComponent(grantId)}`), { method: 'DELETE', auth: true })
}

export function toggleAbility(id: string, grantId: string, enabled: boolean): Promise<Sheet> {
  return request<Sheet>(ch(id, `/abilities/${encodeURIComponent(grantId)}`), {
    method: 'PATCH',
    body: { enabled },
    auth: true,
  })
}

export function syncAbilities(id: string): Promise<{ changes: string[]; sheet: Sheet }> {
  return request(ch(id, '/sync'), { method: 'POST', auth: true })
}

export function listEvents(id: string, limit = 50): Promise<CharacterEvent[]> {
  return request<CharacterEvent[]>(ch(id, `/events?limit=${limit}`), { auth: true })
}

export function undoEvent(id: string, eventId: string): Promise<Sheet> {
  return request<Sheet>(ch(id, `/events/${encodeURIComponent(eventId)}/undo`), { method: 'POST', auth: true })
}

/** Правка мастера (только админ): хранимые значения и оверрайды; null снимает оверрайд */
export function patchStore(
  id: string,
  body: { set?: Record<string, unknown>; overrides?: Record<string, unknown> },
): Promise<Sheet> {
  return request<Sheet>(ch(id, '/store'), { method: 'PATCH', body, auth: true })
}

/** Словари движка: русские подписи навыков, типов урона, состояний */
export interface EngineDictionaries {
  abilities: { value: string; label: string }[]
  skills: { value: string; label: string; ability: string }[]
  damage_types: { value: string; label: string }[]
  conditions: { value: string; label: string }[]
  classes: { value: string; label: string }[]
}

/** Словари и подписи переменных персонажа: var.sneak_attack_dice → «Кости скрытой атаки» */
export interface EngineCatalog {
  dictionaries: EngineDictionaries | null
  labels: Record<string, string>
}

/** Каталог с переменными, которые объявили способности этого персонажа */
export async function getEngineCatalog(characterId: string): Promise<EngineCatalog> {
  const c = await request<{ dictionaries?: EngineDictionaries; paths?: { path: string; label?: string }[] }>(
    `/engine/catalog?character_id=${encodeURIComponent(characterId)}`,
    { auth: 'optional' },
  )
  const labels: Record<string, string> = {}
  for (const p of c.paths ?? []) if (p.label) labels[p.path] = p.label
  return { dictionaries: c.dictionaries ?? null, labels }
}

let dictionariesPromise: Promise<EngineDictionaries | null> | null = null

export function getEngineDictionaries(): Promise<EngineDictionaries | null> {
  if (!dictionariesPromise) {
    dictionariesPromise = request<{ dictionaries?: EngineDictionaries }>('/engine/catalog')
      .then((c) => c.dictionaries ?? null)
      .catch(() => {
        dictionariesPromise = null
        return null
      })
  }
  return dictionariesPromise
}

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
  /** стабильный ключ класса в листе: char.class.<slug>.level */
  slug?: string | null
  /** уровень, на котором выбирается подкласс */
  subclass_level?: number | null
  /** способности, которые источник выдаёт персонажу (slug и уровень) */
  abilities?: AbilityRef[] | null
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
  /** способности, которые источник выдаёт персонажу (slug и уровень) */
  abilities?: AbilityRef[] | null
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
  slug?: string | null
  /** базовая скорость и размер подрасы, если отличаются от расы */
  speed?: number | null
  size?: string | null
  /**
   * Самостоятельный вариант (дуэргар MPMM, альтернативный человек, марки
   * Эберрона): черты и характеристики базовой расы не применяются
   */
  replaces_race?: boolean
  /** способности, которые источник выдаёт персонажу (slug и уровень) */
  abilities?: AbilityRef[] | null
}

export interface Race {
  id: string
  race_name: string
  slug?: string | null
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
  /** способности, которые источник выдаёт персонажу (slug и уровень) */
  abilities?: AbilityRef[] | null
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
  /** способности, которые источник выдаёт персонажу (slug и уровень) */
  abilities?: AbilityRef[] | null
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
  /** картинка с бэка (монеты в кошеле и т.п.); иначе берём из каталога по slug */
  image_gallery?: string[] | null
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
  /** картинка с бэка в гранте; иначе берём из каталога по slug */
  image_gallery?: string[] | null
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
  /** способности, которые источник выдаёт персонажу (slug и уровень) */
  abilities?: AbilityRef[] | null
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
  const isHtml = /<[a-z!/][\s\S]*>/i.test(text)
  // для превью выкидываем эпиграф-цитату (blockquote) — иначе карточка расы
  // начинается с художественной цитаты, а не с описания
  const src = isHtml ? text.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '') : text
  const plain = isHtml ? htmlToText(src) : src
  return plain.replace(/^Источник:\s*«[^»]*»\s*/u, '').trim()
}

/** Короткое превью описания для карточек каталога (очищает HTML и подрезает). */
export function descriptionPreview(text: string | null | undefined, max = 300): string {
  const clean = cleanDescription(text)
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '').trimEnd() + '…'
}

/**
 * Умное сокращение длинного заголовка: обрезает конец предпоследнего слова
 * и ставит «…», оставляя последнее слово целым.
 * «Потомок знаменитого авантюриста» → «Потомок знаменит… авантюриста»
 */
export function ellipsizePenultimate(text: string, maxLen: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (maxLen < 2) return '…'
  if (t.length <= maxLen) return t

  const words = t.split(' ')
  if (words.length < 2) return t.slice(0, maxLen - 1) + '…'

  const last = words[words.length - 1]
  const penult = words[words.length - 2]
  const prefix = words.slice(0, -2)
  const prefixStr = prefix.length ? prefix.join(' ') + ' ' : ''
  // `${prefixStr}${short}… ${last}`
  const reserved = prefixStr.length + 1 /*…*/ + 1 /* пробел */ + last.length
  const letterBudget = maxLen - reserved
  if (letterBudget < 2) return t.slice(0, maxLen - 1) + '…'
  if (penult.length <= letterBudget) return t.slice(0, maxLen - 1) + '…'
  return `${prefixStr}${penult.slice(0, letterBudget)}… ${last}`
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

/** Тип существа (race_type / creature_type) — по-русски */
const CREATURE_TYPE_RU: Record<string, string> = {
  aberration: 'Аберрация',
  beast: 'Зверь',
  celestial: 'Небожитель',
  construct: 'Конструкт',
  dragon: 'Дракон',
  elemental: 'Элементаль',
  fey: 'Фея',
  fiend: 'Исчадие',
  giant: 'Великан',
  humanoid: 'Гуманоид',
  monstrosity: 'Монстр',
  ooze: 'Слизь',
  plant: 'Растение',
  undead: 'Нежить',
}
export function creatureTypeRu(type: string | null | undefined): string | null {
  if (!type) return null
  const key = type.trim().toLowerCase()
  return CREATURE_TYPE_RU[key] ?? type
}

export const ABILITY_RU: Record<string, string> = {
  strength: 'СИЛ',
  dexterity: 'ЛОВ',
  constitution: 'ТЕЛ',
  intelligence: 'ИНТ',
  wisdom: 'МДР',
  charisma: 'ХАР',
}
