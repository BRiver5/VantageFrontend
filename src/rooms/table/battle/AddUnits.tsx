import { useState } from 'react'
import { X } from 'lucide-react'
import { isFullCreature } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { addCombatants } from '../../roomsApi'
import { creatureArt, creatureName, Hex } from '../parts'
import { errText } from './combatMath'

/* ---------- добавить участников (мастер) ---------- */

export function AddUnits({ onClose }: { onClose: () => void }) {
  const { data, roomId } = useRoom()
  const combat = data?.combat
  const [error, setError] = useState<string | null>(null)
  // пока запрос в пути — второй щелчок не добавит того же участника дважды
  const [busy, setBusy] = useState(false)
  if (!data || !combat) return null
  const inFight = new Set(combat.combatants.map((c) => c.ref_id))
  const heroes = data.characters.filter((c) => !inFight.has(c.id))
  const creatures = data.creatures.filter((c) => !inFight.has(c.id))
  const add = async (body: { character_ids?: string[]; creature_ids?: string[]; hidden?: boolean }) => {
    setBusy(true)
    setError(null)
    try {
      await addCombatants(roomId, combat.id, body)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bt-addunits" role="dialog" aria-label="Добавить в бой">
      <header>
        <b>В бой вступают</b>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      {heroes.length + creatures.length === 0 && <p className="tb-hint">Все уже здесь.</p>}
      <div className="sc-tokens">
        {heroes.map((c) => (
          <button key={c.id} type="button" className="sc-token" disabled={busy} onClick={() => void add({ character_ids: [c.id] })}>
            <Hex raw={c.avatar_url} name={c.name} />
            <b>{c.name}</b>
          </button>
        ))}
        {creatures.map((c) => (
          <button key={c.id} type="button" className="sc-token" disabled={busy} onClick={() => void add({ creature_ids: [c.id], hidden: isFullCreature(c) && c.on_screen_only })}>
            <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
            <b>{creatureName(c)}</b>
          </button>
        ))}
      </div>
      {error && <p className="tb-err">{error}</p>}
    </div>
  )
}
