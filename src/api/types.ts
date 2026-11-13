import type { AbilityRef } from '../abilities/abilityData'

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
  /** что заклинание делает: сервер творит его по этим данным */
  mechanics?: SpellMechanics | null
}

export interface SpellMechanics {
  /** как наводить на карте (сервер карт) */
  targeting?: import('../maps/types').SpellTargeting | null
  /** full — сервер считает всё; narrative — тратит ячейку и ставит метку, остальное по notes */
  status: 'full' | 'narrative' | 'partial'
  level: number
  casting: { unit: 'action' | 'bonus' | 'reaction' | 'minute' | 'hour'; amount: number; reaction_trigger?: string }
  ritual: boolean
  concentration: boolean
  duration: { kind: string; amount?: number; up_to: boolean }
  range: { kind: 'self' | 'touch' | 'ranged' | 'sight' | 'unlimited' | 'special'; feet?: number }
  area?: { shape: string; size_ft: number; width_ft?: number; origin: 'self' | 'point' } | null
  targets?: { count: number | 'any' | null; kind: 'creature' | 'object' | 'point' | 'self' | 'area'; allies?: boolean } | null
  attack?: 'melee_spell' | 'ranged_spell' | null
  save?: { ability: string; on_success: 'half' | 'none' | 'negate_effect' } | null
  damage: { dice: string; type: string | null; choices?: string[]; add_mod: boolean; rider: boolean }[]
  heal?: { dice: string; add_mod: boolean } | null
  temp_hp?: { dice: string; add_mod: boolean } | null
  upcast?: { per_level: { dice?: string; heal_dice?: string; targets?: number; projectiles?: number; size_ft?: number }; from_level: number; every: number; max_dice?: string; note?: string } | null
  cantrip_scaling?: { dice: string; levels: number[]; projectiles: boolean } | null
  projectiles?: { count: number; per_level: number; damage: { dice: string; type: string }; attack: boolean; shared_roll: boolean } | null
  effect?: { label: string; condition?: string; save_each_turn?: 'start' | 'end'; on: 'target' | 'self'; expires: string; choices: string[] } | null
  summons?: { name: string; count: string; choose_count: boolean; from_catalog: boolean; notes?: string | null }[]
  /** вопросы перед сотворением: вид урона, форма призыва, ячейка */
  ui?: { title: string; inputs: { key: string; label: string; type: string; min?: string | number; options?: { value: string; label: string }[] }[] }[] | null
  notes?: string | null
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

/** Карта книг по id — для отображения источника (аббревиатура + полное название) */
export type BookMap = Record<string, Book>

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

/** Всё содержимое книги: списки записей каталога, ссылающихся на неё */
export type BookContents = Record<string, Record<string, unknown>[]>

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

/* ---------- Поиск по всему каталогу ---------- */

export interface SearchHit {
  entity: string
  entity_title: string
  id: string
  title: string
  alias: string | null
  snippet: string | null
  match: string
  score: number
}

export interface SearchResult {
  query: string
  total: number
  skip: number
  limit: number
  /** сколько нашлось в каждом разделе — для фильтров */
  counts: Record<string, number>
  items: SearchHit[]
}
