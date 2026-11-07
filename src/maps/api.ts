/** Маршруты боевых карт комнаты */
import { request } from '../api'
import type { AimRequest, BattleMap, EditBatch, MovePreview, MoveResult } from './types'

const r = (id: string, path = '') => `/rooms/${id}/maps${path}`
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: true })

export async function listMaps(roomId: string): Promise<BattleMap[]> {
  const res = await request<{ items: BattleMap[] } | BattleMap[]>(r(roomId), { auth: true })
  return Array.isArray(res) ? res : (res?.items ?? [])
}
export const getMap = (roomId: string, mapId: string) => request<BattleMap>(r(roomId, `/${mapId}`), { auth: true })
export const createMap = (roomId: string, body: Partial<BattleMap>) => post<BattleMap>(r(roomId), body)
export const patchMap = (roomId: string, mapId: string, body: Partial<BattleMap>) =>
  request<BattleMap>(r(roomId, `/${mapId}`), { method: 'PATCH', body, auth: true })
export const deleteMap = (roomId: string, mapId: string) => request<void>(r(roomId, `/${mapId}`), { method: 'DELETE', auth: true })
/** Пакет конструктора: всё или ничего; 409 — карту изменили */
export const editMap = (roomId: string, mapId: string, batch: EditBatch) => post<BattleMap>(r(roomId, `/${mapId}/edit`), batch)
/** Положить на стол: показать игрокам, создать токены героев и участников боя */
export const activateMap = (roomId: string, mapId: string) => post<BattleMap>(r(roomId, `/${mapId}/activate`))

export const movePreview = (roomId: string, mapId: string, tokenId: string, mode: 'walk' | 'fly' = 'walk') =>
  post<MovePreview>(r(roomId, `/${mapId}/tokens/${tokenId}/move/preview`), { mode })
export const moveToken = (roomId: string, mapId: string, tokenId: string, body: { to?: { x: number; y: number }; path?: [number, number][]; mode?: 'walk' | 'fly' | 'teleport'; elevation_ft?: number }) =>
  post<MoveResult>(r(roomId, `/${mapId}/tokens/${tokenId}/move`), { mode: 'walk', ...body })
export const patchToken = (roomId: string, mapId: string, tokenId: string, body: Record<string, unknown>) =>
  request<unknown>(r(roomId, `/${mapId}/tokens/${tokenId}`), { method: 'PATCH', body, auth: true })
export const tokenVision = (roomId: string, mapId: string, tokenId: string) =>
  request<{ senses: Record<string, number>; modes: string[]; current: string; light_here: string; ambient: string }>(r(roomId, `/${mapId}/tokens/${tokenId}/vision`), { auth: true })
export const doorAction = (roomId: string, mapId: string, wallId: string, action: 'open' | 'close' | 'pick' | 'force' | 'lock' | 'unlock', tokenId?: string) =>
  post<{ open: boolean; locked: boolean; success?: boolean; roll?: unknown; dc?: number }>(r(roomId, `/${mapId}/doors/${wallId}`), { action, ...(tokenId ? { token_id: tokenId } : {}) })
/** Линейка и шаблон мастера: фигура, клетки и токены под ней */
export const areaProbe = (roomId: string, mapId: string, q: { shape: string; x: number; y: number; size_ft: number; angle_deg?: number; width_ft?: number }) => {
  const p = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))
  return post<{ polygon: [number, number][]; cells: [number, number][]; tokens: string[] }>(`${r(roomId, `/${mapId}/area`)}?${p}`)
}

export type { AimRequest }
