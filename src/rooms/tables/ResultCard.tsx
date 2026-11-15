/**
 * Карточка вытянутого результата: картинка, текст, вложенная таблица и действие
 * по ссылке — отдать предмет, добавить существо за ширму, открыть страницу.
 */
import { useState } from 'react'
import { BookOpen, Check, Package, Skull } from 'lucide-react'
import { Img } from '../../media'
import { useKnowledge } from '../kb/context'
import { useRoom } from '../RoomProvider'
import { addCreatures, issueItem, issueTemplate } from '../roomsApi'
import { isFullCreature } from '../../types/rooms'
import { errText, Hex } from '../table/parts'
import { TYPE_RU } from './logic'
import type { DrawnResult, TableDraw } from './types'

function useAction() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setDone(msg)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, done, error, run }
}

function GiveItem({ r }: { r: DrawnResult }) {
  const { data, roomId } = useRoom()
  const { busy, done, error, run } = useAction()
  const give = (target: string, where: string) =>
    run(
      () =>
        r.ref_kind === 'template'
          ? issueTemplate(roomId, r.ref_id as string, { target })
          : issueItem(roomId, { kind: r.ref_kind === 'magic_item' ? 'magic_item' : 'equipment', catalog_ref: r.ref_id as string, target }),
      `${r.text}: ${where}`,
    )
  return (
    <div className="rt-act">
      <button type="button" className="tb-linkbtn" disabled={busy} onClick={() => void give('table', 'на столе')}>
        <Package aria-hidden="true" /> на стол
      </button>
      <button type="button" className="tb-linkbtn" disabled={busy} onClick={() => void give('screen', 'за ширмой')}>
        за ширму
      </button>
      {data?.characters.map((c) => (
        <button key={c.id} type="button" className="sc-mini" disabled={busy} title={`Отдать: ${c.name}`} aria-label={`Отдать: ${c.name}`} onClick={() => void give(c.id, c.name)}>
          <Hex raw={c.avatar_url} name={c.name} />
        </button>
      ))}
      {done && (
        <span className="rt-done" role="status">
          <Check aria-hidden="true" /> {done}
        </span>
      )}
      {error && <span className="tb-err">{error}</span>}
    </div>
  )
}

function AddCreature({ r }: { r: DrawnResult }) {
  const { data, roomId } = useRoom()
  const { busy, done, error, run } = useAction()
  const source = r.ref_kind === 'room' ? data?.creatures.find((c) => c.id === r.ref_id) : null
  const add = () => {
    if (r.ref_kind !== 'room') return addCreatures(roomId, { catalog_ref: r.ref_id as string, on_screen_only: true })
    if (!source || !isFullCreature(source)) throw new Error('Существо уже убрано из комнаты')
    return addCreatures(roomId, { snapshot: source.snapshot, display_name: source.display_name, public_name: source.public_name, image_url: source.image_url, visibility: source.visibility, on_screen_only: true })
  }
  return (
    <div className="rt-act">
      <button type="button" className="tb-linkbtn" disabled={busy} onClick={() => void run(async () => add(), 'за ширмой')}>
        <Skull aria-hidden="true" /> добавить за ширму
      </button>
      {done && (
        <span className="rt-done" role="status">
          <Check aria-hidden="true" /> {done}
        </span>
      )}
      {error && <span className="tb-err">{error}</span>}
    </div>
  )
}

function Result({ r }: { r: DrawnResult }) {
  const kb = useKnowledge()
  const nested = r.nested
  return (
    <li className="rt-card">
      {r.image && <Img className="rt-card-art" src={r.image} alt="" />}
      <div className="rt-card-body">
        <span className="rt-card-type">{TYPE_RU[r.type]}</span>
        <b className="rt-card-text">{r.text || '—'}</b>
        {r.ref_id && (r.type === 'item' ? <GiveItem r={r} /> : r.type === 'creature' ? <AddCreature r={r} /> : null)}
        {r.ref_id && r.type === 'kb_page' && kb && (
          <div className="rt-act">
            <button type="button" className="tb-linkbtn" onClick={() => kb.open(r.ref_id)}>
              <BookOpen aria-hidden="true" /> открыть страницу
            </button>
          </div>
        )}
        {nested && 'error' in nested && <span className="tb-err">{nested.error}</span>}
        {nested && 'results' in nested && <DrawCards draw={nested} nested />}
      </div>
    </li>
  )
}

export function DrawCards({ draw, nested = false }: { draw: TableDraw; nested?: boolean }) {
  return (
    <div className={`rt-draw${nested ? ' is-nested' : ''}`}>
      <p className="rt-draw-head">
        {nested && <span>«{draw.table_name}»</span>}
        {draw.forced ? <em>выбран мастером</em> : draw.roll && <em>{draw.roll.expression} = {draw.roll.total}</em>}
      </p>
      <ul className="rt-cards">
        {draw.results.map((r, i) => (
          <Result key={`${r.id}-${i}`} r={r} />
        ))}
      </ul>
    </div>
  )
}
