import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Dices,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Corners } from '../ornaments'
import { signed } from './dice'
import { SENSE_COLORS, splitDamage } from './boardData'

export type BoardRoll = { id: number; label: string; bonus: number; die: number }

export function RollToast({ roll, onDone }: { roll: BoardRoll | null; onDone: () => void }) {
  useEffect(() => {
    if (!roll) return
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [roll, onDone])
  if (!roll) return null
  const crit = roll.die === 20 ? ' is-crit' : roll.die === 1 ? ' is-fumble' : ''
  return (
    <div key={roll.id} className={`beast-toast${crit}`} role="status">
      <Dices aria-hidden="true" />
      <span className="beast-toast-label">{roll.label}</span>
      <span className="beast-toast-math">
        к20 <b>{roll.die}</b> {signed(roll.bonus)}
      </span>
      <strong>{roll.die + roll.bonus}</strong>
    </div>
  )
}

export function BoardCard({
  title,
  icon: Icon,
  wide,
  className = '',
  children,
}: {
  title: string
  icon: LucideIcon
  wide?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`beast-card${wide ? ' beast-card--wide' : ''} ${className}`}>
      <Corners size={18} />
      <h3 className="beast-card-title">
        <Icon aria-hidden="true" /> {title}
      </h3>
      {children}
    </section>
  )
}

export function DamageBand({
  kind,
  title,
  icon: Icon,
  list,
}: {
  kind: 'immune' | 'resist' | 'vuln'
  title: string
  icon: LucideIcon
  list: string[] | null | undefined
}) {
  const { tags, notes } = splitDamage(list)
  if (!tags.length && !notes.length) return null
  return (
    <div className={`beast-dmg-band beast-dmg-band--${kind}`}>
      <span className="beast-dmg-band-head">
        <Icon aria-hidden="true" /> {title}
      </span>
      <div className="beast-dmg-tags">
        {tags.map(({ label, Icon: TagIcon }) => (
          <span key={label} className="beast-dmg-tag" title={label}>
            <TagIcon aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
      {notes.length > 0 && <p className="beast-dmg-note">{notes.join('; ')}</p>}
    </div>
  )
}

export function SensesSonar({ senses }: { senses: { label: string; ft: number; Icon: LucideIcon }[] }) {
  const max = Math.max(...senses.map((s) => s.ft))
  return (
    <div className="beast-sonar">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="beast-sonar-grid" cx="60" cy="60" r="56" />
        <circle className="beast-sonar-grid" cx="60" cy="60" r="28" />
        <line className="beast-sonar-grid" x1="4" y1="60" x2="116" y2="60" />
        <line className="beast-sonar-grid" x1="60" y1="4" x2="60" y2="116" />
        {senses.map((s, i) => (
          <circle
            key={s.label}
            className="beast-sonar-ring"
            cx="60"
            cy="60"
            r={(56 * s.ft) / max}
            style={{ stroke: SENSE_COLORS[i], fill: `${SENSE_COLORS[i]}14`, animationDelay: `${i * 0.25}s` }}
          />
        ))}
        <g className="beast-sonar-sweep">
          <path d="M60 60 L60 4 A56 56 0 0 1 99.6 20.4 Z" />
        </g>
        <circle cx="60" cy="60" r="2.5" fill="#f6e7b6" />
      </svg>
      <ul className="beast-sonar-legend">
        {senses.map((s, i) => (
          <li key={s.label} style={{ '--c': SENSE_COLORS[i] } as CSSProperties}>
            <s.Icon aria-hidden="true" />
            <span>{s.label}</span>
            <b>{s.ft} фт.</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
