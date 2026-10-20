import { DEFAULT_SKILLS } from './types/character'
import type { AbilityName } from './types/character'

/**
 * Основы названий навыков → характеристика. Ищем именно основы ВНУТРИ строки:
 * бэк отдаёт и синонимы того же навыка («Восприятие» вместо «Внимательности»),
 * и целые фразы вида «Природы и Религии на ваш выбор», где навыков сразу
 * несколько, и падежи.
 */
const SKILL_STEM_ABILITY: [string, AbilityName][] = [
  ...DEFAULT_SKILLS.map(
    (s) => [s.label.toLocaleLowerCase('ru').replace(/[аяеиоуыь]$/u, ''), s.ability] as [string, AbilityName],
  ),
  ['восприяти', 'wisdom'],
  ['расследован', 'intelligence'],
  ['дознани', 'intelligence'],
]

/** Характеристики, к которым относятся перечисленные навыки. */
export function abilitiesFromSkills(skills: string[] | null | undefined): AbilityName[] {
  const out = new Set<AbilityName>()
  for (const skill of skills ?? []) {
    const text = skill.toLocaleLowerCase('ru')
    for (const [stem, ability] of SKILL_STEM_ABILITY) {
      if (text.includes(stem)) out.add(ability)
    }
  }
  return [...out]
}

/** Те же основы, но с ключом навыка — чтобы отмечать владения на листе. */
const SKILL_STEM_KEY: [string, string][] = [
  ...DEFAULT_SKILLS.map(
    (s) => [s.label.toLocaleLowerCase('ru').replace(/[аяеиоуыь]$/u, ''), s.key] as [string, string],
  ),
  ['восприяти', 'perception'],
  ['расследован', 'investigation'],
  ['дознани', 'investigation'],
]

/** Ключи навыков из названий, как их присылает бэк (предыстории, классы). */
export function skillKeysFromNames(names: string[] | null | undefined): string[] {
  const out = new Set<string>()
  for (const name of names ?? []) {
    const text = name.toLocaleLowerCase('ru')
    for (const [stem, key] of SKILL_STEM_KEY) {
      if (text.includes(stem)) out.add(key)
    }
  }
  return [...out]
}
