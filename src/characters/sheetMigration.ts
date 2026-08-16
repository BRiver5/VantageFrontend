import { emptyCharacter, type AbilityName, type CharacterCreate } from '../types/character'

/** Legacy flat localStorage sheet (`vantage-character-sheet`) */
export type SheetData = Record<string, string | boolean>

export const LEGACY_SHEET_KEY = 'vantage-character-sheet'
export const LEGACY_MIGRATED_KEY = 'vantage-character-sheet-migrated'

const SHORT_TO_ABILITY: Record<string, AbilityName> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
}

const SKILL_MAP: Record<string, string> = {
  acrobatics: 'acrobatics',
  animal: 'animal_handling',
  arcana: 'arcana',
  athletics: 'athletics',
  deception: 'deception',
  history: 'history',
  insight: 'insight',
  intimidation: 'intimidation',
  investigation: 'investigation',
  medicine: 'medicine',
  nature: 'nature',
  perception: 'perception',
  performance: 'performance',
  persuasion: 'persuasion',
  religion: 'religion',
  sleight: 'sleight_of_hand',
  stealth: 'stealth',
  survival: 'survival',
}

function num(v: string | boolean | undefined, fallback = 0): number {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v !== 'string' || !v.trim()) return fallback
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? fallback : n
}

function str(v: string | boolean | undefined): string {
  return typeof v === 'string' ? v : ''
}

function parseClassLevel(raw: string): { className: string; level: number } {
  const m = raw.match(/^(.+?)\s+(\d+)\s*$/)
  if (m) return { className: m[1].trim(), level: Math.min(20, Math.max(1, parseInt(m[2], 10))) }
  if (raw.trim()) return { className: raw.trim(), level: 1 }
  return { className: 'Воин', level: 1 }
}

export function hasLegacySheet(): boolean {
  try {
    if (localStorage.getItem(LEGACY_MIGRATED_KEY)) return false
    const raw = localStorage.getItem(LEGACY_SHEET_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as SheetData
    return Boolean(data && typeof data === 'object' && Object.keys(data).length > 0)
  } catch {
    return false
  }
}

export function markLegacyMigrated(): void {
  try {
    localStorage.setItem(LEGACY_MIGRATED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function loadLegacySheet(): SheetData | null {
  try {
    const raw = localStorage.getItem(LEGACY_SHEET_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SheetData
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export function sheetDataToCharacter(data: SheetData): CharacterCreate {
  const { className, level } = parseClassLevel(str(data.classlevel))
  const c = emptyCharacter({
    name: str(data.name) || 'Импортированный герой',
    raceName: str(data.race) || 'Человек',
    className,
    level,
  })

  c.basic_info.background = str(data.background)
    ? { name: str(data.background) }
    : null
  c.basic_info.alignment = str(data.alignment)
  c.basic_info.experience_points = num(data.xp, 0)
  c.basic_info.player_display_name = str(data.player) || null

  for (const [short, ability] of Object.entries(SHORT_TO_ABILITY)) {
    c.ability_scores[ability] = {
      score: num(data[`${short}_score`], 10),
      saving_throw_proficient: Boolean(data[`save_${short}`]),
    }
  }

  c.proficiency_bonus = num(data.profbonus, 2)

  for (const [oldKey, newKey] of Object.entries(SKILL_MAP)) {
    if (c.skills[newKey]) {
      c.skills[newKey] = {
        ...c.skills[newKey],
        proficient: Boolean(data[`skill_${oldKey}`]),
      }
    }
  }

  c.combat.armor_class = num(data.ac, 10)
  c.combat.initiative = num(data.initiative, 0)
  c.combat.speed = num(data.speed, 30)
  c.combat.hit_points = {
    max: num(data.hp_max, 10),
    current: num(data.hp_current, num(data.hp_max, 10)),
    temp: num(data.hp_temp, 0),
  }
  c.combat.hit_dice = {
    total: str(data.hd_total) || str(data.hd) || `${level}d10`,
    remaining: level,
  }
  c.combat.death_saves = {
    successes: [data.ds_s1, data.ds_s2, data.ds_s3].filter(Boolean).length,
    failures: [data.ds_f1, data.ds_f2, data.ds_f3].filter(Boolean).length,
  }
  c.combat.passive_perception = num(data.passive, 10)
  c.combat.inspiration = Boolean(data.inspiration)

  const attacks = [1, 2, 3]
    .map((i) => ({
      name: str(data[`atk${i}_name`]),
      bonus: str(data[`atk${i}_bonus`]),
      dmg: str(data[`atk${i}_dmg`]),
    }))
    .filter((a) => a.name)
  c.attacks = attacks.map((a) => ({
    name: a.name,
    type: 'other' as const,
    attack_bonus: num(a.bonus, 0),
    damage: a.dmg,
    damage_type: '',
    range: '',
    properties: [],
    inventory_instance_id: null,
  }))

  c.inventory.currency = {
    cp: num(data.coin_cp),
    sp: num(data.coin_sp),
    ep: num(data.coin_ep),
    gp: num(data.coin_gp),
    pp: num(data.coin_pp),
  }

  const equipText = str(data.equipment)
  if (equipText.trim()) {
    c.notes = [c.notes, `Снаряжение (импорт):\n${equipText}`].filter(Boolean).join('\n\n')
  }

  const otherProf = str(data.otherprof)
  if (otherProf.trim()) {
    c.proficiencies.languages = otherProf.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
  }

  c.personality = {
    traits: str(data.personality),
    ideals: str(data.ideals),
    bonds: str(data.bonds),
    flaws: str(data.flaws),
  }

  const features = str(data.features)
  if (features.trim()) {
    c.features = [
      {
        name: 'Импортированные умения',
        source: 'other',
        description: features,
        level: null,
        feature_source: null,
      },
    ]
  }

  const atkText = str(data.atk_text)
  if (atkText.trim()) {
    c.notes = [c.notes, atkText].filter(Boolean).join('\n\n')
  }

  return c
}
