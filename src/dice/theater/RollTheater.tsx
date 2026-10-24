/**
 * Бросок как в Baldur's Gate 3: сначала крупно выпавшее на кости (при
 * преимуществе или помехе — две к20 сталкиваются, проигравшая трескается),
 * затем под ним встают карточки бонусов — «Сила +3», «Мастерство +2», «Ярость
 * +2» — и по очереди слева направо их число отрывается, летит и врезается в
 * результат, увеличивая его. В конце — итог, крит или провал, и реакции:
 * потратить вдохновение и перебросить, добавить кость превосходства…
 *
 * Сами 3D-кости бросает лист до показа театра; здесь только числа.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Award, Dices, Gem, Shield, Sparkles, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Corners } from '../../ornaments'
import { playAddResult, playComparing } from '../diceSounds'
import type { RollBonusCard, RollMode } from '../../characters/rollBonuses'

export interface TheaterDie {
  sides: number
  value: number
}

/** Что даёт реакция: новая к20 (взять лучшую) или дополнительная кость-бонус */
export type ReactionResult = { newD20: number } | { addDie: TheaterDie; label: string } | null

export interface RollReaction {
  key: string
  label: string
  hint?: string
  icon?: LucideIcon
  run: () => Promise<ReactionResult>
}

export interface RollSpec {
  id: number
  title: string
  /** d20 — попадание, проверка, спасбросок; dice — урон, лечение, кости способностей */
  kind: 'd20' | 'dice'
  dice: TheaterDie[]
  mode: RollMode
  /** откуда преимущество: «Безрассудная атака» */
  modeLabel?: string | null
  bonuses: RollBonusCard[]
  /** крит с этого значения к20 (Чемпион: 19) */
  critMin?: number
  reactions?: RollReaction[]
}

export interface RollOutcome {
  total: number
  /** выпавшее на оставленной к20 */
  natural: number | null
  crit: boolean
  fumble: boolean
}

type Phase = 'dice' | 'bonus' | 'total'

const SPARKS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
const CARD_ICON: Record<RollBonusCard['kind'], LucideIcon> = {
  ability: Shield,
  prof: Award,
  feature: Sparkles,
  item: Gem,
  other: Dices,
}
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

function Burst() {
  return (
    <span className="dice-reveal-burst" aria-hidden="true">
      {SPARKS.map((deg) => (
        <span key={deg} className="dice-spark" style={{ '--spark-angle': `${deg}deg` } as CSSProperties} />
      ))}
      <span className="dice-reveal-flash" />
    </span>
  )
}

/** Оставленная кость: при преимуществе — большая, при помехе — меньшая */
const keptIndex = (dice: TheaterDie[], mode: RollMode) =>
  dice.length < 2 || mode === 'normal' ? 0 : mode === 'adv' ? (dice[0].value >= dice[1].value ? 0 : 1) : dice[0].value <= dice[1].value ? 0 : 1

export function RollTheater({ spec, onDone }: { spec: RollSpec; onDone: (o: RollOutcome) => void }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // кости, режим и бонусы меняются реакциями — держим их в состоянии
  const [dice, setDice] = useState(spec.dice)
  const [mode, setMode] = useState<RollMode>(spec.mode)
  const [modeLabel, setModeLabel] = useState(spec.modeLabel ?? null)
  const [cards, setCards] = useState(spec.bonuses)
  const [phase, setPhase] = useState<Phase>('dice')
  const [applied, setApplied] = useState(0)
  const [flying, setFlying] = useState<number | null>(null)
  const [hitKey, setHitKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [used, setUsed] = useState<Set<string>>(() => new Set())
  const [run, setRun] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const totalRef = useRef<HTMLSpanElement>(null)
  const cardRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [flight, setFlight] = useState<{ dx: number; dy: number } | null>(null)

  const clash = spec.kind === 'd20' && dice.length === 2 && mode !== 'normal'
  const ki = keptIndex(dice, mode)
  const base = spec.kind === 'd20' ? dice[ki].value : dice.reduce((s, d) => s + d.value, 0)
  const natural = spec.kind === 'd20' ? dice[ki].value : null
  const sum = cards.slice(0, applied).reduce((s, c) => s + c.value, 0)
  const total = spec.kind === 'dice' ? Math.max(0, base + sum) : base + sum
  const crit = natural != null && natural >= (spec.critMin ?? 20)
  const fumble = natural === 1
  const done = phase === 'total'

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, reduced ? 0 : ms))
  }, [reduced])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // фаза костей: столкновение двух к20 или выпавшее значение
  useEffect(() => {
    if (phase !== 'dice') return
    playAddResult()
    if (clash) later(() => playComparing(), 520)
    later(() => setPhase(cards.length > applied ? 'bonus' : 'total'), clash ? 1750 : 750 + 120 * Math.max(0, dice.length - 1))
    // run — перезапуск после реакции «перебросить»
  }, [phase, run]) // eslint-disable-line react-hooks/exhaustive-deps

  // фаза бонусов: по одной карточке — оторвать число, долететь, врезаться
  useEffect(() => {
    if (phase !== 'bonus') return
    if (applied >= cards.length) {
      setPhase('total')
      return
    }
    const card = cardRefs.current[applied]
    const target = totalRef.current
    if (card && target) {
      const a = card.getBoundingClientRect()
      const b = target.getBoundingClientRect()
      setFlight({ dx: b.left + b.width / 2 - (a.left + a.width / 2), dy: b.top + b.height / 2 - (a.top + a.height / 2) })
    }
    later(() => setFlying(applied), 260)
    later(() => {
      setFlying(null)
      setApplied((n) => n + 1)
      setHitKey((k) => k + 1)
      playAddResult()
    }, 760)
  }, [phase, applied, cards.length, later])

  // без реакций театр закрывается сам
  const reactions = (spec.reactions ?? []).filter((r) => !used.has(r.key))
  useEffect(() => {
    if (!done || reactions.length > 0) return
    const t = setTimeout(() => onDone({ total, natural, crit, fumble }), reduced ? 1500 : 3200)
    return () => clearTimeout(t)
  }, [done, reactions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => onDone({ total, natural, crit, fumble })

  const skip = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setFlying(null)
    setApplied(cards.length)
    setPhase('total')
  }

  const react = async (r: RollReaction) => {
    setBusy(true)
    const res = await r.run().catch(() => null)
    setBusy(false)
    setUsed((u) => new Set(u).add(r.key))
    if (!res) return
    if ('newD20' in res) {
      // новая к20 против оставленной — берём лучшую, всё проигрывается заново
      setDice([dice[ki], { sides: 20, value: res.newD20 }])
      setMode('adv')
      setModeLabel(r.label)
      setApplied(0)
      setPhase('dice')
      setRun((n) => n + 1)
    } else {
      setCards((c) => [...c, { label: `${res.label} (${res.addDie.value} на к${res.addDie.sides})`, value: res.addDie.value, kind: 'feature' }])
      setPhase('bonus')
    }
  }

  useLayoutEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, cards.length)
  }, [cards.length])

  const title = done && spec.kind === 'd20' && crit ? 'Критическое попадание!' : done && spec.kind === 'd20' && fumble ? 'Критический провал' : spec.title

  return createPortal(
    <div className={`dice-reveal-overlay rt${done ? ' is-done' : ''}`} role="dialog" aria-label={spec.title} onClick={done ? finish : undefined}>
      <div className="dice-reveal-frame" aria-hidden="true">
        <Corners size={52} gold />
        <span className="dice-reveal-edge dice-reveal-edge--top" />
        <span className="dice-reveal-edge dice-reveal-edge--bottom" />
        <span className="dice-reveal-edge dice-reveal-edge--left" />
        <span className="dice-reveal-edge dice-reveal-edge--right" />
      </div>

      <div className="dice-reveal-content rt-content" onClick={(e) => e.stopPropagation()}>
        <p className={`dice-reveal-title gold-text${done && (crit || fumble) ? ` dice-reveal-title--crit dice-reveal-title--${crit ? 'success' : 'fail'}` : ''}`} role="status">
          {title}
        </p>
        {mode !== 'normal' && (
          <span className={`rt-mode is-${mode}`}>
            {mode === 'adv' ? 'Преимущество' : 'Помеха'}
            {modeLabel && ` · ${modeLabel}`}
          </span>
        )}

        {/* ---------- кости ---------- */}
        {clash && phase === 'dice' ? (
          <div key={`clash-${run}`} className={`dice-reveal-formula dice-clash-arena dice-clash-arena--${mode} rt-clash`}>
            {dice.map((d, i) => (
              <span key={i} className={`dice-clash-value-wrap dice-clash-value-wrap--${i === 0 ? 'left' : 'right'}${i === ki ? ' is-winner' : ' is-loser is-cracking'}`}>
                <span className="dice-reveal-value">{d.value}</span>
              </span>
            ))}
            <span className="dice-clash-impact" aria-hidden="true" />
          </div>
        ) : (
          <div className="dice-reveal-formula rt-main">
            {phase === 'dice' && spec.kind === 'dice' && dice.length > 1 ? (
              <span className="rt-dice-row">
                {dice.map((d, i) => (
                  <span key={i} className="rt-die-chip" style={{ '--i': i } as CSSProperties}>
                    {d.value}
                    <i>к{d.sides}</i>
                  </span>
                ))}
              </span>
            ) : null}
            <span key={`total-${run}-${hitKey}`} ref={totalRef} className={`dice-reveal-value-wrap rt-total${hitKey ? ' is-hit' : ''}`}>
              {!reduced && <Burst />}
              <span className={`dice-reveal-value${done && crit ? ' dice-crit-success' : done && fumble ? ' dice-crit-fail' : ''}`}>{total}</span>
            </span>
            {natural != null && applied > 0 && <span className="rt-natural">на кости {natural}</span>}
          </div>
        )}

        {/* ---------- карточки бонусов ---------- */}
        {cards.length > 0 && (
          <div className="rt-cards">
            {cards.map((c, i) => {
              const Icon = CARD_ICON[c.kind]
              const state = i < applied ? ' is-spent' : flying === i ? ' is-flying' : ''
              return (
                <span
                  key={`${c.label}-${i}`}
                  ref={(el) => {
                    cardRefs.current[i] = el
                  }}
                  className={`rt-card is-${c.kind}${state}`}
                  style={(flying === i && flight ? { '--dx': `${flight.dx}px`, '--dy': `${flight.dy}px` } : {}) as CSSProperties}
                >
                  <Icon aria-hidden="true" />
                  <b>{c.label}</b>
                  <span className="rt-card-num">{signed(c.value)}</span>
                </span>
              )
            })}
          </div>
        )}

        {/* ---------- реакции ---------- */}
        {done && reactions.length > 0 && (
          <div className="rt-reactions">
            {reactions.map((r) => {
              const Icon = r.icon ?? Star
              return (
                <button key={r.key} type="button" className="rt-react" disabled={busy} onClick={() => void react(r)} title={r.hint}>
                  <Icon aria-hidden="true" />
                  <span>
                    <b>{r.label}</b>
                    {r.hint && <i>{r.hint}</i>}
                  </span>
                </button>
              )
            })}
            <button type="button" className="cs-btn cs-btn--ghost rt-done" onClick={finish}>
              Готово
            </button>
          </div>
        )}
      </div>

      {!done && (
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
    </div>,
    document.body,
  )
}
