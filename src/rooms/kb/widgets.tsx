/**
 * Виджеты страницы базы знаний. Хранятся в тексте заметки блоком кода, поэтому
 * переживают сервер и экспорт:
 *
 *   ```board                 доска: фото на булавках, стикеры, ярлыки страниц
 *   {"h":420,"items":[…]}
 *   ```
 *   ```random                таблица случайностей: строка — исход
 *   Слухи в таверне
 *   - Мельник видел огни на болотах
 *   - …
 *   ```
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Dices, FileText, ImagePlus, Link2, MessageCircle, StickyNote, Trash2 } from 'lucide-react'
import { uploadMedia } from '../../api'
import { Img } from '../../media'
import { useRoom } from '../RoomProvider'
import { rollInRoom, sendChat } from '../roomsApi'
import { errText } from '../table/parts'

/* ---------- доска ---------- */

export interface BoardItem {
  id: string
  type: 'photo' | 'note' | 'page'
  /** доля ширины доски, 0..1 */
  x: number
  /** пиксели от верха */
  y: number
  /** наклон в градусах */
  r: number
  src?: string
  text?: string
  page?: string
  color?: 'yellow' | 'pink' | 'blue' | 'green'
}
interface BoardData {
  h: number
  items: BoardItem[]
}

const readBoard = (raw: string): BoardData => {
  try {
    const d = JSON.parse(raw || '{}') as Partial<BoardData>
    return { h: Math.max(240, Math.min(1400, Number(d.h) || 420)), items: Array.isArray(d.items) ? d.items : [] }
  } catch {
    return { h: 420, items: [] }
  }
}
const uid = () => Math.random().toString(36).slice(2, 9)
const COLORS: BoardItem['color'][] = ['yellow', 'pink', 'blue', 'green']

export function BoardWidget({ raw, editable, onChange, onOpenPage, pages }: { raw: string; editable: boolean; onChange: (raw: string) => void; onOpenPage: (title: string) => void; pages: string[] }) {
  const [data, setData] = useState<BoardData>(() => readBoard(raw))
  const [drag, setDrag] = useState<string | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const grab = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null)
  const latest = useRef(data)
  latest.current = data

  // внешняя правка текста — перечитать
  useEffect(() => setData(readBoard(raw)), [raw])

  const commit = (next: BoardData) => {
    setData(next)
    onChange(JSON.stringify(next))
  }
  const place = (): Pick<BoardItem, 'x' | 'y' | 'r'> => ({ x: 0.08 + Math.random() * 0.6, y: 24 + Math.random() * Math.max(40, data.h - 220), r: Math.round(Math.random() * 10 - 5) })
  const add = (it: Omit<BoardItem, 'id' | 'x' | 'y' | 'r'>) => commit({ ...data, items: [...data.items, { id: uid(), ...place(), ...it }] })

  const down = (e: RPointerEvent, it: BoardItem) => {
    if (!editable || (e.target as HTMLElement).closest('button, textarea')) return
    const el = box.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    grab.current = { id: it.id, dx: e.clientX - (rect.left + it.x * rect.width), dy: e.clientY - (rect.top + it.y), moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag(it.id)
  }
  const move = (e: RPointerEvent) => {
    const g = grab.current
    const el = box.current
    if (!g || !el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(0.92, (e.clientX - g.dx - rect.left) / rect.width))
    const y = Math.max(0, Math.min(data.h - 60, e.clientY - g.dy - rect.top))
    g.moved = true
    setData((d) => ({ ...d, items: d.items.map((x0) => (x0.id === g.id ? { ...x0, x, y } : x0)) }))
  }
  const up = () => {
    const g = grab.current
    grab.current = null
    setDrag(null)
    if (g?.moved) onChange(JSON.stringify(latest.current))
  }

  return (
    <div className="kb-board-wrap">
      <div className={`kb-board${editable ? ' is-edit' : ''}`} ref={box} style={{ height: data.h }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {data.items.length === 0 && <p className="kb-board-empty">{editable ? 'Приколите фото, записку или страницу' : 'Доска пуста'}</p>}
        {data.items.map((it) => (
          <div
            key={it.id}
            className={`kb-pin is-${it.type}${it.color ? ` is-${it.color}` : ''}${drag === it.id ? ' is-drag' : ''}`}
            style={{ left: `${it.x * 100}%`, top: it.y, rotate: `${it.r}deg` }}
            onPointerDown={(e) => down(e, it)}
            onDoubleClick={() => editable && it.type === 'note' && setEdit(it.id)}
          >
            <i className="kb-pin-head" aria-hidden="true" />
            {it.type === 'photo' && it.src && <Img src={it.src} alt={it.text ?? ''} draggable={false} />}
            {it.type === 'photo' && (edit === it.id ? null : it.text ? <figcaption>{it.text}</figcaption> : null)}
            {it.type === 'note' &&
              (edit === it.id ? (
                <textarea
                  autoFocus
                  defaultValue={it.text}
                  onBlur={(e) => {
                    setEdit(null)
                    commit({ ...data, items: data.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) })
                  }}
                />
              ) : (
                <p>{it.text || (editable ? 'двойной щелчок — написать' : '')}</p>
              ))}
            {it.type === 'page' && (
              <button type="button" className="kb-pin-page" onClick={() => it.page && onOpenPage(it.page)}>
                <FileText aria-hidden="true" /> {it.page}
              </button>
            )}
            {editable && (
              <span className="kb-pin-tools">
                {it.type === 'note' && (
                  <button type="button" onClick={() => commit({ ...data, items: data.items.map((x) => (x.id === it.id ? { ...x, color: COLORS[(COLORS.indexOf(x.color ?? 'yellow') + 1) % COLORS.length] } : x)) })} aria-label="Цвет" title="Цвет">
                    <i className="kb-dot" />
                  </button>
                )}
                <button type="button" onClick={() => commit({ ...data, items: data.items.filter((x) => x.id !== it.id) })} aria-label="Открепить" title="Открепить">
                  <Trash2 aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="kb-board-bar">
          <button type="button" onClick={() => file.current?.click()}>
            <ImagePlus aria-hidden="true" /> фото
          </button>
          <button type="button" onClick={() => add({ type: 'note', text: '', color: 'yellow' })}>
            <StickyNote aria-hidden="true" /> записка
          </button>
          <span className="kb-board-link">
            <button type="button" onClick={() => setLinking((v) => !v)} aria-expanded={linking}>
              <Link2 aria-hidden="true" /> страница
            </button>
            {linking && (
              <span className="kb-board-pages">
                {pages.map((p) => (
                  <button key={p} type="button" onClick={() => (add({ type: 'page', page: p }), setLinking(false))}>
                    {p}
                  </button>
                ))}
              </span>
            )}
          </span>
          <label className="kb-board-h">
            высота
            <input type="range" min={240} max={1400} step={20} value={data.h} onChange={(e) => setData({ ...data, h: Number(e.target.value) })} onPointerUp={() => onChange(JSON.stringify(data))} />
          </label>
          {error && <span className="tb-err">{error}</span>}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setError(null)
              try {
                const { url } = await uploadMedia(f)
                add({ type: 'photo', src: url, text: f.name.replace(/\.[^.]+$/, '') })
              } catch (err) {
                setError(errText(err))
              }
            }}
          />
        </div>
      )}
    </div>
  )
}

/* ---------- таблица случайностей ---------- */

export function parseRandom(raw: string): { title: string; rows: string[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  const rows = lines.filter((l) => /^([-*+]|\d+[.):])\s+/.test(l)).map((l) => l.replace(/^([-*+]|\d+[.):])\s+/, ''))
  const title = lines.find((l) => l && !/^([-*+]|\d+[.):])\s+/.test(l)) ?? 'Таблица случайностей'
  return { title, rows }
}

export function RandomWidget({ raw, canRoll = true }: { raw: string; canRoll?: boolean }) {
  const { roomId } = useRoom()
  const { title, rows } = parseRandom(raw)
  const [hit, setHit] = useState<number | null>(null)
  const [spin, setSpin] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])

  const roll = async () => {
    if (rows.length < 2) return
    setBusy(true)
    setError(null)
    setSaid(false)
    setHit(null)
    // пока сервер бросает, подсветка бежит по строкам
    timer.current = setInterval(() => setSpin(Math.floor(Math.random() * rows.length)), 70)
    try {
      const r = await rollInRoom(roomId, { expression: `1d${rows.length}`, label: title, visibility: 'dm' })
      await new Promise((ok) => setTimeout(ok, 450))
      setHit(Math.max(1, Math.min(rows.length, r.total)) - 1)
    } catch (e) {
      setError(errText(e))
    } finally {
      clearInterval(timer.current)
      setSpin(null)
      setBusy(false)
    }
  }

  return (
    <div className="kb-random">
      <header>
        <b>{title}</b>
        <i>к{rows.length}</i>
        {canRoll && (
          <button type="button" className="kb-roll" disabled={busy || rows.length < 2} onClick={() => void roll()} title="Бросок видите только вы">
            <Dices aria-hidden="true" /> {busy ? 'бросаем…' : 'бросить'}
          </button>
        )}
      </header>
      <ol>
        {rows.map((row, i) => (
          <li key={i} className={`${hit === i ? 'is-hit' : ''}${spin === i ? ' is-spin' : ''}`}>
            <span>{i + 1}</span>
            <p>{row}</p>
            {hit === i && (
              <button
                type="button"
                className="kb-say"
                disabled={said}
                onClick={() =>
                  void sendChat(roomId, { text: `${title}: ${row}`, channel: 'ic' }).then(
                    () => setSaid(true),
                    (e) => setError(errText(e)),
                  )
                }
              >
                <MessageCircle aria-hidden="true" /> {said ? 'сказано' : 'сказать партии'}
              </button>
            )}
          </li>
        ))}
      </ol>
      {rows.length < 2 && <p className="kb-hint">Добавьте строки «- исход» — хотя бы две</p>}
      {error && <p className="tb-err">{error}</p>}
    </div>
  )
}
