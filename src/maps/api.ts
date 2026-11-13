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
/** Новая карта из Universal VTT (.dd2vtt, .uvtt): картинка, сетка, стены, двери, свет */
export function importUvtt(roomId: string, file: File, name?: string) {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  return post<BattleMap>(r(roomId, '/import-uvtt'), form)
}
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

/** Мастер: запустить триггер вручную (token_id — субъект) */
export const fireTrigger = (roomId: string, mapId: string, triggerId: string, tokenId?: string) =>
  post<{ log?: unknown[] }>(r(roomId, `/${mapId}/triggers/${triggerId}/fire${tokenId ? `?token_id=${tokenId}` : ''}`))

/* ---------- предметы на карте ---------- */

export const pickUp = (roomId: string, mapId: string, mapItemId: string, tokenId: string) =>
  post<{ map_item_id: string; carried_by?: string; character_id?: string; name?: string }>(r(roomId, `/${mapId}/items/${mapItemId}/pick-up`), { token_id: tokenId })
export const dropItem = (roomId: string, mapId: string, body: { token_id: string; instance_id?: string; map_item_id?: string; quantity?: number; x?: number; y?: number }) =>
  post<unknown>(r(roomId, `/${mapId}/items/drop`), body)
export const handTo = (roomId: string, mapId: string, body: { token_id: string; to_token_id: string; instance_id?: string; map_item_id?: string; quantity?: number }) =>
  post<{ name: string }>(r(roomId, `/${mapId}/items/hand-to`), body)
export const reachableItems = (roomId: string, mapId: string, tokenId: string) =>
  request<{ items: { map_item_id: string; name: string; x: number; y: number; distance_ft: number }[]; carried: { map_item_id: string; name: string }[] }>(r(roomId, `/${mapId}/tokens/${tokenId}/reachable-items`), { auth: true })

/* ---------- мои существа ---------- */

export interface MyUnit {
  token_id: string
  label: string
  x: number
  y: number
  elevation_ft: number
  vision_mode: string
  combatant_id?: string | null
  kind?: 'character' | 'summon' | 'creature'
  spell?: string | null
  speed: { walk: number; fly: number }
  economy?: { action_used: boolean; bonus_used: boolean; reaction_used: boolean; movement_used: number }
  my_turn?: boolean
  hp?: { current: number; max: number }
  ac?: number
  actions?: { name: string; desc?: string; description?: string }[]
  senses?: Record<string, number>
  reach_items: string[]
  carried: string[]
}
export const myUnits = (roomId: string) => request<{ map_id: string | null; units: MyUnit[] }>(`/rooms/${roomId}/my-units`, { auth: true })

/* ---------- сцены ---------- */

export interface ScenePresetSummary {
  id: string
  title: string
  description: string
  tags: string[]
  cover_asset_id?: string | null
  level_range?: [number, number] | null
  visibility: 'official' | 'public' | 'private'
  encounters: number
  loot: number
  author?: string | null
}
export async function listScenes(q?: string): Promise<ScenePresetSummary[]> {
  const res = await request<{ items: ScenePresetSummary[] }>(`/scene-presets${q ? `?q=${encodeURIComponent(q)}` : ''}`, { auth: true })
  return res?.items ?? []
}
export const loadScene = (roomId: string, presetId: string, activate = true) => post<BattleMap>(`/rooms/${roomId}/scenes/load`, { preset_id: presetId, activate })
export const saveAsScene = (roomId: string, mapId: string, title: string) => post<ScenePresetSummary>(r(roomId, `/${mapId}/save-as-preset?title=${encodeURIComponent(title)}`))
export const deleteScene = (id: string) => request<void>(`/scene-presets/${id}`, { method: 'DELETE', auth: true })

/** Действие на объекте карты: проверка и сценарий объекта */
export const interactObject = (roomId: string, mapId: string, objectId: string, interactionId: string, tokenId?: string) =>
  post<{ object_id: string; interaction_id: string; success: boolean; dc?: number; roll?: unknown; log?: unknown[] }>(r(roomId, `/${mapId}/objects/${objectId}/interact`), { interaction_id: interactionId, ...(tokenId ? { token_id: tokenId } : {}) })
