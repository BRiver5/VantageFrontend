/**
 * Показ мастера поверх экрана у всех: портрет с именем и репликой, крупный
 * текст рассказчика или картинка. Любой может закрыть у себя; мастер видит
 * кнопку «убрать у всех». Анимации гаснут при «уменьшить движение».
 */
import { useEffect, useReducer, useState } from 'react'
import { EyeOff, X } from 'lucide-react'
import { Img } from '../../media'
import { useKeybinding } from '../../input/useKeybinding'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { clearTheatre, getTheatre, initialTheatre, theatreReduce, visibleShow } from './model'

export function TheatreOverlay() {
  const { roomId, isDm } = useRoom()
  const [state, dispatch] = useReducer(theatreReduce, initialTheatre)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getTheatre(roomId).then(
      (r) => alive && dispatch({ type: 'loaded', show: r.show }),
      () => undefined, // старый сервер: показов просто нет
    )
    return () => {
      alive = false
    }
  }, [roomId])
  useRoomEvents((msg) => {
    if (msg.type === 'theatre.shown' || msg.type === 'theatre.cleared') dispatch({ type: 'event', msg })
  })

  const show = visibleShow(state)
  useKeybinding('dialog.close', () => dispatch({ type: 'dismiss' }), !!show)
  if (!show) return null

  const clearAll = () => {
    setError(null)
    clearTheatre(roomId).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось убрать'))
  }

  const controls = (
    <div className="th-controls">
      {isDm && (
        <button type="button" className="th-btn" onClick={clearAll} title="Убрать показ у всех">
          <EyeOff aria-hidden="true" /> <span>убрать у всех</span>
        </button>
      )}
      <button type="button" className="th-btn" onClick={() => dispatch({ type: 'dismiss' })} aria-label="Закрыть у себя" title="Закрыть у себя (Esc)">
        <X aria-hidden="true" />
      </button>
      {error && <em className="th-err">{error}</em>}
    </div>
  )

  return (
    <div key={show.id} className={`th-layer th-layer--${show.kind}`} role="dialog" aria-label={show.title || show.name || 'Сцена'} aria-live="polite">
      {show.kind === 'speech' && (
        <figure className="th-speech">
          {show.portrait && (
            <span className="th-portrait">
              <Img src={show.portrait} alt="" draggable={false} />
            </span>
          )}
          <figcaption>
            {show.name && <b className="th-name">{show.name}</b>}
            {show.text && <q className="th-line">{show.text}</q>}
          </figcaption>
        </figure>
      )}
      {show.kind === 'narration' && (
        <div className="th-narration">
          {show.title && <h2>{show.title}</h2>}
          <p>{show.text}</p>
        </div>
      )}
      {show.kind === 'image' && show.image && (
        <figure className="th-image">
          <Img src={show.image} alt={show.title ?? ''} draggable={false} />
          {show.title && <figcaption>{show.title}</figcaption>}
        </figure>
      )}
      {controls}
    </div>
  )
}
