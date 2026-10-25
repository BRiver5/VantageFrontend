import type { Equipment, Item } from '../api'
import type { CharacterVisibility } from './auth'

export type AbilityName =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma'

export type AbilityScoreBlock = {
  score: number
  saving_throw_proficient: boolean
  /** готовые числа с сервера; без них (черновик визарда) считаются из score */
  modifier?: number
  save?: number
}

export type SkillEntry = {
  ability: AbilityName
  proficient: boolean
  expertise: boolean
  modifier?: number | null
  passive_score?: number | null
}

export type CharacterClassEntry = {
  name: string
  level: number
  source?: string | null
  subclass_name?: string | null
  subclass_source?: string | null
  hit_die?: number
  is_caster?: boolean
  spellcasting_ability?: string | null
}

export type NamedSource = {
  name: string
  source?: string | null
}

/** Снимок подрасы в листе (SubraceSnapshot на сервере) */
export type SubraceInfo = NamedSource & {
  increase_ability_scores?: Record<string, number>
}

export type RaceInfo = NamedSource & {
  size?: string | null
  speed?: number | null
  [key: string]: unknown
}

export type AttackEntry = {
  name: string
  type: 'melee' | 'ranged' | 'spell' | 'other'
  attack_bonus: number
  damage: string
  damage_type: string
  range: string
  properties: string[]
  inventory_instance_id?: string | null
}

export type FeatureEntry = {
  name: string
  /** choice — выдана другим выбором (боевой стиль, воззвание); item — надетым предметом */
  source: 'class' | 'subclass' | 'race' | 'subrace' | 'background' | 'feat' | 'choice' | 'item' | 'other'
  level?: number | null
  description: string
  feature_source?: string | null
  /** умение движка: grant_id, slug, статус автоматизации и активно ли сейчас */
  grant_id?: string
  slug?: string
  /** отключено игроком: сервер не выдаёт его в листе, но в списке оно остаётся */
  disabled?: boolean
  implementation_status?: string
  active?: boolean
}

export type SpellKnown = {
  name: string
  level: number
  prepared: boolean
  spell_source?: string | null
  snapshot?: object | null
}

export type SpellSlot = {
  max: number
  used: number
  /** ячейки договора колдуна (slots.pact на сервере) */
  pact?: boolean
}

export type Spellcasting = {
  is_spellcaster: boolean
  spellcasting_ability?: AbilityName | null
  spell_save_dc?: number | null
  spell_attack_bonus?: number | null
  spell_slots: Record<string, SpellSlot>
  spells_known: SpellKnown[]
  cantrips_amount: number
  prepared_spells_max?: number | null
}

export type InventoryItemInstance = {
  instance_id: string
  kind: 'equipment' | 'magic_item'
  equipment: Equipment | null
  magic_item: Item | null
  catalog_ref?: string | null
  quantity: number
  notes: string
  position: { col: number; row: number }
  equipped: boolean
  equip_slot?: string | null
  is_attuned: boolean
}

export type CharacterInventory = {
  grid_width: 7
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number }
  items: InventoryItemInstance[]
  carrying_capacity_max?: number | null
}

/**
 * Вид листа — то, что рисуют CharacterSheet, HeroStage и SpellBook. Это не
 * документ сервера: у сохранённого героя его собирает sheetView.ts из
 * персонажа v2 и вычисленного листа (`/sheet`), у черновика визарда — buildCharacter.
 */
export type SheetView = {
  visibility: CharacterVisibility
  basic_info: {
    name: string
    race: RaceInfo
    subrace: SubraceInfo | null
    classes: CharacterClassEntry[]
    total_level: number
    background?: NamedSource | null
    alignment?: string
    experience_points?: number
    gender?: string
    age?: number | null
    height?: string
    weight?: string
    eyes?: string
    skin?: string
    hair?: string
    avatar_url?: string | null
    player_display_name?: string | null
  }
  ability_scores: Record<AbilityName, AbilityScoreBlock>
  proficiency_bonus: number
  skills: Record<string, SkillEntry>
  combat: {
    armor_class: number
    initiative: number
    speed: number
    hit_points: { max: number; current: number; temp: number }
    hit_dice: { total: string; remaining: number }
    death_saves: { successes: number; failures: number }
    passive_perception: number
    conditions: string[]
    inspiration: boolean
    shield: boolean
  }
  attacks: AttackEntry[]
  proficiencies: {
    armor: string[]
    weapons: string[]
    tools: string[]
    languages: string[]
  }
  features: FeatureEntry[]
  feats: string[]
  spellcasting: Spellcasting
  inventory: CharacterInventory
  personality: Personality
  backstory: string
  notes: string
  /** «откуда число»: вклады по пути значения (только у листа с сервера) */
  breakdown?: Record<string, Contribution[]>
  /** основа значения до вкладов */
  bases?: Record<string, SheetBase>
  /** slug способности → её название: подписи вкладов в расшифровке */
  sourceNames?: Record<string, string>
  /** значения, которые выдают способности движка (у предпросмотра визарда нет) */
  extras?: EngineExtras
}

/** Природное оружие и особые атаки способностей: когти, укус, клинки души */
export type NaturalAttack = { name: string; dice: string; type?: string; ability?: string; note?: string }

/** Заклинание от расы, подкласса или черты: «всегда подготовлено», «1/продолжительный отдых» */
export type GrantedSpell = { name: string; level?: number; ability?: string; uses?: string; note?: string }

export type EngineExtras = {
  /** атак за действие «Атака» */
  perAction: number
  /** крит от этого значения к20 */
  critMin: number
  /** кость безоружного удара; 1 — без кости */
  unarmedDie: number
  maneuvers: string[]
  /** особые правила-напоминания: char.flags.* */
  flags: { key: string; label: string }[]
  /** вычисляемые величины способностей: var.* */
  vars: { key: string; label: string; value: string }[]
  /** теги преимущества и помехи: ['str'] в ярости, ['melee_str'] у Безрассудной атаки */
  adv: { check: string[]; save: string[]; attack: string[] }
  disadv: { check: string[]; save: string[]; attack: string[] }
  /** бонусы к атаке и урону по тегам: char.attack_bonus.ranged, char.dmg_bonus.melee_str (Ярость) */
  attackBonus: Record<string, number>
  dmgBonus: Record<string, number>
}

export type Personality = { traits: string; ideals: string; bonds: string; flaws: string }

/* ---------- персонаж v2: только входные данные ---------- */

/** Короткие ключи характеристик — так их хранит сервер */
export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export const ABILITY_SHORT: Record<AbilityName, AbilityKey> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

export type ClassLevel = {
  class_id: string
  level: number
  subclass_id: string | null
  /** броски хитов за уровни после первого; null — среднее */
  hp_rolls: (number | null)[]
}

export type AcquiredAbility = {
  /** ключ для действий и вкл/выкл */
  grant_id: string
  slug: string
  source_kind: string
  source_id: string | null
  choices: Record<string, unknown>
  enabled: boolean
  /** выдана источником — удалить нельзя, только отключить */
  auto: boolean
}

export type PendingDecision = {
  id: string
  kind: 'choice' | 'listener'
  grant_id: string
  label: string
  /** ключ выбора способности; поп-ап ответа приходит с ключом `choice:<choice_key>` */
  choice_key?: string | null
}

export type Character = {
  id: string
  schema_version: 2
  /** растёт на каждое действие движка */
  revision: number
  visibility: CharacterVisibility
  character_name: string
  player_id: string | null
  player_display_name: string | null
  campaign_id: string | null

  race_id: string | null
  subrace_id: string | null
  background_id: string | null
  feat_ids: string[]
  classes: ClassLevel[]
  /** без расовых бонусов — их добавляет сервер */
  base_scores: Record<AbilityKey, number>
  experience_points: number
  alignment: string | null

  // состояние движка — только читать
  abilities: AcquiredAbility[]
  store: Record<string, unknown>
  active_effects: unknown[]
  pending_decisions: PendingDecision[]
  manual_overrides: Record<string, unknown>

  inventory: CharacterInventory
  attacks: AttackEntry[]
  spells: SpellKnown[]
  personality: Personality
  gender: string
  age: number | null
  height: string
  weight: string
  eyes: string
  skin: string
  hair: string
  appearance: string
  avatar_url: string | null
  backstory: string
  notes: string
  created_at?: string
  updated_at?: string
}

/** Поля, которые меняет только движок или сервер: PATCH с ними отвечает 422 */
const ENGINE_FIELDS = [
  'id',
  'schema_version',
  'revision',
  'player_id',
  'abilities',
  'store',
  'active_effects',
  'pending_decisions',
  'manual_overrides',
  'created_at',
  'updated_at',
] as const

/** Тело POST/PATCH: всё, что выбирает и пишет игрок */
export type CharacterInput = Partial<Omit<Character, (typeof ENGINE_FIELDS)[number]>>

/** Убирает поля движка и сервера из тела запроса */
export function characterPayload(c: CharacterInput | Partial<Character>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...c }
  for (const k of ENGINE_FIELDS) delete out[k]
  delete out.legacy_v1
  delete out.meta
  return out
}

/* ---------- вычисленный лист ---------- */

export type ActionEconomy = 'action' | 'bonus_action' | 'reaction' | 'free' | 'none'

export type SheetAction = {
  grant_id: string
  ability_slug: string
  ability_name: string
  key: string
  label: string
  description: string | null
  action_economy: string
  enabled: boolean
  /** почему недоступно — в подсказку */
  reason: string | null
  cost: { path: string; amount: string }[]
}

export type SheetResource = {
  key: string
  label: string
  current: number
  max: number
  declared_by: string
  recharge: string[]
  /** состояние той же способности (ярость: res.rage ↔ state.rage) и включено ли оно */
  state_key?: string | null
  active?: boolean
}

export type SheetSlot = { pool: 'spell' | 'pact'; level: number; current: number; max: number }

export type SheetAbility = {
  grant_id: string
  slug: string
  name: string
  implementation_status: string
  source_kind: string
  source_id: string | null
  active: boolean
  /** false — отключена игроком: механика не действует, но в листе остаётся */
  enabled?: boolean
  description: string
  choices: Record<string, unknown>
}

export type SheetEffect = { id: string; label: string; expires: string; rounds_left: number | null }

export type Contribution = { source: string; op: string; value: unknown }

export type Sheet = {
  character_id: string
  revision: number
  /** все значения по пути: char.ac, char.abilities.str.score… */
  values: Record<string, unknown>
  breakdown: Record<string, Contribution[]>
  /** основа значения до вкладов: «10 + Ловкость», «Кольчуга» */
  bases?: Record<string, SheetBase>
  resources: SheetResource[]
  slots: SheetSlot[]
  actions: SheetAction[]
  abilities: SheetAbility[]
  active_effects: SheetEffect[]
  pending_decisions: PendingDecision[]
  warnings: string[]
}

/* ---------- действия и поп-апы ---------- */

export type SheetBase = { value: unknown; label: string; source?: string | null }

/** Вариант поп-апа; у существ — ещё картинка и статы (карусель дикого облика) */
export type PromptOption = {
  value: unknown
  label: string
  description?: string
  image?: string | null
  hp?: number
  ac?: number
  speed?: number
  fly_speed?: number
  swim_speed?: number
  cr?: number
}

export type PromptInput = {
  key: string
  label: string
  /** number | bool | text | choice | multi_choice | slot_level | creature | spell | skill | ability_score | damage_type | ability */
  type: string
  required: boolean
  description?: string | null
  min?: number | null
  max?: number | null
  step?: number | null
  count?: number | null
  default?: unknown
  options?: PromptOption[] | null
  /** ответ — массив, даже если type не multi_choice (spell, ability с count > 1) */
  multiple?: boolean
  /** варианты отобраны условием: пустой список — «нет подходящих», не ошибка */
  filtered?: boolean
  /** условие видимости по ответам этого поп-апа: `input.mode == 'plus11'` */
  visible_if?: string | null
}

export type Prompt = {
  key: string
  title: string
  description?: string | null
  confirm_label?: string | null
  inputs: PromptInput[]
}

export type LogEntry = {
  kind: string
  message: string
  data?: { rolls?: number[]; total?: number; dice?: string; [k: string]: unknown }
}

export type RunStatus = 'completed' | 'needs_input' | 'invalid' | 'rejected' | 'error'

/** Ответ действия, отдыха, события хода и отложенного решения */
export type RunResult = {
  status: RunStatus
  prompt?: Prompt | null
  message?: string | null
  errors?: Record<string, string> | null
  log?: LogEntry[]
  mutations?: unknown[]
  event_id?: string
  sheet?: Sheet
}

/** Ответы на поп-апы: inputs[prompt.key] = { <input.key>: значение } */
export type RunInputs = Record<string, Record<string, unknown>>

export type CharacterEvent = {
  id: string
  kind: string
  label: string
  log: LogEntry[]
  mutations: unknown[]
  created_at: string
  undone: boolean
}

export type LevelUpResult = { changes: string[]; sheet: Sheet }

export const ABILITY_KEYS: AbilityName[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]

export const ABILITY_LABELS: Record<AbilityName, { label: string; abbr: string; short: string }> = {
  strength: { label: 'Сила', abbr: 'СИЛ', short: 'str' },
  dexterity: { label: 'Ловкость', abbr: 'ЛОВ', short: 'dex' },
  constitution: { label: 'Телосложение', abbr: 'ТЕЛ', short: 'con' },
  intelligence: { label: 'Интеллект', abbr: 'ИНТ', short: 'int' },
  wisdom: { label: 'Мудрость', abbr: 'МДР', short: 'wis' },
  charisma: { label: 'Харизма', abbr: 'ХАР', short: 'cha' },
}

export const DEFAULT_SKILLS: { key: string; label: string; ability: AbilityName }[] = [
  { key: 'acrobatics', label: 'Акробатика', ability: 'dexterity' },
  { key: 'animal_handling', label: 'Уход за животными', ability: 'wisdom' },
  { key: 'arcana', label: 'Магия', ability: 'intelligence' },
  { key: 'athletics', label: 'Атлетика', ability: 'strength' },
  { key: 'deception', label: 'Обман', ability: 'charisma' },
  { key: 'history', label: 'История', ability: 'intelligence' },
  { key: 'insight', label: 'Проницательность', ability: 'wisdom' },
  { key: 'intimidation', label: 'Запугивание', ability: 'charisma' },
  { key: 'investigation', label: 'Анализ', ability: 'intelligence' },
  { key: 'medicine', label: 'Медицина', ability: 'wisdom' },
  { key: 'nature', label: 'Природа', ability: 'intelligence' },
  { key: 'perception', label: 'Внимательность', ability: 'wisdom' },
  { key: 'performance', label: 'Выступление', ability: 'charisma' },
  { key: 'persuasion', label: 'Убеждение', ability: 'charisma' },
  { key: 'religion', label: 'Религия', ability: 'intelligence' },
  { key: 'sleight_of_hand', label: 'Ловкость рук', ability: 'dexterity' },
  { key: 'stealth', label: 'Скрытность', ability: 'dexterity' },
  { key: 'survival', label: 'Выживание', ability: 'wisdom' },
]

function defaultSkills(): Record<string, SkillEntry> {
  const skills: Record<string, SkillEntry> = {}
  for (const s of DEFAULT_SKILLS) {
    skills[s.key] = {
      ability: s.ability,
      proficient: false,
      expertise: false,
      modifier: null,
      passive_score: null,
    }
  }
  return skills
}

function defaultAbilityScores(): Record<AbilityName, AbilityScoreBlock> {
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [k, { score: 10, saving_throw_proficient: false }]),
  ) as Record<AbilityName, AbilityScoreBlock>
}

export function emptySheetView(
  defaults?: Partial<{
    name: string
    raceName: string
    className: string
    level: number
    visibility: CharacterVisibility
    hitDie: number
  }>,
): SheetView {
  const level = defaults?.level ?? 1
  const className = defaults?.className ?? 'Воин'
  const hitDie = defaults?.hitDie ?? 10
  return {
    visibility: defaults?.visibility ?? 'private',
    basic_info: {
      name: defaults?.name ?? 'Новый герой',
      race: { name: defaults?.raceName ?? 'Человек' },
      subrace: null,
      classes: [
        {
          name: className,
          level,
          hit_die: hitDie,
          is_caster: false,
          subclass_name: null,
          subclass_source: null,
          source: null,
          spellcasting_ability: null,
        },
      ],
      total_level: level,
      background: null,
      alignment: '',
      experience_points: 0,
      avatar_url: null,
      player_display_name: null,
    },
    ability_scores: defaultAbilityScores(),
    proficiency_bonus: 2,
    skills: defaultSkills(),
    combat: {
      armor_class: 10,
      initiative: 0,
      speed: 30,
      hit_points: { max: 10, current: 10, temp: 0 },
      hit_dice: { total: `${level}d${hitDie}`, remaining: level },
      death_saves: { successes: 0, failures: 0 },
      passive_perception: 10,
      conditions: [],
      inspiration: false,
      shield: false,
    },
    attacks: [],
    proficiencies: { armor: [], weapons: [], tools: [], languages: [] },
    features: [],
    feats: [],
    spellcasting: {
      is_spellcaster: false,
      spellcasting_ability: null,
      spell_save_dc: null,
      spell_attack_bonus: null,
      spell_slots: {},
      spells_known: [],
      cantrips_amount: 0,
      prepared_spells_max: null,
    },
    inventory: {
      grid_width: 7,
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      items: [],
      carrying_capacity_max: null,
    },
    personality: { traits: '', ideals: '', bonds: '', flaws: '' },
    backstory: '',
    notes: '',
  }
}
