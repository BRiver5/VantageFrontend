/** Окно метки на столе: страница «От мастера» целиком или только подпись */
import { X } from 'lucide-react'
import { useRoom } from '../../rooms/RoomProvider'
import { MarkdownBody } from '../../rooms/kb/Markdown'
import type { MapNote } from '../layers/types'
import { glyphOf } from './icons'

export function NotePopup({ note, onClose }: { note: MapNote; onClose: () => void }) {
  const { data } = useRoom()
  const shared = data?.sharedNotes ?? []
  const page = note.page_id ? shared.find((n) => n.id === note.page_id) : undefined
  const lookup = {
    has: (t: string) => shared.some((x) => x.title.toLowerCase() === t.toLowerCase()),
    body: (t: string) => shared.find((x) => x.title.toLowerCase() === t.toLowerCase())?.body ?? null,
    titles: shared.map((x) => x.title),
  }
  const title = note.label || page?.title || 'Метка'
  return (
    <div className="ly-note" role="dialog" aria-label={title}>
      <header>
        <span className="ly-note-glyph" aria-hidden="true">
          {glyphOf(note.icon)}
        </span>
        <b>{title}</b>
        <button type="button" className="ly-note-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      {page ? (
        <div className="kb-doc is-paper ly-note-body">
          <MarkdownBody src={page.body} pages={lookup} onOpen={() => undefined} />
        </div>
      ) : note.access === 'limited' ? (
        <p className="ly-hint">Подробности мастер пока не открыл.</p>
      ) : note.page_id ? (
        <p className="ly-hint">Страница ещё загружается или уже закрыта.</p>
      ) : null}
    </div>
  )
}
