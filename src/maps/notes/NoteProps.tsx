/** Свойства метки в конструкторе: страница, подпись, значок, размер, цвет, видимость */
import { useEffect, useState } from 'react'
import { BookOpen, Trash2 } from 'lucide-react'
import { listNotes } from '../../rooms/roomsApi'
import type { ScreenNote } from '../../types/rooms'
import type { NoteInput } from '../layers/api'
import type { MapNote } from '../layers/types'
import { openKbPage } from './bus'
import { NOTE_ICONS, NOTE_TINTS } from './icons'

export function NoteProps({ roomId, note, onChange, onRemove }: { roomId: string; note: MapNote; onChange: (patch: NoteInput) => void; onRemove: () => void }) {
  const [pages, setPages] = useState<ScreenNote[] | null>(null)
  const [label, setLabel] = useState(note.label)
  useEffect(() => {
    let alive = true
    listNotes(roomId).then(
      (l) => alive && setPages([...l].sort((a, b) => a.title.localeCompare(b.title, 'ru'))),
      () => alive && setPages([]),
    )
    return () => {
      alive = false
    }
  }, [roomId])
  const commitLabel = () => label !== note.label && onChange({ label: label.trim() })
  const page = pages?.find((p) => p.id === note.page_id)
  return (
    <section className="ly-props">
      <h3>Метка</h3>
      <label>
        Страница
        <select value={note.page_id ?? ''} onChange={(e) => onChange({ page_id: e.target.value || null })}>
          <option value="">— без страницы —</option>
          {(pages ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.folder ? `${p.folder} / ` : ''}
              {p.title || 'Без названия'}
            </option>
          ))}
        </select>
      </label>
      {note.page_id && (
        <p className="ly-hint">
          {page ? (page.shared ? 'Страницу видят игроки: метка видна им целиком.' : 'Страница закрыта от игроков.') : 'Страница не найдена.'}{' '}
          <button type="button" className="ly-link" onClick={() => note.page_id && openKbPage(note.page_id)}>
            <BookOpen aria-hidden="true" /> открыть
          </button>
        </p>
      )}
      <label>
        Подпись
        <input value={label} maxLength={120} placeholder={page?.title ?? 'Без подписи'} onChange={(e) => setLabel(e.target.value)} onBlur={commitLabel} onKeyDown={(e) => e.key === 'Enter' && commitLabel()} />
      </label>
      <div className="ly-icons" role="radiogroup" aria-label="Значок">
        {NOTE_ICONS.map((i) => (
          <button key={i.id} type="button" role="radio" aria-checked={note.icon === i.id} className={note.icon === i.id ? 'is-on' : ''} title={i.label} aria-label={i.label} onClick={() => onChange({ icon: i.id })}>
            {i.glyph}
          </button>
        ))}
      </div>
      <label>
        Размер
        <input type="range" min={16} max={128} step={4} value={note.size} onChange={(e) => onChange({ size: Number(e.target.value) })} />
      </label>
      <div className="ly-tints" role="radiogroup" aria-label="Цвет">
        {NOTE_TINTS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={(note.tint ?? NOTE_TINTS[0]) === c} className={(note.tint ?? NOTE_TINTS[0]) === c ? 'is-on' : ''} style={{ background: c }} aria-label={`Цвет ${c}`} onClick={() => onChange({ tint: c })} />
        ))}
        <input type="color" value={note.tint ?? NOTE_TINTS[0]} onChange={(e) => onChange({ tint: e.target.value })} aria-label="Свой цвет" />
      </div>
      <label className="me-check">
        <input type="checkbox" checked={note.always_visible} onChange={(e) => onChange({ always_visible: e.target.checked })} /> видна всегда (сквозь туман)
      </label>
      {note.page_id && (
        <label className="me-check">
          <input type="checkbox" checked={!!note.limited} onChange={(e) => onChange({ limited: e.target.checked })} /> без доступа к странице — только подпись
        </label>
      )}
      <label className="me-check">
        <input type="checkbox" checked={!!note.hidden} onChange={(e) => onChange({ hidden: e.target.checked })} /> только мастеру
      </label>
      <button type="button" className="me-del" onClick={onRemove} title="Страница базы знаний останется">
        <Trash2 aria-hidden="true" /> Убрать метку
      </button>
    </section>
  )
}
