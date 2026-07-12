import { DieImage } from './diceAssets'

export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100

export const DIE_TYPES: DieType[] = [4, 6, 8, 10, 12, 20, 100]

export interface DieResult {
  sides: number
  value: number
}

/**
 * Класс цвета цифры по результату: минимум (крит-провал) — бронза,
 * максимум грани (крит-успех) — золото, всё между — серебро.
 */
export function critClass({ sides, value }: DieResult): string {
  if (value <= 1) return 'dice-crit-fail'
  if (value >= sides) return 'dice-crit-success'
  return 'dice-crit-normal'
}

interface DiceShapeIconProps {
  type: DieType
  size?: number
}

/** Иконка кости в лотке — из ассетов src/assets/dices */
export function DiceShapeIcon({ type, size = 30 }: DiceShapeIconProps) {
  return <DieImage type={type} size={size} title={`к${type}`} />
}
