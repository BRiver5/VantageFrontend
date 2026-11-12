import {
  Heart,
} from 'lucide-react'
import { DieImage, hitDieType } from '../../../dice/diceAssets'
import type { FeatureEntry } from '../../../classArticleHtml'

/** Сколько нового даёт уровень по сравнению с предыдущим */
export interface LevelRequirements {
  skillsNeeded: number
  skillOptions: string[]
  needsSubclass: boolean
  isAsi: boolean
  cantripsNeeded: number
  spellsNeeded: number
  maxCircle: number
  newSlots: { circle: number; count: number }[]
  /** все ячейки на этом уровне и сколько их было до него */
  slots: { circle: number; count: number; before: number }[]
  classFeatures: FeatureEntry[]
  subFeatures: FeatureEntry[]
}

/** Хиты уровня жетонами: [кость → значение] + [ТЕЛ ±n] = [итог] */
export function HpEquation({
  die,
  value,
  conMod,
  total,
}: {
  die: number
  value: number
  conMod: number
  total: number
}) {
  return (
    <div className="cw-hp-eq" aria-label={`${value} ${conMod >= 0 ? '+' : '−'} ${Math.abs(conMod)} = ${total} хитов`}>
      <span className="cw-hp-token">
        <DieImage type={hitDieType(die)} size={22} />
        <b>{value}</b>
        <i>к{die}</i>
      </span>
      <span className="cw-hp-op">{conMod >= 0 ? '+' : '−'}</span>
      <span className="cw-hp-token">
        <b>{Math.abs(conMod)}</b>
        <i>ТЕЛ</i>
      </span>
      <span className="cw-hp-op">=</span>
      <span className="cw-hp-token cw-hp-token--total">
        <Heart aria-hidden="true" />
        <b>{total}</b>
        <i>хитов</i>
      </span>
    </div>
  )
}
