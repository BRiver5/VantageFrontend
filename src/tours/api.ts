import { request } from '../api/http'
import type { UserMe } from '../types/auth'
import type { ProgressBackend } from './progress'

const path = (id: string) => `/auth/me/tours/${encodeURIComponent(id)}`

/** Прогресс туров в настройках пользователя (PUT/DELETE /auth/me/tours) */
export const serverProgress: ProgressBackend = {
  save: (id, body) => request<UserMe>(path(id), { method: 'PUT', body, auth: true }),
  reset: (id) => request<UserMe>(path(id), { method: 'DELETE', auth: true }),
  resetAll: () => request<UserMe>('/auth/me/tours', { method: 'DELETE', auth: true }),
}
