/**
 * Общий журнал комнаты: броски, раздача и передача предметов, бой, состав
 * партии. Источник — события WebSocket; запись про бросок можно раскрыть.
 */
import { useState } from 'react'
import { Dices, DoorOpen, Eye, Package, ScrollText, Swords, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRoom } from './RoomProvider'
import { revealRoll } from './roomsApi'
import type { RoomLogEntry } from '../types/rooms'

const ICON: Record<RoomLogEntry['kind'], LucideIcon> = {
  roll: Dices,
  item: Package,
  combat: Swords,
  member: Users,
  room: DoorOpen,
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })

/** Мастер раскрывает скрытый бросок: всем придёт dice.revealed */
function RevealButton({ seq }: { seq: number }) {
  const { roomId } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <button
      type="button"
      className={`rm-log-reveal${error ? ' is-error' : ''}`}
      disabled={busy}
      title={error ? 'Не удалось раскрыть' : 'Показать этот бросок всем'}
      onClick={() => {
        setBusy(true)
        setError(false)
        revealRoll(roomId, seq).then(
          () => setBusy(false),
          () => (setBusy(false), setError(true)),
        )
      }}
    >
      <Eye aria-hidden="true" /> раскрыть
    </button>
  )
}

export function RoomLog({ limit = 100, bare = false }: { limit?: number; bare?: boolean }) {
  const { data, isDm } = useRoom()
  const entries = (data?.log ?? []).slice(-limit).reverse()
  const revealed = new Set(data?.revealed ?? [])

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
            const secret = e.type === 'dice.rolled' && !!e.roll?.visibility && e.roll.visibility !== 'public'
            return (
              <li key={e.key} className={`rm-log-row is-${e.kind}${d20 === 20 ? ' is-crit' : d20 === 1 ? ' is-fumble' : ''}${secret ? ' is-secret' : ''}`}>
                <Icon aria-hidden="true" />
                <span className="rm-log-text">
                  {e.who && <b>{e.who}</b>} {e.text}
                  {secret && isDm && e.seq != null && !revealed.has(e.seq) && <RevealButton seq={e.seq} />}
                  {secret && e.seq != null && revealed.has(e.seq) && <em className="rm-log-shown">раскрыт</em>}
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
