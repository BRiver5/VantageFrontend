/**
 * Прибавочные кости эффектов: Благословение (+1к4), Порча (−1к4), Метка
 * охотника (+1к6 к урону)… Сервер присылает их отдельными записями в dice[]
 * с полем source и своим знаком. Показываем другим цветом: зелёный кубик
 * добавляет, красный отнимает — и в 3D, и в журнале.
 */
import type { ForcedDie } from './diceControl'

export const BONUS_UP = '#2f9e57'
export const BONUS_DOWN = '#b3261e'

export interface DieGroup {
  sides: number
  sign: 1 | -1
  rolls: number[]
  source?: string
  dropped?: number[]
}

export const bonusColor = (d: Pick<DieGroup, 'sign' | 'source'>): string | undefined => (d.source ? (d.sign < 0 ? BONUS_DOWN : BONUS_UP) : undefined)

/** Грани для 3D: у прибавочных — свой цвет корпуса */
export function facesOf(groups: DieGroup[] | null | undefined): ForcedDie[] {
  return (groups ?? []).flatMap((d) => d.rolls.map((value) => ({ sides: d.sides, value, color: bonusColor(d) })))
}

/** Сколько и чем прибавили эффекты: «Благословение +3», «Порча −2» */
export function bonusNotes(groups: DieGroup[] | null | undefined): { source: string; value: number; up: boolean }[] {
  const out = new Map<string, number>()
  for (const d of groups ?? []) {
    if (!d.source) continue
    const sum = d.rolls.reduce((s, v, i) => s + (d.dropped?.includes(i) ? 0 : v), 0) * d.sign
    out.set(d.source, (out.get(d.source) ?? 0) + sum)
  }
  return [...out].map(([source, value]) => ({ source, value, up: value >= 0 }))
}
