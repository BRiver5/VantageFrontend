/**
 * Шкала сложности встречи: лёгкая — средняя — трудная — смертельная по порогам
 * партии, опыт с множителем и доля дневного бюджета. Считается на клиенте
 * (src/rooms/gm/encounter.ts) по уровням героев комнаты и ПО выбранных существ.
 */
import { Gauge } from 'lucide-react'
import type { AnyCreature } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { DIFFICULTY_RU, formatXp, rateEncounter } from './encounter'

const crOf = (c: AnyCreature) => (isFullCreature(c) ? c.snapshot.challenge_rating : null)

export function EncounterMeter({ creatures, compact = false }: { creatures: AnyCreature[]; compact?: boolean }) {
  const { data } = useRoom()
  const levels = (data?.characters ?? []).map((c) => c.level || 1)
  const foes = creatures.filter((c) => isFullCreature(c) && !c.summoned_by)
  const r = rateEncounter(levels, foes.map(crOf))
  const t = r.thresholds
  const top = Math.max(t.deadly * 1.25, r.adjustedXp, 1)
  const pos = (n: number) => `${Math.min(100, (n / top) * 100)}%`
  const ticks: [string, number][] = [
    ['лёгкая', t.easy],
    ['средняя', t.medium],
    ['трудная', t.hard],
    ['смертельная', t.deadly],
  ]
  if (levels.length === 0) {
    return <p className={`em-meter is-empty${compact ? ' is-compact' : ''}`}>Сложность встречи появится, когда в комнате будут герои.</p>
  }
  return (
    <div className={`em-meter is-${r.difficulty}${compact ? ' is-compact' : ''}`} aria-label="Сложность встречи">
      <div className="em-head">
        <Gauge aria-hidden="true" />
        <b className="em-grade">{foes.length ? DIFFICULTY_RU[r.difficulty] : 'Нет противников'}</b>
        {foes.length > 0 && (
          <span className="em-xp" title={`${formatXp(r.baseXp)} опыта × ${r.multiplier} за ${r.monsters} противн. при партии из ${r.partySize}`}>
            {formatXp(r.adjustedXp)} <i>оп. с множителем ×{r.multiplier}</i>
          </span>
        )}
      </div>
      <div className="em-bar" title={ticks.map(([n, v]) => `${n}: ${formatXp(v)}`).join(' · ')}>
        <span className="em-fill" style={{ width: pos(r.adjustedXp) }} />
        {ticks.map(([name, v]) => (
          <span key={name} className="em-tick" style={{ left: pos(v) }} aria-hidden="true" />
        ))}
      </div>
      {!compact && (
        <dl className="em-legend">
          {ticks.map(([name, v]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{formatXp(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {foes.length > 0 && (
        <p className="em-hint">
          Герои получат {formatXp(r.baseXp)} оп. · {Math.round(r.dayShare * 100)}% дневного бюджета партии ({formatXp(t.day)} оп.)
        </p>
      )}
    </div>
  )
}
