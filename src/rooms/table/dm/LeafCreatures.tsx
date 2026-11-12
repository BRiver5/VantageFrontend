import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Eye, EyeOff, Plus, Shield, Skull } from 'lucide-react'
import type { AnyCreature, RoomCreature } from '../../../types/rooms'
import { isFullCreature } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { revealCreature } from '../../roomsApi'
import { CardEffects, CreatureBack, HpControls, STAT_RU, statsOf } from '../Cards'
import { creatureArt, creatureHp, creatureName, errText, Hex, HpVessel, SIZE_RU } from '../parts'
import { Img } from '../../../media'
import { AddCreature } from './AddCreature'

/** Жетон ширмы: можно нажать, а можно перетащить на стол */
function ShelfToken({ c, selected, onSelect, onDropToTable }: { c: AnyCreature; selected: boolean; onSelect: () => void; onDropToTable: () => void }) {
  const hp = creatureHp(c)
  const hidden = isFullCreature(c) && c.on_screen_only
  const start = useRef<{ x: number; y: number } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const s = start.current
    if (!s || !hidden) return
    if (ghost || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) setGhost({ x: e.clientX, y: e.clientY })
  }
  const up = (e: RPointerEvent) => {
    const wasDrag = !!ghost
    start.current = null
    setGhost(null)
    if (!wasDrag) return
    const sheet = document.querySelector('.sc-sheet')?.getBoundingClientRect()
    if (sheet && e.clientY < sheet.top) onDropToTable()
  }
  return (
    <>
      <button
        type="button"
        className={`sc-token${selected ? ' is-on' : ''}${hidden ? ' is-hidden' : ' is-out'}${hp.ratio === 0 ? ' is-down' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          start.current = null
          setGhost(null)
        }}
        onClick={onSelect}
        aria-pressed={selected}
        title={hidden ? 'За ширмой. Перетащите на стол, чтобы показать игрокам' : 'На столе'}
      >
        <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
        <b>{creatureName(c)}</b>
      </button>
      {ghost && (
        <span className="sc-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
        </span>
      )}
    </>
  )
}

/** Страница бестиария: всё про выбранное существо на одном развороте */
function BeastPage({ c, onFlip }: { c: RoomCreature; onFlip: () => void }) {
  const { roomId } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hp = creatureHp(c)
  const art = creatureArt(c)
  const s = c.snapshot
  const meta = [s.creature_type, s.size ? (SIZE_RU[s.size] ?? s.size) : null, s.challenge_rating != null ? `ПО ${s.challenge_rating}` : null].filter(Boolean).join(' · ')
  const stats = statsOf(c).filter(([, v]) => v != null)
  const actionText = (name: string, text: string) => (text.startsWith(name) ? text.slice(name.length).replace(/^[.\s:]+/, '') : text)
  return (
    <article className="sc-page">
      <div className="sc-page-art">{art ? <Img src={art} alt="" draggable={false} /> : <Skull aria-hidden="true" />}</div>
      <div className="sc-page-main">
        <header>
          <div>
            <h3>{c.display_name}</h3>
            {meta && <p>{meta}</p>}
          </div>
          {c.on_screen_only ? (
            <button
              type="button"
              className="tb-goldbtn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await revealCreature(roomId, c.id)
                } catch (e) {
                  setError(errText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Eye aria-hidden="true" /> На стол
            </button>
          ) : (
            <span className="sc-page-state">
              <Eye aria-hidden="true" /> на столе
            </span>
          )}
        </header>

        <div className="sc-page-vitals">
          <span className="tb-ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{s.ac}</b>
          </span>
          <HpVessel ratio={hp.ratio} current={hp.current} max={hp.max} temp={hp.temp} />
          <HpControls c={c} />
        </div>
        <CardEffects target={{ creature: c }} title={c.display_name} />
        <dl className="sc-page-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{STAT_RU[k] ?? k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="tb-linkbtn" onClick={onFlip}>
          <EyeOff aria-hidden="true" /> что видят игроки
        </button>
        {error && <p className="tb-err">{error}</p>}
      </div>
      {(s.actions?.length ?? 0) > 0 && (
        <ul className="sc-page-acts">
          {s.actions?.map((a, i) => {
            const name = String(a.name ?? a.title ?? '')
            return (
              <li key={i}>
                <b>{name}</b> {actionText(name, String(a.description ?? a.text ?? ''))}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

export function LeafCreatures() {
  const { data, roomId } = useRoom()
  const [sel, setSel] = useState<string | null>(null)
  // пустая полка сразу открывает бестиарий; после первого добавления поиск не закрывается сам
  const [adding, setAdding] = useState(() => (data?.creatures.length ?? 0) === 0)
  const [back, setBack] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = (data?.creatures ?? []) as AnyCreature[]
  const behind = list.filter((c) => isFullCreature(c) && c.on_screen_only)
  const onTable = list.filter((c) => !(isFullCreature(c) && c.on_screen_only))
  const current = list.find((c) => c.id === sel) ?? list[0] ?? null
  const showAdd = adding || list.length === 0

  const token = (c: AnyCreature) => (
    <ShelfToken
      key={c.id}
      c={c}
      selected={current?.id === c.id && !showAdd}
      onSelect={() => {
        setSel(c.id)
        setAdding(false)
        setBack(false)
      }}
      onDropToTable={() => {
        setError(null)
        revealCreature(roomId, c.id).catch((e) => setError(errText(e)))
      }}
    />
  )

  return (
    <div className="sc-two is-beasts">
      <div className="sc-pane sc-shelf">
        <h4>
          За ширмой
          {behind.length > 0 && <i>перетащите на стол</i>}
        </h4>
        <div className="sc-tokens">
          {behind.map(token)}
          <button type="button" className={`sc-token is-add${showAdd ? ' is-on' : ''}`} onClick={() => setAdding((v) => !v)} aria-pressed={showAdd}>
            <span className="sc-plus">
              <Plus aria-hidden="true" />
            </span>
            <b>Добавить</b>
          </button>
        </div>
        {onTable.length > 0 && (
          <>
            <h4>На столе</h4>
            <div className="sc-tokens">{onTable.map(token)}</div>
          </>
        )}
        {error && <p className="tb-err">{error}</p>}
      </div>
      <div className="sc-pane sc-detail">
        {showAdd ? (
          <AddCreature onClose={() => setAdding(false)} />
        ) : current && isFullCreature(current) ? (
          back ? (
            <CreatureBack c={current} onFlip={() => setBack(false)} />
          ) : (
            <BeastPage c={current} onFlip={() => setBack(true)} />
          )
        ) : null}
      </div>
    </div>
  )
}
