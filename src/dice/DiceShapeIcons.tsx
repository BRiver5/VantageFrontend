export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100

export const DIE_TYPES: DieType[] = [4, 6, 8, 10, 12, 20, 100]

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.35,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

interface DiceShapeIconProps {
  type: DieType
  size?: number
}

/** Силуэт кости — только рёбра, без заливки. к100 — два наложенных к10. */
export function DiceShapeIcon({ type, size = 26 }: DiceShapeIconProps) {
  if (type === 100) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="dice-shape-svg">
        <g transform="translate(1, 3) rotate(-14 13 13)">
          <Die10Outline />
        </g>
        <g transform="translate(9, 1) rotate(12 13 13)">
          <Die10Outline />
        </g>
        <text x="16" y="30" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">100</text>
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="dice-shape-svg">
      {type === 4 && <Die4Outline />}
      {type === 6 && <Die6Outline />}
      {type === 8 && <Die8Outline />}
      {type === 10 && <Die10Outline />}
      {type === 12 && <Die12Outline />}
      {type === 20 && <Die20Outline />}
      <text x="16" y="30" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">{type}</text>
    </svg>
  )
}

function Die4Outline() {
  return (
    <g {...STROKE}>
      <polygon points="16,5 27,25 5,25" />
      <line x1="16" y1="5" x2="16" y2="25" opacity="0.55" />
      <line x1="5" y1="25" x2="27" y2="25" opacity="0.55" />
    </g>
  )
}

function Die6Outline() {
  return (
    <g {...STROKE}>
      <rect x="8" y="8" width="16" height="16" rx="2" />
      <line x1="8" y1="16" x2="24" y2="16" opacity="0.5" />
      <line x1="16" y1="8" x2="16" y2="24" opacity="0.5" />
    </g>
  )
}

function Die8Outline() {
  return (
    <g {...STROKE}>
      <polygon points="16,6 26,16 16,26 6,16" />
      <line x1="6" y1="16" x2="26" y2="16" opacity="0.5" />
      <line x1="16" y1="6" x2="16" y2="26" opacity="0.5" />
    </g>
  )
}

function Die10Outline() {
  return (
    <g {...STROKE}>
      <polygon points="16,5 26,10 26,22 16,27 6,22 6,10" />
      <line x1="6" y1="10" x2="26" y2="22" opacity="0.45" />
      <line x1="26" y1="10" x2="6" y2="22" opacity="0.45" />
      <line x1="16" y1="5" x2="16" y2="27" opacity="0.45" />
    </g>
  )
}

function Die12Outline() {
  return (
    <g {...STROKE}>
      <polygon points="16,5 28,11 28,23 16,29 4,23 4,11" />
      <line x1="4" y1="11" x2="28" y2="23" opacity="0.4" />
      <line x1="28" y1="11" x2="4" y2="23" opacity="0.4" />
      <line x1="16" y1="5" x2="16" y2="29" opacity="0.4" />
    </g>
  )
}

function Die20Outline() {
  return (
    <g {...STROKE}>
      <polygon points="16,4 28,11 28,23 16,30 4,23 4,11" />
      <line x1="4" y1="11" x2="28" y2="23" opacity="0.4" />
      <line x1="28" y1="11" x2="4" y2="23" opacity="0.4" />
      <line x1="10" y1="7" x2="22" y2="27" opacity="0.35" />
      <line x1="22" y1="7" x2="10" y2="27" opacity="0.35" />
    </g>
  )
}
