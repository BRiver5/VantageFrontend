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
  source: 'class' | 'subclass' | 'race' | 'subrace' | 'background' | 'feat' | 'other'
  level?: number | null
  description: string
  feature_source?: string | null
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

export type Character = {
  id?: string
  meta: { version: string; source: string }
  visibility: CharacterVisibility
  player_id: string | null
  campaign_id: string | null
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
  personality: { traits: string; ideals: string; bonds: string; flaws: string }
  backstory: string
  notes: string
  class_resources: unknown[]
}

/** Payload for create — omit server-owned fields */
export type CharacterCreate = Omit<Character, 'id' | 'player_id'> & {
  player_id?: string | null
}

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

export function emptyCharacter(
  defaults?: Partial<{
    name: string
    raceName: string
    className: string
    level: number
    visibility: CharacterVisibility
    hitDie: number
  }>,
): CharacterCreate {
  const level = defaults?.level ?? 1
  const className = defaults?.className ?? 'Воин'
  const hitDie = defaults?.hitDie ?? 10
  return {
    meta: { version: '1.0', source: 'vantage' },
    visibility: defaults?.visibility ?? 'private',
    campaign_id: null,
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
    class_resources: [],
  }
}

/** Strip server-owned fields before PATCH/POST body */
export function characterPayload(c: Character | CharacterCreate): Record<string, unknown> {
  const { id: _id, player_id: _pid, ...rest } = c as Character
  return rest
}
