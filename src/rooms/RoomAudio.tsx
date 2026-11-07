/**
 * Звук комнаты. Плеер у всех: трек, позиция и громкость — от сервера,
 * позиция = position_sec + (сейчас − started_at), часы сверяем по
 * server_time. Смена трека — плавная. Браузер не даёт играть без жеста:
 * тогда показываем кнопку «Включить звук». Саундборд — эфемерный audio.sfx.
 *
 * Пульт мастера (виджет дашборда «Звуки»): музыка из библиотеки, пауза,
 * громкость, кнопки саундборда.
 */
import { useEffect, useRef, useState } from 'react'
import { Music2, Pause, Play, Plus, Search, Square, Trash2, Volume2, VolumeX, Zap } from 'lucide-react'
import { searchAssets, assetTitle, type Asset } from '../maps/assets'
import type { RoomAudioState } from '../types/rooms'
import { useRoom, useRoomEvents } from './RoomProvider'
import { audioControl, getAudio, playAudio, playSfx, putPads } from './roomsApi'

const LOCAL_KEY = 'vantage-room-volume'
const readLocal = () => {
  try {
    const v = Number(localStorage.getItem(LOCAL_KEY))
    return Number.isFinite(v) && localStorage.getItem(LOCAL_KEY) !== null ? v : 0.8
  } catch {
    return 0.8
  }
}

/** Плеер: невидим, пока всё играет; кнопка — если браузер не дал звук */
export function RoomAudioPlayer() {
  const { data, roomId } = useRoom()
  const state = data?.room.audio
  const offset = useRef(0) // серверное время − местное, мс
  const cur = useRef<{ el: HTMLAudioElement; url: string } | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [local, setLocal] = useState(readLocal)
  const [open, setOpen] = useState(false)

  // сверка часов: при входе
  useEffect(() => {
    const t0 = Date.now()
    getAudio(roomId).then(
      (a) => {
        if (a.server_time) offset.current = Date.parse(a.server_time) - (t0 + Date.now()) / 2
      },
      () => undefined,
    )
  }, [roomId])

  useRoomEvents((msg) => {
    const p = msg.payload as { server_time?: string; url?: string; volume?: number }
    if (msg.type.startsWith('audio.') && p.server_time && (!msg.ts || Date.now() - Date.parse(msg.ts) < 5000)) offset.current = Date.parse(p.server_time) - Date.now()
    if (msg.type === 'audio.sfx' && p.url) {
      const a = new Audio(p.url)
      a.volume = Math.max(0, Math.min(1, (p.volume ?? 1) * local))
      a.play().catch(() => setBlocked(true))
    }
  })

  // применить состояние
  useEffect(() => {
    const track = state?.tracks.find((t) => t.id === state.track_id)
    const want = state?.playing && track ? track : null
    const vol = Math.max(0, Math.min(1, (state?.volume ?? 1) * local))
    const pos = () => {
      if (!state) return 0
      const base = state.position_sec ?? 0
      return state.started_at ? base + (Date.now() + offset.current - Date.parse(state.started_at + (state.started_at.endsWith('Z') ? '' : 'Z'))) / 1000 : base
    }
    const c = cur.current
    if (!want) {
      if (c) fade(c.el, 0, 600, true)
      cur.current = null
      return
    }
    if (c && c.url === want.url) {
      c.el.loop = want.loop
      fade(c.el, vol, 300)
      const p = pos()
      // заметно разошлись — подтянуть
      if (c.el.duration && Math.abs(wrap(p, c.el.duration, want.loop) - c.el.currentTime) > 1.5) c.el.currentTime = wrap(p, c.el.duration, want.loop)
      if (c.el.paused) c.el.play().catch(() => setBlocked(true))
      return
    }
    // новый трек: старый гасим, новый разгоняем
    if (c) fade(c.el, 0, 2000, true)
    const el = new Audio(want.url)
    el.loop = want.loop
    el.volume = 0
    el.preload = 'auto'
    el.addEventListener('loadedmetadata', () => {
      el.currentTime = wrap(pos(), el.duration || 0, want.loop)
    })
    cur.current = { el, url: want.url }
    el.play().then(
      () => {
        setBlocked(false)
        fade(el, vol, 2000)
      },
      () => setBlocked(true),
    )
  }, [state, local])

  useEffect(
    () => () => {
      cur.current?.el.pause()
      cur.current = null
    },
    [],
  )

  const playing = !!state?.playing && !!state.track_id
  if (!playing && !blocked) return null
  const track = state?.tracks.find((t) => t.id === state.track_id)
  return (
    <div className={`ra-player${open ? ' is-open' : ''}`}>
      {blocked ? (
        <button
          type="button"
          className="ra-unlock"
          onClick={() => {
            setBlocked(false)
            cur.current?.el.play().then(
              () => fade(cur.current!.el, Math.max(0, Math.min(1, (state?.volume ?? 1) * local)), 800),
              () => setBlocked(true),
            )
          }}
        >
          <Volume2 aria-hidden="true" /> Включить звук
        </button>
      ) : (
        <>
          <button type="button" className="ra-note" onClick={() => setOpen((v) => !v)} aria-label={`Музыка: ${track?.name ?? ''}. Громкость`} aria-expanded={open}>
            {local === 0 ? <VolumeX aria-hidden="true" /> : <Music2 aria-hidden="true" />}
          </button>
          {open && (
            <span className="ra-pop">
              <i>{track?.name}</i>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={local}
                aria-label="Громкость у меня"
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setLocal(v)
                  try {
                    localStorage.setItem(LOCAL_KEY, String(v))
                  } catch {
                    /* приватный режим */
                  }
                }}
              />
            </span>
          )}
        </>
      )}
    </div>
  )
}

const wrap = (p: number, dur: number, loop: boolean) => (!dur ? Math.max(0, p) : loop ? ((p % dur) + dur) % dur : Math.min(Math.max(0, p), dur - 0.05))

function fade(el: HTMLAudioElement, to: number, ms: number, stop = false) {
  const from = el.volume
  const t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k))
    if (k < 1) requestAnimationFrame(step)
    else if (stop) el.pause()
  }
  requestAnimationFrame(step)
}

/* ---------- пульт мастера ---------- */

export function SoundboardPanel() {
  const { data, roomId } = useRoom()
  const a: RoomAudioState | undefined = data?.room.audio
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'music' | 'ambience' | 'sfx'>('music')
  const [found, setFound] = useState<Asset[]>([])
  const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [editPads, setEditPads] = useState(false)

  useEffect(() => {
    let on = true
    const t = setTimeout(() => {
      searchAssets({ kind, q: q.trim(), limit: 12 }).then(
        (r) => on && setFound(r.items),
        () => on && setFound([]),
      )
    }, 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q, kind])

  if (!a) return null
  const run = (fn: () => Promise<unknown>) => {
    setErr(null)
    fn().catch((e) => setErr(e instanceof Error ? e.message : 'Не получилось'))
  }
  const track = a.tracks.find((t) => t.id === a.track_id)
  const addPad = (pad: { label?: string; asset_id?: string; url?: string }) => run(() => putPads(roomId, [...a.pads.map((p) => ({ id: p.id, label: p.label, url: p.url, icon: p.icon })), pad]))

  return (
    <div className="ra-board">
      <div className="ra-now">
        <Music2 aria-hidden="true" />
        <b>{track ? track.name : 'Тишина'}</b>
        {track && (
          <>
            <button type="button" className="sc-iconbtn" onClick={() => run(() => audioControl(roomId, { action: a.playing ? 'pause' : 'resume' }))} aria-label={a.playing ? 'Пауза' : 'Продолжить'}>
              {a.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <button type="button" className="sc-iconbtn" onClick={() => run(() => audioControl(roomId, { action: 'stop' }))} aria-label="Стоп">
              <Square aria-hidden="true" />
            </button>
          </>
        )}
        <input type="range" min={0} max={1} step={0.05} defaultValue={a.volume} aria-label="Громкость для всех" onPointerUp={(e) => run(() => audioControl(roomId, { action: 'volume', volume: Number((e.target as HTMLInputElement).value) }))} onKeyUp={(e) => run(() => audioControl(roomId, { action: 'volume', volume: Number((e.target as HTMLInputElement).value) }))} />
      </div>

      {a.tracks.length > 1 && (
        <ul className="ra-tracks">
          {a.tracks.map((t) => (
            <li key={t.id}>
              <button type="button" className={t.id === a.track_id ? 'is-on' : ''} onClick={() => run(() => playAudio(roomId, { url: t.url, loop: t.loop }))}>
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="ra-pads">
        {a.pads.map((p) => (
          <span key={p.id} className="ra-pad">
            <button type="button" onClick={() => run(() => playSfx(roomId, { pad_id: p.id }))}>
              <Zap aria-hidden="true" /> {p.label}
            </button>
            {editPads && (
              <button type="button" className="ra-pad-x" onClick={() => run(() => putPads(roomId, a.pads.filter((x) => x.id !== p.id).map((x) => ({ id: x.id, label: x.label, url: x.url, icon: x.icon }))))} aria-label={`Убрать ${p.label}`}>
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {a.pads.length > 0 && (
          <button type="button" className="tb-linkbtn" onClick={() => setEditPads((v) => !v)}>
            {editPads ? 'готово' : 'править'}
          </button>
        )}
      </div>

      <div className="ra-find">
        <nav>
          {(
            [
              ['music', 'Музыка'],
              ['ambience', 'Фон'],
              ['sfx', 'Звуки'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
          <label>
            <Search aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="таверна, бой, дождь" aria-label="Поиск звука" />
          </label>
        </nav>
        <ul>
          {found.map((x) => (
            <li key={x.id}>
              <span>{assetTitle(x)}</span>
              {kind === 'sfx' ? (
                <>
                  <button type="button" className="sc-iconbtn" onClick={() => run(() => playSfx(roomId, { asset_id: x.id }))} aria-label="Проиграть всем">
                    <Play aria-hidden="true" />
                  </button>
                  <button type="button" className="sc-iconbtn" onClick={() => addPad({ asset_id: x.id, label: assetTitle(x) })} aria-label="В саундборд">
                    <Plus aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button type="button" className="sc-iconbtn" onClick={() => run(() => playAudio(roomId, { asset_id: x.id, loop: true, crossfade_sec: 2 }))} aria-label="Включить всем">
                  <Play aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
          {found.length === 0 && <li className="tb-hint">В библиотеке пока нет звуков этого вида — можно дать ссылку.</li>}
        </ul>
        <form
          className="ra-url"
          onSubmit={(e) => {
            e.preventDefault()
            const u = url.trim()
            if (!/^https?:\/\//.test(u)) return setErr('Нужна ссылка на файл: https://…mp3')
            if (kind === 'sfx') addPad({ url: u })
            else run(() => playAudio(roomId, { url: u, loop: true, crossfade_sec: 2 }))
            setUrl('')
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="или ссылка на mp3 / ogg" aria-label="Ссылка на звук" />
          <button type="submit" className="sc-iconbtn" aria-label={kind === 'sfx' ? 'Добавить кнопку' : 'Включить'}>
            {kind === 'sfx' ? <Plus aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
        </form>
      </div>
      {err && <p className="tb-err">{err}</p>}
    </div>
  )
}
