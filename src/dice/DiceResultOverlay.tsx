import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Corners } from '../ornaments'
import { critClass, type DieResult } from './DiceShapeIcons'
import { playAddResult, playComparing } from './diceSounds'

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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

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
  const [skipped, setSkipped] = useState(false)

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

  const animationDone = isClash
    ? clashPhase === 'hold' || skipped
    : visibleCount >= items.length || skipped

  const showCritTitle = Boolean(
    d20Crit && (isClash ? clashPhase === 'resolve' || clashPhase === 'hold' || skipped : visibleCount >= 1 || skipped),
  )

  const titleText = showCritTitle
    ? d20Crit === 'success'
      ? 'Критический успех'
      : 'Критический провал'
    : 'Результат броска'

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const skip = useCallback(() => {
    clearTimers()
    setSkipped(true)
    if (isClash) {
      setClashPhase('hold')
    } else {
      setVisibleCount(items.length)
    }
    const t = setTimeout(onClose, 1200)
    timersRef.current.push(t)
  }, [clearTimers, isClash, items.length, onClose])

  useEffect(() => () => clearTimers(), [clearTimers])

  useEffect(() => {
    if (!isClash) return

    if (reducedMotion) {
      setClashPhase('hold')
      const t = setTimeout(onClose, 2500)
      return () => clearTimeout(t)
    }

    playAddResult()

    const t1 = setTimeout(() => setClashPhase('clash'), 520)
    const t2 = setTimeout(() => setClashPhase('resolve'), 980)
    const t3 = setTimeout(() => setClashPhase('hold'), 1680)
    const t4 = setTimeout(onClose, 4300)
    timersRef.current.push(t1, t2, t3, t4)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [isClash, onClose, reducedMotion])

  useEffect(() => {
    if (!isClash || reducedMotion || skipped) return
    if (clashPhase === 'clash') playComparing()
  }, [clashPhase, isClash, reducedMotion, skipped])

  useEffect(() => {
    if (isClash || skipped) return

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
    const isFinalSound =
      item?.kind === 'equals' ||
      (item?.kind === 'value' && visibleCount === items.length - 1)

    let soundTimer: ReturnType<typeof setTimeout> | undefined

    if (item?.kind === 'value') {
      setBurstKey(item.key)
    }

    if (item?.kind === 'value' || item?.kind === 'equals') {
      if (isFinalSound) {
        soundTimer = setTimeout(() => playAddResult(), 300)
      } else {
        playAddResult()
      }
    }

    const delay = item?.kind === 'value' ? 700 : item?.kind === 'equals' ? 700 : 200
    const t = setTimeout(() => setVisibleCount((c) => c + 1), delay)
    return () => {
      clearTimeout(t)
      if (soundTimer) clearTimeout(soundTimer)
    }
  }, [visibleCount, items, onClose, reducedMotion, isClash, skipped])

  const cracking = clashPhase === 'resolve' || clashPhase === 'hold' || skipped

  const displayCount = skipped && !isClash ? items.length : visibleCount
  const displayClashPhase = skipped ? 'hold' : clashPhase

  return (
    <div
      className={`dice-reveal-overlay${animationDone ? ' is-done' : ''}`}
      role="dialog"
      aria-label={titleText}
      onClick={animationDone ? onClose : undefined}
    >
      <div className="dice-reveal-frame" aria-hidden="true">
        <Corners size={52} gold />
        <span className="dice-reveal-edge dice-reveal-edge--top" />
        <span className="dice-reveal-edge dice-reveal-edge--bottom" />
        <span className="dice-reveal-edge dice-reveal-edge--left" />
        <span className="dice-reveal-edge dice-reveal-edge--right" />
      </div>

      <div className="dice-reveal-content" onClick={(e) => e.stopPropagation()}>
        <p
          className={`dice-reveal-title gold-text${showCritTitle ? ` dice-reveal-title--crit dice-reveal-title--${d20Crit}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {titleText}
        </p>

        {isClash ? (
          <div
            className={`dice-reveal-formula dice-clash-arena dice-clash-arena--${clash}${reducedMotion || skipped ? ' dice-clash-arena--static' : ''} dice-clash-arena--${displayClashPhase}`}
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
            {(displayClashPhase === 'resolve' || displayClashPhase === 'hold') && !reducedMotion && (
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
          <div className="dice-reveal-formula">
            {items.map((item, i) => {
              if (i >= displayCount) return null

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

              const showBurst = burstKey === item.key && !reducedMotion && !skipped
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

      {!animationDone && (
        <button
          type="button"
          className="dice-reveal-skip"
          onClick={(e) => {
            e.stopPropagation()
            skip()
          }}
        >
          Пропустить
        </button>
      )}
    </div>
  )
}
