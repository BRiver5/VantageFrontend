/**
 * Общий журнал комнаты: броски, раздача и передача предметов, бой, состав
 * партии. Источник — события WebSocket; запись про бросок можно раскрыть.
 */
import { Dices, DoorOpen, Package, ScrollText, Swords, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRoom } from './RoomProvider'
import type { RoomLogEntry } from '../types/rooms'

const ICON: Record<RoomLogEntry['kind'], LucideIcon> = {
  roll: Dices,
  item: Package,
  combat: Swords,
  member: Users,
  room: DoorOpen,
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })

export function RoomLog({ limit = 100, bare = false }: { limit?: number; bare?: boolean }) {
  const { data } = useRoom()
  const entries = (data?.log ?? []).slice(-limit).reverse()

  return (
    <div className={bare ? 'rm-log is-bare' : 'rm-panel rm-log'}>
      {!bare && (
        <h3 className="rm-panel-title">
          <ScrollText aria-hidden="true" /> Журнал комнаты
        </h3>
      )}
      {entries.length === 0 ? (
        <p className="rm-hint">Пока тихо. Броски, раздача предметов и бой появятся здесь.</p>
      ) : (
        <ol className="rm-log-list">
          {entries.map((e) => {
            const Icon = ICON[e.kind]
            const d20 = e.roll && e.roll.dice.length === 1 && e.roll.dice[0].sides === 20 && e.roll.dice[0].rolls.length === 1 ? e.roll.dice[0].rolls[0] : null
            return (
              <li key={e.key} className={`rm-log-row is-${e.kind}${d20 === 20 ? ' is-crit' : d20 === 1 ? ' is-fumble' : ''}`}>
                <Icon aria-hidden="true" />
                <span className="rm-log-text">
                  {e.who && <b>{e.who}</b>} {e.text}
                </span>
                <time>{clock(e.ts)}</time>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
