/**
 * «Контент всем»: мастер заранее раздаёт картинки (карта, портрет, письмо),
 * все скачивают их тихо и сообщают «готов», после чего мастер (или таймер)
 * одним событием показывает всем одно и то же в один момент.
 *
 * preload → клиент грузит файлы и шлёт client.ready → reveal → полноэкранный показ.
 * Мастер видит, сколько клиентов уже готовы (content.ready_status, без seq).
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, ImagePlus, Presentation, X } from 'lucide-react'
import { ApiError, uploadMedia } from '../api'
import type { RoomEventMessage } from '../types/rooms'
import { useRoom, useRoomEvents } from './RoomProvider'
import { preloadContent, revealContent } from './roomsApi'
import { Field } from './ui'
import { Img } from '../media'

interface Shown {
  id: string
  title: string
  urls: string[]
}

interface Prepared {
  id: string
  title: string
  urls: string[]
  ready: number
  expected: number
  revealed: boolean
}

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Ошибка сервера')

/** Скачать картинки в кэш браузера; ошибка или зависшая загрузка не держат остальных дольше PRELOAD_LIMIT_MS */
const PRELOAD_LIMIT_MS = 20000
function preloadImages(urls: string[]): Promise<void> {
  const limit = new Promise<void>((resolve) => setTimeout(resolve, PRELOAD_LIMIT_MS))
  return Promise.race([all(urls), limit])
}
function all(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = u
        }),
    ),
  ).then(() => undefined)
}

/** У всех участников: тихая загрузка и показ на весь экран */
export function ContentOverlay() {
  const { sendClientReady } = useRoom()
  const [shown, setShown] = useState<Shown | null>(null)
  const pending = useRef(new Map<string, { title: string; urls: string[]; loaded: Promise<void> }>())

  useRoomEvents((msg: RoomEventMessage) => {
    const p = (msg.payload ?? {}) as { content_id?: string; urls?: string[]; title?: string }
    if (msg.type === 'content.preload' && p.content_id && Array.isArray(p.urls)) {
      const id = p.content_id
      const loaded = preloadImages(p.urls).then(() => sendClientReady(id))
      pending.current.set(id, { title: p.title ?? '', urls: p.urls, loaded })
    } else if (msg.type === 'content.reveal' && p.content_id) {
      const item = pending.current.get(p.content_id)
      if (item) {
        pending.current.delete(p.content_id)
        setShown({ id: p.content_id, title: item.title, urls: item.urls })
      }
    }
  })

  if (!shown) return null
  // в body: у родителей страницы бывают transform/filter, из-за них fixed «приклеивается» не к окну
  return createPortal(
    <div className="rm-content" role="dialog" aria-modal="true" aria-label={shown.title || 'Показ мастера'} onClick={() => setShown(null)}>
      <button type="button" className="rm-content-close" aria-label="Закрыть" onClick={() => setShown(null)}>
        <X aria-hidden="true" />
      </button>
      {shown.title && <h2>{shown.title}</h2>}
      <div className={`rm-content-grid${shown.urls.length > 1 ? ' is-many' : ''}`} onClick={(e) => e.stopPropagation()}>
        {shown.urls.map((u) => (
          <Img key={u} src={u} alt={shown.title || 'Показ мастера'} />
        ))}
      </div>
    </div>,
    document.body,
  )
}

/** Мастер: подготовить и показать */
export function ContentPanel({ bare = false }: { bare?: boolean }) {
  const { roomId, data } = useRoom()
  const [urls, setUrls] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<Prepared | null>(null)
  const [url, setUrl] = useState('')
  const file = useRef<HTMLInputElement>(null)

  useRoomEvents((msg) => {
    const p = (msg.payload ?? {}) as { content_id?: string; ready?: number; expected?: number }
    if (msg.type === 'content.ready_status') setLast((l) => (l && l.id === p.content_id ? { ...l, ready: p.ready ?? l.ready, expected: p.expected ?? l.expected } : l))
    else if (msg.type === 'content.reveal') setLast((l) => (l && l.id === p.content_id ? { ...l, revealed: true } : l))
  })

  const closed = data?.room.status === 'closed'

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const done: string[] = []
      for (const f of Array.from(files).slice(0, 6)) done.push((await uploadMedia(f)).url)
      setUrls((u) => [...u, ...done].slice(0, 12))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const prepare = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await preloadContent(roomId, { urls, title: title.trim() || undefined, kind: 'image', auto_reveal: auto })
      setLast({ id: res.content_id, title, urls, ready: 0, expected: res.expected, revealed: false })
      setUrls([])
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const reveal = async () => {
    if (!last) return
    setBusy(true)
    setError(null)
    try {
      await revealContent(roomId, last.id)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={bare ? 'rm-content-panel' : 'rm-panel rm-content-panel'}>
      <h3 className="sc-subtitle">
        <Presentation aria-hidden="true" /> Показать картинку всем
      </h3>
      <p className="tb-hint">Сначала она тихо загрузится у каждого, а появится у всех одновременно.</p>
      <Field label="Название (покажется над картинкой)">
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="rm-content-pick">
        <button type="button" className="cs-btn" disabled={busy || closed} onClick={() => file.current?.click()}>
          <ImagePlus aria-hidden="true" /> Загрузить картинки
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" multiple hidden onChange={(e) => void upload(e.target.files)} />
        <span className="rm-content-url">
          <input value={url} placeholder="или ссылка на картинку" aria-label="Ссылка на картинку" onChange={(e) => setUrl(e.target.value)} />
          <button
            type="button"
            className="cw-mini-btn"
            disabled={!/^https?:\/\//.test(url.trim())}
            onClick={() => {
              setUrls((u) => [...u, url.trim()].slice(0, 12))
              setUrl('')
            }}
          >
            добавить
          </button>
        </span>
      </div>
      {urls.length > 0 && (
        <ul className="rm-content-thumbs">
          {urls.map((u) => (
            <li key={u}>
              <Img src={u} alt="" />
              <button type="button" aria-label="Убрать" onClick={() => setUrls((l) => l.filter((x) => x !== u))}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="rm-check">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span>Показать само, когда все загрузят (или через 30 секунд)</span>
      </label>
      <div className="rm-content-acts">
        <button type="button" className="cs-btn cw-next" disabled={busy || closed || urls.length === 0} onClick={() => void prepare()}>
          <Presentation aria-hidden="true" /> Подготовить
        </button>
      </div>
      {last && (
        <div className="rm-content-status" role="status">
          <b>{last.title || 'Без названия'}</b>
          <span>
            {last.revealed ? 'Показано всем' : `Готовы: ${last.ready} из ${last.expected}`}
          </span>
          {!last.revealed && (
            <button type="button" className="cs-btn" disabled={busy || closed} onClick={() => void reveal()}>
              <Eye aria-hidden="true" /> Показать всем
            </button>
          )}
        </div>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}

/** Быстрый показ одной картинки (карта и т. п.): подготовить и сразу показать, когда все готовы */
export async function showToAll(roomId: string, url: string, title: string): Promise<void> {
  await preloadContent(roomId, { urls: [url], title, kind: 'image', auto_reveal: true })
}
