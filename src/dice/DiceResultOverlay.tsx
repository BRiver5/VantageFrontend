import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { critClass, type DieResult } from './DiceShapeIcons'
import {
  playClashImpact,
  playCrackFall,
  playRevealPop,
  playWinnerChime,
} from './diceSounds'

interface DiceResultOverlayProps {
  dice: DieResult[]
  clash?: 'adv' | 'dis' | null
  onClose: () => void
}

type RevealItem =
  | { kind: 'value'; die: DieResult; key: string }
  | { kind: 'plus'; key: string }
  | { kind: 'equals'; total: number; key: string }

type ClashPhase = 'enter' | 'clash' | 'resolve' | 'hold'

const SPARK_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

type D20Crit = 'success' | 'fail'

function d20CritKind(dice: DieResult[]): D20Crit | null {
  if (dice.length !== 1 || dice[0].sides !== 20) return null
  if (dice[0].value >= 20) return 'success'
  if (dice[0].value <= 1) return 'fail'
  return null
}

function clashWinnerIndex(dice: DieResult[], mod: 'adv' | 'dis'): 0 | 1 {
  const a = dice[0].value
  const b = dice[1].value
  if (mod === 'adv') return a >= b ? 0 : 1
  return a <= b ? 0 : 1
}

function ClashDie({
  die,
  side,
  isWinner,
  cracking,
}: {
  die: DieResult
  side: 'left' | 'right'
  isWinner: boolean
  cracking: boolean
}) {
  const crit = critClass(die)

  if (isWinner || !cracking) {
    return (
      <span
        className={`dice-clash-value-wrap dice-clash-value-wrap--${side}${isWinner ? ' is-winner' : ' is-loser'}`}
      >
        <span className={`dice-reveal-value ${crit}`}>{die.value}</span>
      </span>
    )
  }

  return (
    <span className={`dice-clash-value-wrap dice-clash-value-wrap--${side} is-loser is-cracking`}>
      <span className="dice-clash-crack" aria-hidden="true" />
      <span className="dice-clash-half dice-clash-half--left">
        <span className={`dice-reveal-value ${crit}`}>{die.value}</span>
      </span>
      <span className="dice-clash-half dice-clash-half--right">
        <span className={`dice-reveal-value ${crit}`}>{die.value}</span>
      </span>
    </span>
  )
}

export default function DiceResultOverlay({ dice, clash, onClose }: DiceResultOverlayProps) {
  const isClash = clash != null && dice.length === 2 && dice.every((d) => d.sides === 20)

  const winnerIdx = useMemo(
    () => (isClash && clash ? clashWinnerIndex(dice, clash) : 0),
    [dice, clash, isClash],
  )

  const critDice = useMemo(
    () => (isClash ? [dice[winnerIdx]] : dice),
    [dice, isClash, winnerIdx],
  )
  const d20Crit = useMemo(() => d20CritKind(critDice), [critDice])

  const total = useMemo(() => dice.reduce((s, d) => s + d.value, 0), [dice])
  const [visibleCount, setVisibleCount] = useState(0)
  const [burstKey, setBurstKey] = useState<string | null>(null)
  const [clashPhase, setClashPhase] = useState<ClashPhase>('enter')

  const items: RevealItem[] = useMemo(() => {
    const seq: RevealItem[] = []
    dice.forEach((die, i) => {
      if (i > 0) seq.push({ kind: 'plus', key: `plus-${i}` })
      seq.push({ kind: 'value', die, key: `val-${i}` })
    })
    if (dice.length > 1 && !isClash) {
      seq.push({ kind: 'equals', total, key: 'eq' })
    }
    return seq
  }, [dice, total, isClash])

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!isClash) return

    if (reducedMotion) {
      setClashPhase('hold')
      const t = setTimeout(onClose, 2500)
      return () => clearTimeout(t)
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setClashPhase('clash'), 520))
    timers.push(setTimeout(() => setClashPhase('resolve'), 980))
    timers.push(setTimeout(() => setClashPhase('hold'), 1680))
    timers.push(setTimeout(onClose, 4300))
    return () => timers.forEach(clearTimeout)
  }, [isClash, onClose, reducedMotion])

  useEffect(() => {
    if (!isClash || reducedMotion) return
    if (clashPhase === 'clash') playClashImpact()
    if (clashPhase === 'resolve') {
      playCrackFall()
      playWinnerChime()
    }
  }, [clashPhase, isClash, reducedMotion])

  useEffect(() => {
    if (isClash) return

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
    if (item?.kind === 'value') {
      setBurstKey(item.key)
      playRevealPop()
    }

    const delay = item?.kind === 'value' ? 720 : item?.kind === 'equals' ? 500 : 280
    const t = setTimeout(() => setVisibleCount((c) => c + 1), delay)
    return () => clearTimeout(t)
  }, [visibleCount, items, onClose, reducedMotion, isClash])

  const cracking = clashPhase === 'resolve' || clashPhase === 'hold'

  return (
    <div
      className="dice-reveal-overlay"
      role="dialog"
      aria-label={
        d20Crit === 'success'
          ? 'Критический успех — 20'
          : d20Crit === 'fail'
            ? 'Критический провал — 1'
            : isClash
              ? clash === 'adv'
                ? 'Преимущество — 2к20'
                : 'Помеха — 2к20'
              : 'Результат броска'
      }
      onClick={onClose}
    >
      {d20Crit && (isClash ? clashPhase === 'resolve' || clashPhase === 'hold' : visibleCount >= 1) && (
        <div
          className={`dice-crit-banner dice-crit-banner--${d20Crit}${reducedMotion ? ' dice-crit-banner--static' : ''}`}
          role="status"
          aria-live="polite"
        >
          {d20Crit === 'success' ? 'Критический успех' : 'Критический провал'}
        </div>
      )}

      {isClash ? (
        <div
          className={`dice-reveal-formula dice-clash-arena dice-clash-arena--${clash}${reducedMotion ? ' dice-clash-arena--static' : ''} dice-clash-arena--${clashPhase}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ClashDie
            die={dice[0]}
            side="left"
            isWinner={winnerIdx === 0}
            cracking={cracking}
          />
          <span className="dice-clash-impact" aria-hidden="true" />
          <ClashDie
            die={dice[1]}
            side="right"
            isWinner={winnerIdx === 1}
            cracking={cracking}
          />
          {(clashPhase === 'resolve' || clashPhase === 'hold') && !reducedMotion && (
            <span className="dice-clash-burst" aria-hidden="true">
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
        </div>
      ) : (
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
      )}
    </div>
  )
}
