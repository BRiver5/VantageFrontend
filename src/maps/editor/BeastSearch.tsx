import { useEffect, useState } from 'react'
import { fetchPage, type Creature } from '../../api'
import { addCreatures } from '../../rooms/roomsApi'
import { useRoom } from '../../rooms/RoomProvider'
import { errText } from './batch'

/** Бестиарий прямо в конструкторе: найти, добавить в комнату и сразу ставить */
export function BeastSearch({ onAdded }: { onAdded: (c: { id: string; name: string }) => void }) {
  const { roomId } = useRoom()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Creature[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!q.trim()) {
      setFound([])
      return
    }
    let on = true
    const t = setTimeout(() => {
      fetchPage<Creature>('creatures', { q: q.trim(), limit: 12 }).then(
        (r) => on && setFound(r.items),
        () => on && setFound([]),
      )
    }, 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="me-beasts">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Бестиарий: гоблин, волк, скелет…" aria-label="Поиск существа" />
      {found.length > 0 && (
        <ul>
          {found.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy === c.id}
                onClick={async () => {
                  setBusy(c.id)
                  setErr(null)
                  try {
                    const [made] = await addCreatures(roomId, { catalog_ref: c.id, count: 1, on_screen_only: true })
                    if (made) onAdded({ id: made.id, name: made.display_name ?? c.name })
                  } catch (e) {
                    setErr(errText(e))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {c.name}
                {c.size ? <i> · {c.size}</i> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="tb-err">{err}</p>}
    </div>
  )
}
