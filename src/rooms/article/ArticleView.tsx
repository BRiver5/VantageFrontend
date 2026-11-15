/**
 * Статья для чтения: страница кодекса мастера или заметка, открытая партии.
 * Ссылки [[…]] ведут по страницам внутри того же просмотра. Используется в
 * окне чтения у игрока и в окнах «вынести в окно».
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { useRoom } from '../RoomProvider'
import { MarkdownBody } from '../kb/Markdown'
import { parsePage } from '../kb/mdparse'
import { PopOutButton, PopOutWindow } from '../../popout/PopOutWindow'
import { emitRoomCommand, useRoomCommand } from '../commands'
import { usePopouts } from '../../popout/store'
import { writeSlotDrag } from '../../hotbar/source'

export interface ArticleNote {
  id: string
  title: string
  body: string
  folder?: string | null
}

export function ArticleView({ noteId, notes, actions }: { noteId: string; notes: ArticleNote[]; actions?: ReactNode }) {
  const [trail, setTrail] = useState<string[]>([noteId])
  const currentId = trail[trail.length - 1]
  const note = notes.find((n) => n.id === currentId) ?? null
  const lookup = useMemo(() => {
    const byTitle = (t: string) => notes.find((n) => n.title.toLowerCase() === t.trim().toLowerCase()) ?? null
    return { has: (t: string) => !!byTitle(t), body: (t: string) => byTitle(t)?.body ?? null, titles: notes.map((n) => n.title), byTitle }
  }, [notes])
  if (!note) return <p className="ar-missing">Страница недоступна: её убрали или закрыли от партии.</p>
  const { meta } = parsePage(note.body)
  return (
    <article className="ar-view kb-stage">
      <header className="ar-head">
        {trail.length > 1 && (
          <button type="button" className="po-btn" onClick={() => setTrail((t) => t.slice(0, -1))} aria-label="Назад">
            <ChevronLeft aria-hidden="true" />
          </button>
        )}
        {/* заголовок можно перетащить на панель быстрых действий */}
        <h2 draggable onDragStart={(e) => writeSlotDrag(e.dataTransfer, { kind: 'article', ref: note.id, label: note.title || 'Статья' })} title="Перетащите на панель быстрых действий">
          {meta.icon ? `${meta.icon} ` : ''}
          {note.title || 'Без названия'}
        </h2>
        {note.folder && <i>{note.folder}</i>}
        {actions}
      </header>
      {meta.cover && <img className="ar-cover" src={meta.cover} alt="" />}
      <div className="kb-doc is-paper">
        <MarkdownBody
          src={note.body}
          pages={lookup}
          onOpen={(t) => {
            const next = lookup.byTitle(t)
            if (next) setTrail((tr) => [...tr, next.id])
          }}
        />
      </div>
    </article>
  )
}

/**
 * Заметки, видимые этому участнику (для мастера — его кодекс).
 * Игроку — только те, чей текст ему открыт: при уровне «ограниченно» приходит один заголовок.
 */
function useArticleNotes(dmNotes?: ArticleNote[] | null): ArticleNote[] {
  const { data } = useRoom()
  const shared = data?.sharedNotes
  return useMemo(
    () => dmNotes ?? (shared ?? []).filter((n): n is typeof n & { body: string } => typeof n.body === 'string'),
    [dmNotes, shared],
  )
}

/**
 * Статьи в отдельных окнах. У мастера живёт внутри ширмы (там его кодекс),
 * у игрока — на сцене с общими заметками.
 */
export function ArticlePopouts({ dmNotes }: { dmNotes?: ArticleNote[] | null }) {
  const notes = useArticleNotes(dmNotes)
  const list = usePopouts().filter((e) => e.kind === 'article')
  return (
    <>
      {list.map((e) => (
        <PopOutWindow key={e.key} entry={e}>
          <div className="ar-window">
            <ArticleView noteId={e.id} notes={notes} />
          </div>
        </PopOutWindow>
      ))}
    </>
  )
}

/** Окно чтения статьи у игрока: по команде article.open (палитра, панель) */
export function ArticleReader() {
  const notes = useArticleNotes()
  const [open, setOpen] = useState<string | null>(null)
  useRoomCommand('article.open', (cmd) => setOpen(cmd.id))
  if (!open) return null
  const note = notes.find((n) => n.id === open)
  return (
    <div className="ar-layer" onPointerDown={(e) => e.target === e.currentTarget && setOpen(null)}>
      <div className="ar-dialog" role="dialog" aria-modal="true" aria-label={note?.title ?? 'Статья'}>
        <ArticleView
          key={open}
          noteId={open}
          notes={notes}
          actions={
            <span className="ar-actions">
              {note && (
                <PopOutButton
                  kind="article"
                  id={open}
                  title={note.title || 'Статья'}
                  compact
                  onOpened={() => setOpen(null)}
                  onReturn={() => emitRoomCommand({ type: 'article.open', id: open })}
                />
              )}
              <button type="button" className="po-btn" onClick={() => setOpen(null)} aria-label="Закрыть">
                <X aria-hidden="true" />
              </button>
            </span>
          }
        />
      </div>
    </div>
  )
}
