import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Feather, PenLine, X } from 'lucide-react'
import { ApiError, getCharacter, roomCharacterRef, updateCharacter } from '../../../api'
import type { SharedNote } from '../../../types/rooms'
import { canEditNote } from '../../perms/permissions'
import { patchSharedNote } from '../../roomsApi'
import { useRoom } from '../../RoomProvider'
import { Emerge, useEmergeClose, type Origin } from '../parts'
import { MarkdownBody } from '../../kb/Markdown'
import { parsePage } from '../../kb/mdparse'

/* ---------- личные заметки: карта в углу ---------- */

export function NotesMapOpen({ characterId, origin, onClose }: { characterId: string; origin: Origin; onClose: () => void }) {
  return (
    <Emerge origin={origin} kind="map" rotate={-16} label="Личные заметки" className="tb-mapopen" onClose={onClose}>
      <NotesPaper characterId={characterId} />
    </Emerge>
  )
}

type PageLookup = { has: (t: string) => boolean; body: (t: string) => string | null; titles: string[] }

/** Одна открытая страница: limited — только заголовок, owner — можно править */
function SharedNoteItem({ n, lookup, onOpen }: { n: SharedNote; lookup: PageLookup; onOpen: (title: string) => void }) {
  const { roomId } = useRoom()
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const icon = n.body != null ? parsePage(n.body).meta.icon : undefined
  const save = async () => {
    if (draft == null) return
    setBusy(true)
    setError(null)
    try {
      await patchSharedNote(roomId, n.id, { body: draft, revision: n.revision })
      setDraft(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'Страницу уже изменили: откройте её заново' : e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }
  return (
    <li id={`shared-${n.id}`}>
      <h3>
        {icon ? `${icon} ` : ''}
        {n.title || 'Без названия'}
        {canEditNote(n) && draft == null && (
          <button type="button" className="tb-linkbtn" onClick={() => setDraft(n.body ?? '')} title="Вы владелец страницы">
            <PenLine aria-hidden="true" /> править
          </button>
        )}
      </h3>
      {n.folder && <i>{n.folder}</i>}
      {draft != null ? (
        <div className="pm-note-edit">
          <textarea value={draft} aria-label={`Текст страницы «${n.title}»`} onChange={(e) => setDraft(e.target.value)} />
          <div>
            <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void save()}>
              <Check aria-hidden="true" /> Сохранить
            </button>
            <button type="button" className="tb-linkbtn" disabled={busy} onClick={() => setDraft(null)}>
              Отмена
            </button>
          </div>
          {error && <span className="tb-err">{error}</span>}
        </div>
      ) : n.body == null ? (
        <p className="tb-map-wait">Мастер открыл только заголовок</p>
      ) : (
        <div className="kb-doc is-paper">
          <MarkdownBody src={n.body} pages={lookup} onOpen={onOpen} />
        </div>
      )}
    </li>
  )
}

/** Заметки, которые мастер открыл партии: каждому по его уровню доступа */
function SharedNotesList() {
  const { data } = useRoom()
  const notes = [...(data?.sharedNotes ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order)
  if (notes.length === 0) return <p className="tb-map-wait">Мастер пока ничего не открыл</p>
  // ссылки ведут только на открытые партии страницы
  const find = (t: string) => notes.find((x) => x.title.toLowerCase() === t.toLowerCase())
  const lookup: PageLookup = { has: (t) => !!find(t), body: (t) => find(t)?.body ?? null, titles: notes.map((x) => x.title) }
  const open = (t: string) => document.getElementById(`shared-${find(t)?.id}`)?.scrollIntoView({ behavior: 'smooth' })
  return (
    <ul className="tb-shared">
      {notes.map((n) => (
        <SharedNoteItem key={n.id} n={n} lookup={lookup} onOpen={open} />
      ))}
    </ul>
  )
}

function NotesPaper({ characterId }: { characterId: string }) {
  const { roomId, data } = useRoom()
  const close = useEmergeClose()
  const shared = data?.sharedNotes.length ?? 0
  const [tab, setTab] = useState<'mine' | 'shared'>('mine')
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const ref = roomCharacterRef(roomId, characterId)

  useEffect(() => {
    let alive = true
    getCharacter(ref)
      .then((c) => alive && setText(c.notes ?? ''))
      .catch(() => {
        if (!alive) return
        setText('')
        setState('error')
      })
    return () => {
      alive = false
    }
  }, [ref])

  const save = useCallback(async () => {
    const value = pending.current
    if (value == null) return
    pending.current = null
    setState('saving')
    try {
      await updateCharacter(ref, { notes: value } as Parameters<typeof updateCharacter>[1])
      setState(pending.current == null ? 'saved' : 'saving')
    } catch {
      setState('error')
    }
  }, [ref])

  // при закрытии не теряем последние строчки
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void save()
    },
    [save],
  )

  return (
    <>
      <span className="tb-map-folds" aria-hidden="true" />
      <button type="button" className="tb-card-x" onClick={close} aria-label="Закрыть">
        <X aria-hidden="true" />
      </button>
      <div className="tb-map-paper">
        {shared > 0 ? (
          <div className="tb-map-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-on' : ''} onClick={() => setTab('mine')}>
              Мои заметки
            </button>
            <button type="button" role="tab" aria-selected={tab === 'shared'} className={tab === 'shared' ? 'is-on' : ''} onClick={() => setTab('shared')}>
              От мастера <em>{shared}</em>
            </button>
          </div>
        ) : (
          <h2>Мои заметки</h2>
        )}
        {tab === 'shared' && shared > 0 ? (
          <SharedNotesList />
        ) : text == null ? (
          <p className="tb-map-wait">Разворачиваем карту…</p>
        ) : (
          <textarea
            value={text}
            placeholder="Имена, долги, подозрения, клады. Эту карту видите только вы."
            aria-label="Личные заметки"
            autoFocus
            onChange={(e) => {
              setText(e.target.value)
              pending.current = e.target.value
              setState('idle')
              clearTimeout(timer.current)
              timer.current = setTimeout(() => void save(), 700)
            }}
          />
        )}
        <small className={`tb-map-state is-${state}`} role="status">
          {state === 'saving' ? (
            <>
              <Feather aria-hidden="true" /> записываем…
            </>
          ) : state === 'saved' ? (
            <>
              <Check aria-hidden="true" /> записано
            </>
          ) : state === 'error' ? (
            'не удалось записать: чернила размыло'
          ) : (
            ''
          )}
        </small>
      </div>
    </>
  )
}
