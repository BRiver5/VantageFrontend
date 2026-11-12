import type { CombatantView } from '../../../types/rooms'
import { Hex } from '../parts'
import { artOf, nameOf } from './combatMath'

/* ---------- порядок хода ---------- */

export function TurnStrip({ list, current }: { list: CombatantView[]; current: string | null }) {
  // идущий сейчас всегда первым: очередь как в тактических RPG
  const at = Math.max(0, list.findIndex((c) => c.id === current))
  const order = [...list.slice(at), ...list.slice(0, at)]
  return (
    <ol className="bt-strip" aria-label="Порядок хода">
      {order.map((c, i) => (
        <li key={c.id} className={`is-${c.side}${i === 0 && current ? ' is-now' : ''}${c.defeated ? ' is-defeated' : ''}`} title={`${nameOf(c)}: ${c.initiative ?? '—'}`}>
          {c.card ? <Hex raw={c.card.avatar_url} name={c.card.name} /> : <Hex plain={artOf(c)} name={nameOf(c)} tone="enemy" />}
          <i>{c.initiative ?? '?'}</i>
        </li>
      ))}
    </ol>
  )
}
