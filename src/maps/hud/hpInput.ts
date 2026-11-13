/**
 * Быстрая правка хитов в панели жетона: «-7» — урон, «+5» — лечение,
 * «=12» или просто «12» — установить, «в5» / «t5» — временные хиты.
 */
export type HpOp = 'damage' | 'heal' | 'set' | 'temp'

export interface HpChange {
  op: HpOp
  amount: number
}

const MAX = 9999

export function parseHpInput(text: string): HpChange | null {
  const s = text.trim().replace(/\s+/g, '').replace(/[−–—]/g, '-').toLowerCase()
  const m = /^([-+=]|в|t|вр)?(\d{1,4})$/.exec(s)
  if (!m) return null
  const amount = Math.min(MAX, Number(m[2]))
  const sign = m[1] ?? '='
  if (sign === '-') return amount > 0 ? { op: 'damage', amount } : null
  if (sign === '+') return amount > 0 ? { op: 'heal', amount } : null
  if (sign === '=') return { op: 'set', amount }
  return { op: 'temp', amount }
}

/**
 * У героя на сервере нет «установить» (POST …/characters/{c}/vitals: damage, heal, temp).
 * Ставим через разницу с текущими хитами; временные хиты урон съест первыми — тогда
 * не угадаем, поэтому при временных хитах «установить» у героя не поддерживаем.
 */
export function heroVitals(change: HpChange, hp: { current: number; temp: number }): HpChange | { error: string } | null {
  if (change.op !== 'set') return change
  if (hp.temp > 0) return { error: 'У героя есть временные хиты: укажите −урон или +лечение' }
  const diff = change.amount - hp.current
  if (diff === 0) return null
  return diff > 0 ? { op: 'heal', amount: diff } : { op: 'damage', amount: -diff }
}

export const HP_OP_LABEL: Record<HpOp, string> = {
  damage: 'Урон',
  heal: 'Лечение',
  set: 'Хиты',
  temp: 'Временные хиты',
}
