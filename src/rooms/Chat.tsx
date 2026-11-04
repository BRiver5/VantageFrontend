/**
 * Чат комнаты. Реплики от лица героя (IC) и вне игры (OOC), шёпот, действия
 * через /me. Команды /r, /gmroll, /w, /me, /ooc разбирает сервер: клиент только
 * отправляет текст, а показывает то, что пришло событием chat.message.
 * Текст всегда выводится как текст, не как HTML.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Feather, Ghost, MessageCircle, Send, Theater } from 'lucide-react'
import { ApiError } from '../api'
import type { ChatMessage } from '../types/rooms'
import { chatOf } from './applyEvent'
import { useRoom } from './RoomProvider'
import { listEventsOfType, sendChat } from './roomsApi'

const COMMANDS: { cmd: string; hint: string }[] = [
  { cmd: '/r ', hint: '/r 1d20+5 Атака — открытый бросок' },
  { cmd: '/gmroll ', hint: '/gmroll 1d20 — увидите вы и мастер' },
  { cmd: '/w ', hint: '/w ник текст — шёпот' },
  { cmd: '/me ', hint: '/me кивает — действие героя' },
  { cmd: '/ooc ', hint: '/ooc текст — вне игры' },
]

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '')

const errText = (e: unknown, text: string) => {
  if (e instanceof ApiError) {
    if (e.status === 404) return text.startsWith('/w ') ? 'Не нашли, кому шептать: проверьте ник' : 'Чат пока недоступен на сервере'
    if (e.status === 409) return 'Комната закрыта: писать нельзя'
    if (e.status === 422) return e.message
  }
  return e instanceof Error ? e.message : 'Не отправилось'
}

/** Непрочитанное: сколько сообщений пришло после последнего открытия чата */
export function useChatUnread(open: boolean): number {
  const { data, roomId } = useRoom()
  const key = `vantage-chat-seen:${roomId}`
  const [seen, setSeen] = useState<number>(() => Number(sessionStorage.getItem(key) ?? 0))
  const chat = data?.chat ?? []
  const mine = data?.me.user_id
  const last = chat.length ? (chat[chat.length - 1].seq ?? 0) : 0
  useEffect(() => {
    if (!open || last <= seen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(last)
    sessionStorage.setItem(key, String(last))
  }, [open, last, seen, key])
  if (open) return 0
  return chat.filter((m) => (m.seq ?? 0) > seen && m.from_user_id !== mine).length
}

function Line({ m }: { m: ChatMessage }) {
  const { data } = useRoom()
  const hero = m.character_id ? data?.characters.find((c) => c.id === m.character_id) : undefined
  const member = (id?: string | null) => data?.members.find((x) => x.user_id === id)
  const userName = (id?: string | null) => {
    const x = member(id)
    return x?.display_name || x?.nickname || (x?.role === 'dm' ? 'Мастер' : '')
  }
  const from = m.channel === 'ic' || m.channel === 'emote' ? hero?.name || m.from_label || userName(m.from_user_id) : userName(m.from_user_id) || m.from_label || ''
  const mine = m.from_user_id && m.from_user_id === data?.me.user_id
  const whisperTo = m.to_user_id ? userName(m.to_user_id) : ''
  return (
    <li className={`ch-line is-${m.channel}${mine ? ' is-mine' : ''}`}>
      {m.channel === 'emote' ? (
        <p>
          <i>
            {from} {m.text}
          </i>
        </p>
      ) : (
        <>
          <header>
            <b>{from || '—'}</b>
            {m.channel === 'ooc' && <em>вне игры</em>}
            {m.channel === 'whisper' && <em>{mine ? `шёпот → ${whisperTo}` : 'шепчет вам'}</em>}
            <time>{time(m.ts)}</time>
          </header>
          <p>{m.text}</p>
        </>
      )}
    </li>
  )
}

export function ChatPanel() {
  const { data, roomId, isDm } = useRoom()
  const [text, setText] = useState('')
  const [channel, setChannel] = useState<'ic' | 'ooc'>('ic')
  const [as, setAs] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [olderDone, setOlderDone] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const stick = useRef(true)
  const chat = useMemo(() => {
    const known = new Set((data?.chat ?? []).map((m) => m.id))
    return [...older.filter((m) => !known.has(m.id)), ...(data?.chat ?? [])]
  }, [older, data?.chat])
  const mine = data?.me.room_character_id ?? null
  const closed = data?.room.status === 'closed'

  // новое сообщение — прокрутить вниз, если и так были внизу
  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat.length])

  const loadOlder = async () => {
    const first = chat.find((m) => m.seq != null)
    if (!first?.seq) return
    setLoadingOlder(true)
    try {
      const items = await listEventsOfType(roomId, ['chat.message'], { limit: 50, beforeSeq: first.seq })
      const msgs = items.map(chatOf).filter((m): m is ChatMessage => !!m)
      if (msgs.length < 50) setOlderDone(true)
      stick.current = false
      setOlder((o) => [...msgs.filter((m) => !o.some((x) => x.id === m.id)), ...o])
    } catch {
      setOlderDone(true)
    } finally {
      setLoadingOlder(false)
    }
  }

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendChat(roomId, { text: t, channel, character_id: channel === 'ic' ? (isDm ? as : mine) : null })
      setText('')
      stick.current = true
    } catch (e) {
      setError(errText(e, t))
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const slash = text.startsWith('/') && !text.includes(' ', text.startsWith('/w ') ? 3 : 1)
  const whisperNames = text.startsWith('/w ') && !/^\/w \S+ /.test(text)
    ? (data?.members ?? []).filter((m) => m.status === 'approved' && m.user_id !== data?.me.user_id && m.nickname).filter((m) => m.nickname!.toLowerCase().startsWith(text.slice(3).toLowerCase()))
    : []

  return (
    <div className="ch-panel">
      <ol
        className="ch-list"
        ref={list}
        aria-live="polite"
        aria-label="Сообщения"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {!olderDone && chat.some((m) => m.seq != null) && (
          <li className="ch-older">
            <button type="button" className="tb-linkbtn" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? 'листаем…' : 'раньше'}
            </button>
          </li>
        )}
        {chat.length === 0 && (
          <li className="ch-empty">
            <MessageCircle aria-hidden="true" /> Пока тихо
          </li>
        )}
        {chat.map((m) => (
          <Line key={m.id} m={m} />
        ))}
      </ol>
      <footer className="ch-compose">
        {(slash || whisperNames.length > 0) && (
          <ul className="ch-hints" role="listbox" aria-label="Подсказки">
            {whisperNames.length > 0
              ? whisperNames.map((m) => (
                  <li key={m.user_id}>
                    <button type="button" onClick={() => setText(`/w ${m.nickname} `)}>
                      <Ghost aria-hidden="true" /> {m.nickname} <i>{m.display_name}</i>
                    </button>
                  </li>
                ))
              : COMMANDS.filter((c) => c.cmd.startsWith(text) || text === '/').map((c) => (
                  <li key={c.cmd}>
                    <button type="button" onClick={() => setText(c.cmd)}>
                      {c.hint}
                    </button>
                  </li>
                ))}
          </ul>
        )}
        <div className="ch-modes">
          <div className="ch-channel" role="radiogroup" aria-label="Как говорить">
            <button type="button" role="radio" aria-checked={channel === 'ic'} className={channel === 'ic' ? 'is-on' : ''} onClick={() => setChannel('ic')} title="От лица героя">
              <Theater aria-hidden="true" /> в игре
            </button>
            <button type="button" role="radio" aria-checked={channel === 'ooc'} className={channel === 'ooc' ? 'is-on' : ''} onClick={() => setChannel('ooc')} title="Вне игры">
              <Feather aria-hidden="true" /> вне игры
            </button>
          </div>
          {isDm && channel === 'ic' && (
            <select className="ch-as" value={as ?? ''} onChange={(e) => setAs(e.target.value || null)} aria-label="От чьего лица">
              <option value="">от мастера</option>
              {(data?.characters ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="ch-input">
          <textarea
            value={text}
            rows={1}
            maxLength={2000}
            disabled={closed}
            placeholder={closed ? 'Комната закрыта' : 'Сообщение… /r 1d20, /w ник, /me'}
            aria-label="Сообщение"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button type="button" className="ch-send" disabled={busy || !text.trim() || closed} onClick={() => void send()} aria-label="Отправить">
            <Send aria-hidden="true" />
          </button>
        </div>
        {error && <p className="tb-err">{error}</p>}
      </footer>
    </div>
  )
}
