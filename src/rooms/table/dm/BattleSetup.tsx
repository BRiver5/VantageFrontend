import { useState } from 'react'
import { Swords, X } from 'lucide-react'
import type { AnyCreature } from '../../../types/rooms'
import { isFullCreature } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { addCombatants, startCombat } from '../../roomsApi'
import { creatureArt, creatureName, errText, Hex } from '../parts'

/* ---------- начало боя ---------- */

export function BattleSetup({ onClose }: { onClose: () => void }) {
  const { data, roomId } = useRoom()
  const creatures = (data?.creatures ?? []) as AnyCreature[]
  const [picked, setPicked] = useState<string[]>(() => creatures.filter((c) => !isFullCreature(c) || !c.on_screen_only).map((c) => c.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data) return null
  return (
    <div className="sc-battleset" role="dialog" aria-label="Начать бой">
      <header>
        <Swords aria-hidden="true" />
        <b>Кто вступает в бой?</b>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <p className="tb-hint">Герои идут все. Отметьте существ — скрытые останутся невидимыми для игроков до показа.</p>
      <div className="sc-tokens">
        {creatures.map((c) => (
          <button key={c.id} type="button" className={`sc-token${picked.includes(c.id) ? ' is-on' : ' is-off'}`} aria-pressed={picked.includes(c.id)} onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}>
            <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
            <b>{creatureName(c)}</b>
          </button>
        ))}
        {creatures.length === 0 && <p className="tb-hint">Существ пока нет: добавьте их в разделе «Существа».</p>}
      </div>
      <footer>
        {error && <span className="tb-err">{error}</span>}
        <button
          type="button"
          className="tb-goldbtn"
          disabled={busy || data.room.status === 'closed'}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              // скрытость на сервере — один флаг на запрос: видимых ставим сразу, тех, что за ширмой, — вторым запросом
              const behind = (c: AnyCreature) => isFullCreature(c) && c.on_screen_only
              const chosen = creatures.filter((c) => picked.includes(c.id))
              const hidden = chosen.filter(behind).map((c) => c.id)
              const visible = chosen.filter((c) => !behind(c)).map((c) => c.id)
              const heroes = data.characters.map((c) => c.id)
              if (visible.length === 0 && hidden.length > 0) {
                await startCombat(roomId, { character_ids: heroes, creature_ids: hidden, hidden_creatures: true })
              } else {
                const view = await startCombat(roomId, { character_ids: heroes, creature_ids: visible })
                if (hidden.length > 0) await addCombatants(roomId, view.id, { creature_ids: hidden, hidden: true })
              }
              onClose()
            } catch (e) {
              setError(errText(e))
              setBusy(false)
            }
          }}
        >
          <Swords aria-hidden="true" /> К бою!
        </button>
      </footer>
    </div>
  )
}
