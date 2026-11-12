import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowDown,
  Dices,
  Feather,
  Footprints,
  Minus,
  Mountain,
  Plus,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Creature } from '../api'
import { parseDice, signed, useCreatureDice } from './dice'

export function ArmorCard({ ac, source }: { ac: number; source: string | null }) {
  const [attack, setAttack] = useState(5)
  const need = Math.max(2, Math.min(20, ac - attack))
  const chance = Math.round(((21 - need) / 20) * 100)
  return (
    <div className="beast-def-card beast-armor">
      <div className="beast-shield">
        <svg viewBox="0 0 100 116" aria-hidden="true">
          <defs>
            <linearGradient id="shield-edge" x1="0" y1="0" x2="100" y2="116" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7c828b" />
              <stop offset="45%" stopColor="#cdd3db" />
              <stop offset="55%" stopColor="#f1f4f8" />
              <stop offset="100%" stopColor="#8b919a" />
            </linearGradient>
            <linearGradient id="shield-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#262a32" />
              <stop offset="100%" stopColor="#0d0e11" />
            </linearGradient>
          </defs>
          <path
            className="beast-shield-body"
            d="M50 4 L92 18 V54 C92 84 72 102 50 112 C28 102 8 84 8 54 V18 Z"
            fill="url(#shield-body)"
            stroke="url(#shield-edge)"
            strokeWidth="2.4"
          />
          <path
            d="M50 13 L83 24 V54 C83 78 67 93 50 102 C33 93 17 78 17 54 V24 Z"
            fill="none"
            stroke="url(#shield-edge)"
            strokeWidth="0.8"
            opacity="0.55"
          />
        </svg>
        <span className="beast-shield-value">
          <b>{ac}</b>
          <i>КД</i>
        </span>
      </div>
      <div className="beast-def-body">
        <span className="beast-def-label">Класс доспеха</span>
        {source && <span className="beast-def-note">{source}</span>}
        <div className="beast-hit-calc">
          <span className="beast-hit-calc-label">ваша атака</span>
          <span className="beast-stepper">
            <button type="button" onClick={() => setAttack((v) => Math.max(-5, v - 1))} aria-label="меньше">
              <Minus aria-hidden="true" />
            </button>
            <b>{signed(attack)}</b>
            <button type="button" onClick={() => setAttack((v) => Math.min(20, v + 1))} aria-label="больше">
              <Plus aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="beast-hit-bar" style={{ '--pct': `${chance}%` } as CSSProperties}>
          <span />
        </div>
        <span className="beast-def-note">
          попадание на <b>{need}+</b> · {chance}%
        </span>
      </div>
    </div>
  )
}

export function HitPointsCard({ hp, formula }: { hp: number; formula: string | null }) {
  const dice = parseDice(formula)
  const min = dice ? Math.max(1, dice.n + dice.bonus) : hp
  const top = dice ? dice.n * dice.sides + dice.bonus : hp
  const [rolled, setRolled] = useState<number | null>(null)
  const [rollId, setRollId] = useState(0)
  const value = rolled ?? hp
  const pct = top > min ? 18 + ((value - min) / (top - min)) * 72 : 70

  const roller = useCreatureDice()
  const roll = async () => {
    if (!dice) return
    const values = await roller.roll(dice.n, dice.sides)
    if (!values) return
    setRolled(Math.max(1, values.reduce((s, v) => s + v, dice.bonus)))
    setRollId((n) => n + 1)
  }

  return (
    <div className="beast-def-card beast-hp">
      <div className="beast-vial" style={{ '--fill': `${pct}%` } as CSSProperties}>
        <span className="beast-vial-inner">
          <span className="beast-vial-liquid" />
        </span>
        <span className="beast-vial-value">
          <b key={rollId}>{value}</b>
          <i>хиты</i>
        </span>
      </div>
      <div className="beast-def-body">
        <span className="beast-def-label">Хиты</span>
        {formula && <span className="beast-def-note">{formula.trim()}</span>}
        {dice && (
          <>
            <span className="beast-def-note">
              от {min} до {top} · в среднем {hp}
            </span>
            <button type="button" className="beast-roll-btn" onClick={() => void roll()} disabled={roller.rolling}>
              <Dices aria-hidden="true" /> бросить хиты
            </button>
            {rolled != null && (
              <button type="button" className="beast-def-reset" onClick={() => setRolled(null)}>
                сбросить к среднему
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function MovementCard({ c }: { c: Creature }) {
  const rows: [LucideIcon, string, number | null][] = [
    [Footprints, 'ходьба', c.speed],
    [Feather, 'полёт', c.flight_speed],
    [Waves, 'плавание', c.swim_speed],
    [Mountain, 'лазание', c.climb_speed],
    [ArrowDown, 'копание', c.burrow_speed],
  ]
  const list = rows.filter(([, , v]) => v)
  if (!list.length) return null
  const fastest = Math.max(...list.map(([, , v]) => v as number))
  return (
    <div className="beast-def-card beast-move">
      <span className="beast-def-label">Скорость</span>
      {list.map(([Icon, label, v]) => (
        <div key={label} className="beast-move-row">
          <Icon aria-hidden="true" />
          <span className="beast-move-label">{label}</span>
          <span className="beast-move-track">
            <span style={{ width: `${((v as number) / fastest) * 100}%` }} />
          </span>
          <b>{v} фт.</b>
        </div>
      ))}
    </div>
  )
}
