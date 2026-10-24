import type { AbilityName, CharacterInput } from '../types/character'

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

/**
 * Старый плоский лист из браузера → тело создания персонажа v2. Класс ищется
 * в каталоге по названию; числа листа (КД, хиты, навыки) не переносятся — их
 * посчитает сервер, а характеристики уходят как базовые (раса не выбрана,
 * бонусы не задвоятся).
 */
export function sheetDataToCharacter(data: SheetData, classIdByName: (name: string) => string | null): CharacterInput {
  const { className, level } = parseClassLevel(str(data.classlevel))
  const classId = classIdByName(className)

  const base_scores = Object.fromEntries(
    Object.keys(SHORT_TO_ABILITY).map((short) => [short, num(data[`${short}_score`], 10)]),
  ) as CharacterInput['base_scores']

  const attacks = [1, 2, 3]
    .map((i) => ({
      name: str(data[`atk${i}_name`]),
      bonus: str(data[`atk${i}_bonus`]),
      dmg: str(data[`atk${i}_dmg`]),
    }))
    .filter((a) => a.name)
    .map((a) => ({
      name: a.name,
      type: 'other' as const,
      attack_bonus: num(a.bonus, 0),
      damage: a.dmg,
      damage_type: '',
      range: '',
      properties: [],
      inventory_instance_id: null,
    }))

  // всё, чему в v2 нет поля, — в заметки, чтобы ничего не потерялось
  const notes = [
    str(data.equipment).trim() && `Снаряжение (импорт):\n${str(data.equipment)}`,
    str(data.otherprof).trim() && `Владения и языки (импорт):\n${str(data.otherprof)}`,
    str(data.features).trim() && `Умения (импорт):\n${str(data.features)}`,
    str(data.background).trim() && `Предыстория (импорт): ${str(data.background)}`,
    !classId && `Класс (импорт): ${className} ${level}`,
    str(data.atk_text),
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    character_name: str(data.name) || 'Импортированный герой',
    visibility: 'private',
    alignment: str(data.alignment) || null,
    experience_points: num(data.xp, 0),
    player_display_name: str(data.player) || null,
    classes: classId ? [{ class_id: classId, level, subclass_id: null, hp_rolls: [] }] : [],
    base_scores,
    attacks,
    inventory: {
      grid_width: 7,
      items: [],
      currency: {
        cp: num(data.coin_cp),
        sp: num(data.coin_sp),
        ep: num(data.coin_ep),
        gp: num(data.coin_gp),
        pp: num(data.coin_pp),
      },
    },
    personality: {
      traits: str(data.personality),
      ideals: str(data.ideals),
      bonds: str(data.bonds),
      flaws: str(data.flaws),
    },
    notes,
  }
}
