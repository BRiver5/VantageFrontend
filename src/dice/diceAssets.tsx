import d4Url from '../assets/dices/D4.svg'
import d6Url from '../assets/dices/D6.svg'
import d8Url from '../assets/dices/D8.svg'
import d10Url from '../assets/dices/D10.svg'
import d12Url from '../assets/dices/D12.svg'
import d20Url from '../assets/dices/D20.svg'
import d100Url from '../assets/dices/D100.svg'
import type { DieType } from './DiceShapeIcons'
import { DIE_TYPES } from './DiceShapeIcons'

export const DIE_IMAGE_URLS: Record<DieType, string> = {
  4: d4Url,
  6: d6Url,
  8: d8Url,
  10: d10Url,
  12: d12Url,
  20: d20Url,
  100: d100Url,
}

export function hitDieType(n: number): DieType {
  return DIE_TYPES.includes(n as DieType) ? (n as DieType) : 8
}

interface DieImageProps {
  type: DieType
  size?: number
  className?: string
  title?: string
}

/** Рендер кости из ассетов — вписывается в квадрат с сохранением пропорций */
export function DieImage({ type, size = 26, className = '', title }: DieImageProps) {
  return (
    <img
      src={DIE_IMAGE_URLS[type]}
      alt=""
      aria-hidden={title ? undefined : true}
      title={title}
      className={`die-asset-img${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}

/** Маленькая кость для чипов каталога (кость хитов и т.п.) */
export function DieChipIcon({ type }: { type: DieType }) {
  return <DieImage type={type} size={14} className="die-chip-icon" />
}

/** Логотип — к20 из ассетов */
export function D20LogoImage({ size = 40 }: { size?: number }) {
  return <DieImage type={20} size={size} className="die-logo-img" />
}
