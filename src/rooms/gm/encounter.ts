/**
 * Сложность встречи по Руководству мастера D&D 5e (2014): пороги опыта на уровень
 * героя, множитель за число противников с поправкой на размер партии и дневной бюджет.
 */

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly'

export const DIFFICULTY_RU: Record<Difficulty, string> = {
  trivial: 'Пустяк',
  easy: 'Лёгкая',
  medium: 'Средняя',
  hard: 'Трудная',
  deadly: 'Смертельная',
}

/** Опыт за существо по показателю опасности */
const XP_BY_CR: Record<string, number> = {
  '0': 10, '0.125': 25, '0.25': 50, '0.5': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
}

/** Пороги опыта героя по уровню: лёгкая, средняя, трудная, смертельная */
const THRESHOLDS: [number, number, number, number][] = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
]

/** Опыт на приключенческий день на героя по уровню */
const DAY_BUDGET = [300, 600, 1200, 1700, 3500, 4000, 5000, 6000, 7500, 9000, 10500, 11500, 13500, 15000, 18000, 20000, 25000, 27000, 30000, 40000]

const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]

/** «1/4», «1/2» и дробные числа одинаково */
export function parseCr(cr: number | string | null | undefined): number | null {
  if (cr == null || cr === '') return null
  if (typeof cr === 'number') return Number.isFinite(cr) ? cr : null
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(cr)
  if (m) return Number(m[1]) / Number(m[2])
  const n = Number(cr.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function xpForCr(cr: number | string | null | undefined): number {
  const n = parseCr(cr)
  if (n == null || n < 0) return 0
  const key = n >= 1 ? String(Math.min(30, Math.round(n))) : n >= 0.5 ? '0.5' : n >= 0.25 ? '0.25' : n >= 0.125 ? '0.125' : '0'
  return XP_BY_CR[key] ?? 0
}

const levelIndex = (level: number) => Math.min(20, Math.max(1, Math.round(level || 1))) - 1

/** Множитель за число противников; маленькая партия (1–2) — на шаг больше, большая (6+) — на шаг меньше */
export function multiplierFor(monsters: number, partySize: number): number {
  if (monsters <= 0) return 0
  let i = monsters === 1 ? 1 : monsters === 2 ? 2 : monsters <= 6 ? 3 : monsters <= 10 ? 4 : monsters <= 14 ? 5 : 6
  if (partySize < 3) i += 1
  else if (partySize >= 6) i -= 1
  return MULTIPLIERS[Math.max(0, Math.min(MULTIPLIERS.length - 1, i))]
}

export interface PartyThresholds {
  easy: number
  medium: number
  hard: number
  deadly: number
  /** опыт на приключенческий день для всей партии */
  day: number
}

export function partyThresholds(levels: number[]): PartyThresholds {
  const out: PartyThresholds = { easy: 0, medium: 0, hard: 0, deadly: 0, day: 0 }
  for (const level of levels) {
    const [e, m, h, d] = THRESHOLDS[levelIndex(level)]
    out.easy += e
    out.medium += m
    out.hard += h
    out.deadly += d
    out.day += DAY_BUDGET[levelIndex(level)]
  }
  return out
}

export interface EncounterRating {
  /** опыт за всех противников (его и получат герои) */
  baseXp: number
  multiplier: number
  /** опыт с множителем — по нему считается сложность */
  adjustedXp: number
  difficulty: Difficulty
  thresholds: PartyThresholds
  monsters: number
  partySize: number
  /** доля дневного бюджета партии, 0..∞ */
  dayShare: number
}

export function rateEncounter(partyLevels: number[], monsterCrs: (number | string | null | undefined)[]): EncounterRating {
  const thresholds = partyThresholds(partyLevels)
  const baseXp = monsterCrs.reduce<number>((sum, cr) => sum + xpForCr(cr), 0)
  const multiplier = multiplierFor(monsterCrs.length, partyLevels.length)
  const adjustedXp = Math.round(baseXp * multiplier)
  const difficulty: Difficulty =
    partyLevels.length === 0 || adjustedXp < thresholds.easy
      ? 'trivial'
      : adjustedXp >= thresholds.deadly
        ? 'deadly'
        : adjustedXp >= thresholds.hard
          ? 'hard'
          : adjustedXp >= thresholds.medium
            ? 'medium'
            : 'easy'
  return {
    baseXp,
    multiplier,
    adjustedXp,
    difficulty,
    thresholds,
    monsters: monsterCrs.length,
    partySize: partyLevels.length,
    dayShare: thresholds.day ? adjustedXp / thresholds.day : 0,
  }
}

/** 1 200 опыта — с узким пробелом, как в книге */
export const formatXp = (n: number) => n.toLocaleString('ru-RU')
