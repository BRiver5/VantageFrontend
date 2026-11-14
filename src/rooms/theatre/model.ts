/**
 * Сцена для всех (портрет с репликой, крупный текст, картинка): состояние у
 * клиента. Сервер помнит только текущий показ: GET /rooms/{id}/theatre при
 * входе, дальше события theatre.shown и theatre.cleared. Игрок может закрыть
 * показ у себя — до следующего показа мастера.
 */
import { request } from '../../api'
import type { RoomEventMessage } from '../../types/rooms'

export type TheatreKind = 'speech' | 'narration' | 'image'

export interface TheatreBody {
  kind: TheatreKind
  name?: string | null
  portrait?: string | null
  text?: string | null
  image?: string | null
  title?: string | null
  source_kind?: 'creature' | 'note' | 'custom' | null
  source_id?: string | null
}

export interface TheatreShow extends TheatreBody {
  id: string
  shown_at: string
  by: { user_id: string; label: string }
}

export interface TheatreState {
  show: TheatreShow | null
  /** id показа, который игрок закрыл у себя */
  dismissed: string | null
  /** события пришли раньше ответа GET: ответ уже устарел */
  live: boolean
}

export type TheatreAction =
  | { type: 'loaded'; show: TheatreShow | null }
  | { type: 'event'; msg: RoomEventMessage }
  | { type: 'dismiss' }

export const initialTheatre: TheatreState = { show: null, dismissed: null, live: false }

const isShow = (v: unknown): v is TheatreShow => {
  const o = v as Partial<TheatreShow> | null
  return !!o && typeof o.id === 'string' && (o.kind === 'speech' || o.kind === 'narration' || o.kind === 'image')
}

export function theatreReduce(state: TheatreState, action: TheatreAction): TheatreState {
  switch (action.type) {
    case 'loaded':
      if (state.live) return state
      return { ...state, show: isShow(action.show) ? action.show : null }
    case 'dismiss':
      return state.show ? { ...state, dismissed: state.show.id } : state
    case 'event': {
      const { msg } = action
      if (msg.type === 'theatre.shown') {
        const show = (msg.payload as { show?: unknown } | null)?.show
        return isShow(show) ? { show, dismissed: null, live: true } : state
      }
      if (msg.type === 'theatre.cleared') {
        const id = (msg.payload as { id?: unknown } | null)?.id
        if (state.show && id === state.show.id) return { show: null, dismissed: null, live: true }
        return { ...state, live: true }
      }
      return state
    }
  }
}

/** Что видно на экране сейчас */
export const visibleShow = (s: TheatreState): TheatreShow | null => (s.show && s.show.id !== s.dismissed ? s.show : null)

const path = (roomId: string) => `/rooms/${roomId}/theatre`

export const getTheatre = (roomId: string) => request<{ show: TheatreShow | null }>(path(roomId), { auth: true })
export const showTheatre = (roomId: string, body: TheatreBody) => request<{ show: TheatreShow }>(path(roomId), { method: 'POST', body, auth: true })
export const clearTheatre = (roomId: string) => request<{ id: string }>(path(roomId), { method: 'DELETE', auth: true })
