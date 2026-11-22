/**
 * Повышение характеристик от происхождения: раса (2014 — фиксированные
 * бонусы `increase_ability_scores`) и предыстория (2024 — три характеристики
 * на выбор по схеме +2/+1 или +1/+1/+1). Чистая логика.
 *
 * В смешанном герое (раса 2014 + предыстория 2024) сервер применяет оба
 * источника; по правилам 2024 у народов из старых книг увеличений нет,
 * поэтому конструктор предупреждает. Если же ни один источник не повышает
 * (вид 2024 + предыстория 2014) — тоже говорит об этом, а не молчит.
 */
import { ABILITY_KEYS, ABILITY_SHORT, type AbilityName } from '../types/character'
import { abilityFromAny } from './dnd5e'

export type AsiMap = Partial<Record<AbilityName, number>>

/** Схема повышения предыстории в формате сервера: '2,1' или '1,1,1' */
export type BgAsiMode = '2,1' | '1,1,1'

interface BgLike {
  ability_score_options?: string[] | null
  ability_score_patterns?: number[][] | null
}

export interface BackgroundAsiOptions {
  abilities: AbilityName[]
  modes: BgAsiMode[]
}

const SHORT_TO_NAME = Object.fromEntries(ABILITY_KEYS.map((k) => [ABILITY_SHORT[k], k])) as Record<string, AbilityName>

const toName = (raw: string): AbilityName | null => SHORT_TO_NAME[raw] ?? abilityFromAny(raw)

const modeOf = (p: number[]): BgAsiMode | null => {
  const key = [...p].sort((a, b) => b - a).join(',')
  return key === '2,1' || key === '1,1,1' ? key : null
}

/** Что даёт предыстория: характеристики и схемы; null — ничего (предыстория 2014) */
export function backgroundAsiOptions(bg: BgLike | null | undefined): BackgroundAsiOptions | null {
  const abilities = [...new Set((bg?.ability_score_options ?? []).map(toName).filter((x): x is AbilityName => !!x))]
  const modes = [...new Set((bg?.ability_score_patterns ?? []).map(modeOf).filter((x): x is BgAsiMode => !!x))]
  if (abilities.length === 0 || modes.length === 0) return null
  return { abilities, modes }
}

/** Схема выбранного распределения; null — не подходит ни к одной схеме предыстории */
export function backgroundAsiMode(bg: BgLike | null | undefined, asi: AsiMap | null | undefined): BgAsiMode | null {
  const opts = backgroundAsiOptions(bg)
  if (!opts || !asi) return null
  const ups = Object.entries(asi).filter(([, v]) => v) as [AbilityName, number][]
  if (ups.length === 0 || ups.some(([k]) => !opts.abilities.includes(k))) return null
  const mode = modeOf(ups.map(([, v]) => v))
  return mode && opts.modes.includes(mode) ? mode : null
}

/** Бонусы предыстории, если выбор подходит к ней; иначе пусто */
export function backgroundBonuses(bg: BgLike | null | undefined, asi: AsiMap | null | undefined): AsiMap {
  return backgroundAsiMode(bg, asi) ? { ...asi } : {}
}

/**
 * Схема «+2 и +1»: поставить характеристике +2, +1 или снять бонус. У каждого
 * значения один владелец — «+2» у новой характеристики снимает его с прежней;
 * остатки схемы «+1, +1 и +1» при этом уходят.
 */
export function pickTwoOne(asi: AsiMap, ability: AbilityName, value: 0 | 1 | 2): AsiMap {
  const next: AsiMap = {}
  let ones = 0
  for (const [k, v] of Object.entries(asi) as [AbilityName, number][]) {
    if (!v || k === ability || v === value) continue
    if (v === 1 && ++ones > 1) continue
    if (v === 2 || v === 1) next[k] = v
  }
  if (value) next[ability] = value
  return next
}

/** Готовое распределение по схеме: «+1, +1 и +1» сразу на все три характеристики */
export function evenBackgroundAsi(opts: BackgroundAsiOptions): AsiMap {
  return Object.fromEntries(opts.abilities.slice(0, 3).map((k) => [k, 1])) as AsiMap
}

/** Ответ на выбор `bg_asi` способности «Повышение характеристик» предыстории */
export function bgAsiAnswer(bg: BgLike | null | undefined, asi: AsiMap | null | undefined): Record<string, string> | null {
  const mode = backgroundAsiMode(bg, asi)
  if (!mode || !asi) return null
  const ups = (Object.entries(asi).filter(([, v]) => v) as [AbilityName, number][]).sort((a, b) => b[1] - a[1])
  const out: Record<string, string> = { mode }
  ups.forEach(([k], i) => (out['abc'[i]] = ABILITY_SHORT[k]))
  return out
}

export type OriginAsiNote = 'both' | 'none' | null

/**
 * Подсказка о сочетании источников: `both` — бонусы и расы, и предыстории
 * (смешаны редакции), `none` — ни того, ни другого. Пока раса или предыстория
 * не выбраны — молчим.
 */
export function originAsiNote(o: { racial: AsiMap; raceFlexible?: boolean; hasRace: boolean; hasBackground: boolean; background: BgLike | null | undefined }): OriginAsiNote {
  if (!o.hasRace || !o.hasBackground) return null
  const raceGives = o.raceFlexible || Object.values(o.racial).some(Boolean)
  const bgGives = backgroundAsiOptions(o.background) !== null
  if (raceGives && bgGives) return 'both'
  if (!raceGives && !bgGives) return 'none'
  return null
}
