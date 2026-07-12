import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { critClass, type DieResult } from './DiceShapeIcons'

interface DiceResultOverlayProps {
  dice: DieResult[]
  onClose: () => void
}

type RevealItem =
  | { kind: 'value'; die: DieResult; key: string }
  | { kind: 'plus'; key: string }
  | { kind: 'equals'; total: number; key: string }

const SPARK_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

export default function DiceResultOverlay({ dice, onClose }: DiceResultOverlayProps) {
  const total = useMemo(() => dice.reduce((s, d) => s + d.value, 0), [dice])
  const [visibleCount, setVisibleCount] = useState(0)
  const [burstKey, setBurstKey] = useState<string | null>(null)

  const items: RevealItem[] = useMemo(() => {
    const seq: RevealItem[] = []
    dice.forEach((die, i) => {
      if (i > 0) seq.push({ kind: 'plus', key: `plus-${i}` })
      seq.push({ kind: 'value', die, key: `val-${i}` })
    })
    if (dice.length > 1) {
      seq.push({ kind: 'equals', total, key: 'eq' })
    }
    return seq
  }, [dice, total])

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(items.length)
      const t = setTimeout(onClose, 2500)
      return () => clearTimeout(t)
    }

    if (visibleCount >= items.length) {
      const t = setTimeout(onClose, 3000)
      return () => clearTimeout(t)
    }

    const item = items[visibleCount]
    if (item?.kind === 'value') setBurstKey(item.key)

    const delay = item?.kind === 'value' ? 720 : item?.kind === 'equals' ? 500 : 280
    const t = setTimeout(() => setVisibleCount((c) => c + 1), delay)
    return () => clearTimeout(t)
  }, [visibleCount, items, onClose, reducedMotion])

  return (
    <div
      className="dice-reveal-overlay"
      role="dialog"
      aria-label="Результат броска"
      onClick={onClose}
    >
      <div className="dice-reveal-formula" onClick={(e) => e.stopPropagation()}>
        {items.map((item, i) => {
          if (i >= visibleCount) return null

          if (item.kind === 'plus') {
            return (
              <span key={item.key} className="dice-reveal-plus" aria-hidden="true">
                +
              </span>
            )
          }

          if (item.kind === 'equals') {
            return (
              <span key={item.key} className="dice-reveal-equals-wrap">
                <span className="dice-reveal-equals" aria-hidden="true">=</span>
                <span className="dice-reveal-total">{item.total}</span>
              </span>
            )
          }

          const showBurst = burstKey === item.key && !reducedMotion
          return (
            <span key={item.key} className="dice-reveal-value-wrap">
              {showBurst && (
                <span className="dice-reveal-burst" aria-hidden="true">
                  {SPARK_ANGLES.map((deg) => (
                    <span
                      key={deg}
                      className="dice-spark"
                      style={{ '--spark-angle': `${deg}deg` } as CSSProperties}
                    />
                  ))}
                  <span className="dice-reveal-flash" />
                </span>
              )}
              <span className={`dice-reveal-value ${critClass(item.die)}`}>{item.die.value}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
