/**
 * Оценки и комментарии каталога (vantageserver/docs/REVIEWS_FRONTEND.md).
 * Механизм общий: раздел + id записи. Читать могут все, писать — вошедшие.
 * Событий нет: после своего действия перечитываем или берём данные из ответа.
 */
import { request } from '../api'

export type ReviewEntity = 'items' | 'equipment' | 'spells' | 'creatures' | 'feats' | 'backgrounds' | 'races' | 'subraces' | 'classes' | 'subclasses'

export interface RatingSummary {
  average: number | null
  count: number
  histogram: Record<'1' | '2' | '3' | '4' | '5', number>
  mine: number | null
}

export interface ReviewUser {
  id: string
  nickname: string | null
  display_name: string
  avatar_url: string | null
}

export interface ReviewComment {
  id: string
  entity: string
  entity_id: string
  reply_to: string | null
  text: string
  created_at: string
  edited_at: string | null
  user: ReviewUser
  rating: number | null
  likes: number
  liked_by_me: boolean
  is_mine: boolean
  deleted: boolean
  hidden?: boolean
  replies?: ReviewComment[]
  replies_total?: number
}

export interface Reviews {
  summary: RatingSummary
  total: number
  items: ReviewComment[]
}

/** Краткий рейтинг у записи каталога (списки и деталь) */
export type ShortRating = { average: number | null; count: number }

const base = (e: ReviewEntity, id: string) => `/${e}/${encodeURIComponent(id)}`

export const getReviews = (e: ReviewEntity, id: string, q: { sort?: 'new' | 'top'; skip?: number; limit?: number; reply_to?: string } = {}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v))
  return request<Reviews>(`${base(e, id)}/reviews?${p}`, { auth: 'optional' })
}
export const rate = (e: ReviewEntity, id: string, value: number) => request<RatingSummary>(`${base(e, id)}/rating`, { method: 'PUT', body: { value }, auth: true })
export const unrate = (e: ReviewEntity, id: string) => request<RatingSummary>(`${base(e, id)}/rating`, { method: 'DELETE', auth: true })
export const postComment = (e: ReviewEntity, id: string, text: string, replyTo?: string | null) =>
  request<ReviewComment>(`${base(e, id)}/comments`, { method: 'POST', body: { text, ...(replyTo ? { reply_to: replyTo } : {}) }, auth: true })
export const editComment = (cid: string, text: string) => request<ReviewComment>(`/comments/${cid}`, { method: 'PATCH', body: { text }, auth: true })
export const deleteComment = (cid: string) => request<void>(`/comments/${cid}`, { method: 'DELETE', auth: true })
export const likeComment = (cid: string) => request<{ id: string; likes: number; liked_by_me: boolean }>(`/comments/${cid}/like`, { method: 'POST', auth: true })
export const reportComment = (cid: string, reason: string) => request<unknown>(`/comments/${cid}/report`, { method: 'POST', body: { reason }, auth: true })

/* ---------- модерация ---------- */

export interface ReportsPage {
  total: number
  skip: number
  limit: number
  items: { comment: ReviewComment & { hidden: boolean }; count: number; reports: { user: ReviewUser; reason: string; created_at: string }[] }[]
}
export const getReports = (q: { resolved?: boolean; skip?: number; limit?: number } = {}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v))
  return request<ReportsPage>(`/admin/reports?${p}`, { auth: true })
}
export const hideComment = (cid: string, hidden: boolean) => request<ReviewComment>(`/comments/${cid}/hide`, { method: 'POST', body: { hidden }, auth: true })

/** Байесовское среднее, как у сервера: одна пятёрка не обгоняет двадцать четвёрок */
export const bayes = (r: ShortRating | null | undefined) => (5 * 3 + (r?.average ?? 0) * (r?.count ?? 0)) / (5 + (r?.count ?? 0))

/** Куда ведёт запись раздела (ссылка из модерации) */
export const entityHref = (e: string, id: string) =>
  ({ items: `/items?open=${id}`, creatures: `/bestiary/${id}`, classes: `/classes/${id}` } as Record<string, string>)[e] ?? `/${e}/${id}`
