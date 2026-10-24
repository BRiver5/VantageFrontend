/**
 * Табличные правила PHB, которых нет в API: бонус мастерства, уровни усиления
 * характеристик, прогрессия заклинателей, наборы навыков классов.
 *
 * API отдаёт по классу только `hit_dice`, `is_caster` и строковые владения, а
 * умения по уровням приходят разметкой dnd.su (см. parseFeatureEntries). Всё
 * остальное, что нужно пошаговой прокачке, собрано здесь и подбирается по
 * русскому имени класса; для неизвестных (homebrew) имён возвращаются
 * безопасные пустые значения, и визард переходит на ручной ввод.
 */
import type { AbilityName, SpellSlot } from '../types/character'

/** Класс-заклинатель: полный, половинный, артифайсер (округление вверх), пакт колдуна */
export type CasterKind = 'none' | 'full' | 'half' | 'artificer' | 'pact'

const RU_ABILITY: Record<string, AbilityName> = {
  сила: 'strength',
  сил: 'strength',
  ловкость: 'dexterity',
  лов: 'dexterity',
  телосложение: 'constitution',
  тел: 'constitution',
  интеллект: 'intelligence',
  инт: 'intelligence',
  мудрость: 'wisdom',
  мдр: 'wisdom',
  харизма: 'charisma',
  хар: 'charisma',
  strength: 'strength',
  dexterity: 'dexterity',
  constitution: 'constitution',
  intelligence: 'intelligence',
  wisdom: 'wisdom',
  charisma: 'charisma',
}

/**
 * Характеристика из произвольной строки API: спасброски приходят по-русски
 * («Сила»), бонусы расы — английскими ключами («strength»).
 */
export function abilityFromAny(value: string | null | undefined): AbilityName | null {
  if (!value) return null
  const key = value.trim().toLocaleLowerCase('ru').replace(/[.\s]+$/, '')
  return RU_ABILITY[key] ?? null
}

/** Нормализованное имя класса для поиска по таблицам */
function classKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLocaleLowerCase('ru')
}

export const CLASS_PRIMARY_ABILITY: Record<string, string> = {
  Бард: 'Харизма',
  Варвар: 'Сила',
  Воин: 'Сила или Ловкость',
  Волшебник: 'Интеллект',
  Друид: 'Мудрость',
  Жрец: 'Мудрость',
  Изобретатель: 'Интеллект',
  Колдун: 'Харизма',
  Монах: 'Ловкость и Мудрость',
  Паладин: 'Сила и Харизма',
  Плут: 'Ловкость',
  Следопыт: 'Ловкость и Мудрость',
  Чародей: 'Харизма',
}

/** Бонус мастерства по уровню персонажа */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4)
}

const ASI_DEFAULT = [4, 8, 12, 16, 19]
const ASI_EXTRA: Record<string, number[]> = {
  воин: [6, 14],
  плут: [10],
}

/** Уровни, на которых класс получает усиление характеристик или черту */
export function asiLevels(className: string): number[] {
  const extra = ASI_EXTRA[classKey(className)] ?? []
  return [...ASI_DEFAULT, ...extra].sort((a, b) => a - b)
}

export function isAsiLevel(className: string, level: number): boolean {
  return asiLevels(className).includes(level)
}

const CASTER_KIND: Record<string, CasterKind> = {
  бард: 'full',
  волшебник: 'full',
  друид: 'full',
  жрец: 'full',
  чародей: 'full',
  паладин: 'half',
  следопыт: 'half',
  изобретатель: 'artificer',
  колдун: 'pact',
}

/**
 * Тип прогрессии заклинателя. Для незнакомых имён опираемся на флаг `is_caster`
 * из API и считаем класс полным заклинателем — это ближе к истине, чем ничего.
 */
export function casterKind(className: string, isCaster?: boolean): CasterKind {
  return CASTER_KIND[classKey(className)] ?? (isCaster ? 'full' : 'none')
}

const SPELLCASTING_ABILITY: Record<string, AbilityName> = {
  бард: 'charisma',
  колдун: 'charisma',
  паладин: 'charisma',
  чародей: 'charisma',
  волшебник: 'intelligence',
  изобретатель: 'intelligence',
  друид: 'wisdom',
  жрец: 'wisdom',
  следопыт: 'wisdom',
}

export function spellcastingAbility(className: string): AbilityName | null {
  return SPELLCASTING_ABILITY[classKey(className)] ?? null
}

/** Классы, которые готовят заклинания из всего списка, а не знают фиксированный набор */
const PREPARED_CASTERS = new Set(['жрец', 'друид', 'волшебник', 'паладин', 'изобретатель'])

export function isPreparedCaster(className: string): boolean {
  return PREPARED_CASTERS.has(classKey(className))
}

/** Ячейки полного заклинателя: индекс — уровень класса, значение — ячейки 1-9 кругов */
const FULL_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

/** Ячейки половинного заклинателя (паладин, следопыт) — магия с 2 уровня */
const HALF_SLOTS: number[][] = [
  [],
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
]

/** Пакт колдуна: число ячеек и их круг */
const PACT_SLOTS: { count: number; level: number }[] = [
  { count: 0, level: 0 },
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
]

function clampLevel(level: number): number {
  return Math.max(0, Math.min(20, Math.floor(level)))
}

/**
 * Ячейки заклинаний на уровне: ключ — круг («1»…«9»), значение — максимум.
 * У колдуна все ячейки одного круга, поэтому ключ ровно один.
 */
export function spellSlotsAt(kind: CasterKind, level: number): Record<string, number> {
  const lvl = clampLevel(level)
  if (lvl === 0 || kind === 'none') return {}

  if (kind === 'pact') {
    const pact = PACT_SLOTS[lvl]
    return pact.count > 0 ? { [String(pact.level)]: pact.count } : {}
  }

  // артифайсер округляет уровень заклинателя вверх: ячейки есть уже с 1 уровня
  const row =
    kind === 'full' ? FULL_SLOTS[lvl]
    : kind === 'artificer' ? (lvl <= 2 ? [2] : HALF_SLOTS[lvl])
    : HALF_SLOTS[lvl]

  const out: Record<string, number> = {}
  row.forEach((count, i) => {
    if (count > 0) out[String(i + 1)] = count
  })
  return out
}

/** Ячейки в формате листа персонажа — с учётом уже потраченных */
export function spellSlotBlocks(kind: CasterKind, level: number): Record<string, SpellSlot> {
  const out: Record<string, SpellSlot> = {}
  for (const [circle, max] of Object.entries(spellSlotsAt(kind, level))) {
    out[circle] = { max, used: 0 }
  }
  return out
}

/**
 * Число заговоров: ключ — класс, значение — пороги «с какого уровня сколько».
 * Пороги идут по возрастанию, берём последний подходящий.
 */
const CANTRIPS: Record<string, [number, number][]> = {
  бард: [[1, 2], [4, 3], [10, 4]],
  волшебник: [[1, 3], [4, 4], [10, 5]],
  друид: [[1, 2], [4, 3], [10, 4]],
  жрец: [[1, 3], [4, 4], [10, 5]],
  изобретатель: [[1, 2], [6, 3], [10, 4]],
  колдун: [[1, 2], [4, 3], [10, 4]],
  чародей: [[1, 4], [4, 5], [10, 6]],
}

export function cantripsAt(className: string, level: number): number {
  const rows = CANTRIPS[classKey(className)]
  if (!rows) return 0
  let value = 0
  for (const [from, count] of rows) {
    if (level >= from) value = count
  }
  return value
}

/** Классы с фиксированным списком известных заклинаний: индекс — уровень класса */
const SPELLS_KNOWN: Record<string, number[]> = {
  бард: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  чародей: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  колдун: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  следопыт: [0, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
}

/** Сколько заклинаний знает класс на уровне; для «готовящих» классов — 0 */
export function spellsKnownAt(className: string, level: number): number {
  return SPELLS_KNOWN[classKey(className)]?.[clampLevel(level)] ?? 0
}

/**
 * Максимум подготовленных заклинаний: модификатор заклинательной
 * характеристики + уровень заклинателя (у половинных — половина, вверх).
 */
export function preparedSpellsMax(className: string, level: number, abilityMod: number): number | null {
  if (!isPreparedCaster(className)) return null
  const key = classKey(className)
  const casterLevel =
    key === 'паладин' || key === 'изобретатель' ? Math.floor(level / 2) : level
  return Math.max(1, abilityMod + casterLevel)
}

/** Спасброски класса — фолбэк, если API не прислал saving_throw_proficiencies */
const SAVING_THROWS: Record<string, AbilityName[]> = {
  бард: ['dexterity', 'charisma'],
  варвар: ['strength', 'constitution'],
  воин: ['strength', 'constitution'],
  волшебник: ['intelligence', 'wisdom'],
  друид: ['intelligence', 'wisdom'],
  жрец: ['wisdom', 'charisma'],
  изобретатель: ['constitution', 'intelligence'],
  колдун: ['wisdom', 'charisma'],
  монах: ['strength', 'dexterity'],
  паладин: ['wisdom', 'charisma'],
  плут: ['dexterity', 'intelligence'],
  следопыт: ['strength', 'dexterity'],
  чародей: ['constitution', 'charisma'],
}

export function savingThrowsFallback(className: string): AbilityName[] {
  return SAVING_THROWS[classKey(className)] ?? []
}

/** Уровень, на котором класс выбирает подкласс — фолбэк к Subclass.level_available */
const SUBCLASS_LEVEL: Record<string, number> = {
  бард: 3,
  варвар: 3,
  воин: 3,
  волшебник: 2,
  друид: 2,
  жрец: 1,
  изобретатель: 3,
  колдун: 1,
  монах: 3,
  паладин: 3,
  плут: 3,
  следопыт: 3,
  чародей: 1,
}

export function subclassLevelFallback(className: string): number {
  return SUBCLASS_LEVEL[classKey(className)] ?? 3
}

/** Навыки класса: сколько выбрать и из чего (ключи DEFAULT_SKILLS) */
export interface SkillChoice {
  count: number
  options: string[]
}

const ALL_SKILL_KEYS = [
  'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleight_of_hand', 'stealth', 'survival',
]

const CLASS_SKILLS: Record<string, SkillChoice> = {
  бард: { count: 3, options: ALL_SKILL_KEYS },
  варвар: {
    count: 2,
    options: ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
  },
  воин: {
    count: 2,
    options: ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'],
  },
  волшебник: {
    count: 2,
    options: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
  },
  друид: {
    count: 2,
    options: ['animal_handling', 'arcana', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
  },
  жрец: {
    count: 2,
    options: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
  },
  изобретатель: {
    count: 2,
    options: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleight_of_hand'],
  },
  колдун: {
    count: 2,
    options: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'],
  },
  монах: {
    count: 2,
    options: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
  },
  паладин: {
    count: 2,
    options: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
  },
  плут: {
    count: 4,
    options: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight_of_hand', 'stealth'],
  },
  следопыт: {
    count: 3,
    options: ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
  },
  чародей: {
    count: 2,
    options: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
  },
}

/**
 * Навыки на выбор от класса. Для незнакомого класса даём 2 из всех — иначе шаг
 * выбора навыков просто исчез бы и персонаж остался без владений.
 */
export function classSkillChoice(className: string): SkillChoice {
  return CLASS_SKILLS[classKey(className)] ?? { count: 2, options: ALL_SKILL_KEYS }
}

/**
 * Сколько навыков даёт первый уровень класса при мультиклассе (PHB, гл. 6):
 * бард — один любой, плут и следопыт — один из своего списка, остальные — ни одного.
 */
export function multiclassSkillCount(className: string): number {
  const k = classKey(className)
  return k === 'бард' || k === 'плут' || k === 'следопыт' ? 1 : 0
}

/** Модификатор характеристики */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Модификатор со знаком — для подписей */
export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : String(mod)
}
