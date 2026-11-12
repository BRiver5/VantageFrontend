import { useEffect, useState } from 'react'
import { Check, FilePlus2, Heart, Plus, Search, Shield } from 'lucide-react'
import { fetchPage, realImage, type Creature } from '../../../api'
import { useRoom } from '../../RoomProvider'
import { addCreatures } from '../../roomsApi'
import { errText, Hex } from '../parts'
import { HomebrewCreature } from './HomebrewCreature'

export function AddCreature({ onClose }: { onClose: () => void }) {
  const { roomId } = useRoom()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Creature[]>([])
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [own, setOwn] = useState(false)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      fetchPage<Creature>('creatures', { q: q.trim() || undefined, limit: 40 })
        .then((r) => alive && setFound(r.items))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setLoading(false))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="sc-add">
      <header className="sc-add-head">
        <h3 className="sc-subtitle">{own ? 'Своё существо' : 'Бестиарий'}</h3>
        {!own && (
          <label className="sc-search">
            <Search aria-hidden="true" />
            <input type="search" value={q} placeholder="Имя существа…" onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
        )}
        <button type="button" className={`tb-linkbtn sc-own${own ? ' is-on' : ''}`} onClick={() => setOwn((v) => !v)} aria-pressed={own}>
          <FilePlus2 aria-hidden="true" /> {own ? 'из бестиария' : 'своё'}
        </button>
        <span className="sc-count" aria-label="Сколько добавить">
          <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Меньше">
            −
          </button>
          <b>×{count}</b>
          <button type="button" onClick={() => setCount((n) => Math.min(20, n + 1))} aria-label="Больше">
            +
          </button>
        </span>
        <button type="button" className="tb-linkbtn" onClick={onClose}>
          готово
        </button>
      </header>
      {error && <p className="tb-err">{error}</p>}
      {own && <HomebrewCreature count={count} onDone={() => setOwn(false)} />}
      {!own && loading && found.length === 0 && <p className="tb-hint">Листаем бестиарий…</p>}
      {!own && !loading && found.length === 0 && <p className="tb-hint">Никого не нашли.</p>}
      <ul className="sc-beasts" hidden={own}>
        {found.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={added === c.id ? 'is-added' : ''}
              disabled={busy === c.id}
              title="Добавить за ширму"
              onClick={async () => {
                setBusy(c.id)
                setError(null)
                try {
                  await addCreatures(roomId, { catalog_ref: c.id, count, on_screen_only: true })
                  setAdded(c.id)
                  setTimeout(() => setAdded((a) => (a === c.id ? null : a)), 900)
                } catch (e) {
                  setError(errText(e))
                } finally {
                  setBusy(null)
                }
              }}
            >
              <Hex plain={realImage(c.image_gallery) ?? realImage(c.image_url)} name={c.name} tone="enemy" />
              <span className="sc-beast-text">
                <b>{c.name}</b>
                <i>{[c.creature_type, c.challenge_rating != null ? `ПО ${c.challenge_rating}` : null].filter(Boolean).join(' · ')}</i>
                <i className="sc-beast-nums">
                  <Shield aria-hidden="true" /> {c.ac}
                  <Heart aria-hidden="true" /> {c.hp}
                </i>
              </span>
              <span className="sc-beast-add" aria-hidden="true">
                {added === c.id ? <Check /> : <Plus />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
