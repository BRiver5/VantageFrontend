/** Маршруты слоёв карты: метки, звуки, рисунки */
import { request } from '../../api'
import type { DrawingInput, MapDrawing, MapLayersData, MapNote, MapSound } from './types'

const m = (roomId: string, mapId: string, path: string) => `/rooms/${roomId}/maps/${mapId}${path}`
const send = <T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => request<T>(path, { method, body, auth: true })

export const getLayers = (roomId: string, mapId: string) => request<MapLayersData>(m(roomId, mapId, '/layers'), { auth: true })

export type NoteInput = Partial<Pick<MapNote, 'x' | 'y' | 'label' | 'icon' | 'size' | 'tint' | 'always_visible' | 'page_id' | 'limited' | 'hidden'>>
export const createNote = (roomId: string, mapId: string, body: NoteInput) => send<MapNote>(m(roomId, mapId, '/notes'), 'POST', body)
export const patchNote = (roomId: string, mapId: string, id: string, body: NoteInput) => send<MapNote>(m(roomId, mapId, `/notes/${id}`), 'PATCH', body)
export const deleteNote = (roomId: string, mapId: string, id: string) => send<void>(m(roomId, mapId, `/notes/${id}`), 'DELETE')
/** где на картах отмечена страница (мастер) */
export async function notesOfPage(roomId: string, pageId: string) {
  const r = await request<{ items: { id: string; map_id: string; map_name: string; x: number; y: number }[] }>(`/rooms/${roomId}/map-notes?page_id=${encodeURIComponent(pageId)}`, { auth: true })
  return r?.items ?? []
}

export type SoundInput = Partial<Omit<MapSound, 'id' | 'map_id'>>
export const createSound = (roomId: string, mapId: string, body: SoundInput) => send<MapSound>(m(roomId, mapId, '/sounds'), 'POST', body)
export const patchSound = (roomId: string, mapId: string, id: string, body: SoundInput) => send<MapSound>(m(roomId, mapId, `/sounds/${id}`), 'PATCH', body)
export const deleteSound = (roomId: string, mapId: string, id: string) => send<void>(m(roomId, mapId, `/sounds/${id}`), 'DELETE')

export const createDrawing = (roomId: string, mapId: string, body: DrawingInput) => send<MapDrawing>(m(roomId, mapId, '/drawings'), 'POST', body)
export const patchDrawing = (roomId: string, mapId: string, id: string, body: Partial<MapDrawing>) => send<MapDrawing>(m(roomId, mapId, `/drawings/${id}`), 'PATCH', body)
export const deleteDrawing = (roomId: string, mapId: string, id: string) => send<void>(m(roomId, mapId, `/drawings/${id}`), 'DELETE')
export const clearDrawings = (roomId: string, mapId: string, scope: 'mine' | 'all') => send<{ removed: number }>(m(roomId, mapId, '/drawings/clear'), 'POST', { scope })
