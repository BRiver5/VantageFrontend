import type { AttackEntry } from '../../types/character'

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/* ---------- бросок и история ---------- */

export interface RollShown {
  id: number
  label: string
  /** выпавшие кости и бонус; total — итог */
  dice: number[]
  sides: number
  bonus: number
  /** число броска или знак для событий без броска (сотворено заклинание) */
  total: number | string
  crit?: boolean
  fumble?: boolean
}

/** «1d8+3» / «1к8 + 3» → кости и бонус; число без костей — фиксированный урон */
export function parseDamage(text: string): { n: number; sides: number; bonus: number } | null {
  const m = /(\d+)\s*[dк]\s*(\d+)\s*(?:([+\-−])\s*(\d+))?/i.exec(text)
  if (m) {
    const bonus = m[3] ? (m[3] === '+' ? 1 : -1) * Number(m[4]) : 0
    return { n: Number(m[1]), sides: Number(m[2]), bonus }
  }
  const flat = /^\s*([+\-−]?\d+)\s*$/.exec(text)
  return flat ? { n: 0, sides: 0, bonus: Number(flat[1].replace('−', '-')) } : null
}

/** Сколько атак даёт одно действие «Атака» */
export function attacksPerAction(className: string, level: number): number {
  if (className === 'Воин') return level >= 20 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1
  if (['Варвар', 'Паладин', 'Следопыт', 'Монах'].includes(className)) return level >= 5 ? 2 : 1
  return 1
}

export const SOURCE_LABEL: Record<string, string> = {
  class: 'умение класса',
  subclass: 'умение подкласса',
  race: 'расовая особенность',
  subrace: 'особенность подрасы',
  background: 'умение предыстории',
  feat: 'черта',
  choice: 'выбор',
  item: 'от предмета',
  other: 'умение',
}

/** Порядок групп на странице умений */
export const SOURCE_GROUPS: { title: string; sources: string[] }[] = [
  { title: 'Класс', sources: ['class'] },
  { title: 'Подкласс', sources: ['subclass'] },
  { title: 'Раса', sources: ['race', 'subrace'] },
  { title: 'Предыстория', sources: ['background'] },
  { title: 'Черты', sources: ['feat'] },
  { title: 'Выбранные: стили, воззвания, предметы договора', sources: ['choice'] },
  { title: 'Предметы', sources: ['item'] },
  { title: 'Прочее', sources: ['other'] },
]

export type SheetAttack = Pick<AttackEntry, 'name' | 'type' | 'attack_bonus' | 'damage' | 'damage_type' | 'range' | 'properties'> & {
  key: string
  versatile: string | null
  image: string | null
}

export interface FeatureRow {
  key: string
  source: string
  title: string
  sub: string
  text: string
  /** умение движка: можно включить или отключить, у него свои действия и ресурсы */
  grantId?: string
  slug?: string
  /** отключено игроком: бонусы не действуют, но умение остаётся в списке */
  disabled?: boolean
  status?: string
  active?: boolean
}

export const STATUS_LABEL: Record<string, string> = {
  text_only: 'только текст — механика не автоматизирована',
  partial: 'частично автоматизировано — часть правила применяйте вручную',
  full: 'автоматизировано',
}

/** «1d20» / «2d6» из лога сервера → число граней */
export const sidesOf = (dice: unknown) => Number(/d(\d+)/i.exec(String(dice ?? ''))?.[1]) || 0
