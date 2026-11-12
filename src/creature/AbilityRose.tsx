import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Dices,
} from 'lucide-react'
import type { Creature } from '../api'
import { abilityMod, signed, useCreatureDice } from './dice'
import { ABILITIES } from './boardData'

const VB = 320

const C = VB / 2

const R = 100

const LABEL_R = 138

function polar(i: number, r: number): [number, number] {
  const a = ((-90 + 60 * i) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

const ring = (r: number) => ABILITIES.map((_, i) => polar(i, r).join(',')).join(' ')

type Roll = { id: number; ability: string; kind: 'проверка' | 'спасбросок'; die: number; bonus: number }

export function AbilityRose({ c }: { c: Creature }) {
  const scores = ABILITIES.map((a) => (c[a.key] as number | null) ?? 10)
  const saves = c.saving_throws ?? {}
  const max = Math.max(20, ...scores)
  const [selected, setSelected] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [roll, setRoll] = useState<Roll | null>(null)

  const active = hovered ?? selected
  const a = ABILITIES[active]
  const score = scores[active]
  const checkBonus = abilityMod(score)
  const saveBonus = saves[a.save] ?? checkBonus
  const hasSaveProf = saves[a.save] != null

  const data = scores.map((s, i) => polar(i, (R * s) / max).join(',')).join(' ')

  const dice = useCreatureDice()
  const doRoll = async (kind: Roll['kind']) => {
    const ability = a.name
    const bonus = kind === 'проверка' ? checkBonus : saveBonus
    const values = await dice.roll(1, 20)
    if (values) setRoll((prev) => ({ id: (prev?.id ?? 0) + 1, ability, kind, die: values[0], bonus }))
  }

  return (
    <div className="beast-rose">
      <div className="beast-rose-chart" onMouseLeave={() => setHovered(null)}>
        <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true">
          <defs>
            <radialGradient id="rose-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f6e7b6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#c49a3c" stopOpacity="0.16" />
            </radialGradient>
          </defs>
          {[1, 0.75, 0.5, 0.25].map((k) => (
            <polygon key={k} className="beast-rose-ring" points={ring(R * k)} />
          ))}
          {ABILITIES.map((_, i) => {
            const [x, y] = polar(i, R)
            return (
              <line
                key={i}
                className={`beast-rose-axis${i === active ? ' is-active' : ''}`}
                x1={C}
                y1={C}
                x2={x}
                y2={y}
              />
            )
          })}
          <polygon className="beast-rose-data" points={data} />
          {scores.map((s, i) => {
            const [x, y] = polar(i, (R * s) / max)
            return <circle key={i} className={`beast-rose-dot${i === active ? ' is-active' : ''}`} cx={x} cy={y} r={i === active ? 4.5 : 3} />
          })}
        </svg>

        {ABILITIES.map((ab, i) => {
          const [x, y] = polar(i, LABEL_R)
          const prof = saves[ab.save] != null
          return (
            <button
              key={ab.key}
              type="button"
              className={`beast-rose-node${i === active ? ' is-active' : ''}${prof ? ' is-prof' : ''}`}
              style={{ left: `${(x / VB) * 100}%`, top: `${(y / VB) * 100}%` } as CSSProperties}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
              title={`${ab.name}${prof ? ' · владение спасброском' : ''}`}
            >
              <span className="beast-rose-node-inner">
                <b>{scores[i]}</b>
                <i>{ab.short} {signed(abilityMod(scores[i]))}</i>
              </span>
            </button>
          )
        })}
      </div>

      <div className="beast-rose-readout">
        <div className="beast-rose-readout-head">
          <span className="beast-rose-readout-name">{a.name}</span>
          <span className="beast-rose-readout-score">{score}</span>
        </div>
        <div className="beast-rose-actions">
          <button type="button" className="beast-roll-btn" onClick={() => void doRoll('проверка')} disabled={dice.rolling}>
            <Dices aria-hidden="true" /> проверка <b>{signed(checkBonus)}</b>
          </button>
          <button
            type="button"
            className={`beast-roll-btn${hasSaveProf ? ' is-prof' : ''}`}
            onClick={() => void doRoll('спасбросок')}
            disabled={dice.rolling}
          >
            <Dices aria-hidden="true" /> спасбросок <b>{signed(saveBonus)}</b>
          </button>
        </div>
        {roll && (
          <p
            key={roll.id}
            className={`beast-roll-result${roll.die === 20 ? ' is-crit' : roll.die === 1 ? ' is-fumble' : ''}`}
          >
            <span>{roll.ability}, {roll.kind}:</span> к20 <b>{roll.die}</b> {signed(roll.bonus)} ={' '}
            <strong>{roll.die + roll.bonus}</strong>
          </p>
        )}
      </div>
    </div>
  )
}
