/** Предпросмотр маршрута через точки: цена, можно ли и кто ударит атакой по возможности */
import { request } from '../../api'
import type { MoveResult } from '../types'

export type MoveMode = 'walk' | 'fly' | 'climb_speed' | 'teleport'

export interface Provoke {
  token_id: string
  combatant_id: string | null
  name: string
  at_cell: [number, number]
  step: number
  /** досягаемость врага, по которой считали (фт) */
  reach_ft?: number
}

export interface RoutePreview {
  path: [number, number][]
  cost: number | null
  valid: boolean
  reason?: string
  budget: number
  elevation_ft?: number
  provokes: Provoke[]
}

export interface RouteBody {
  waypoints?: [number, number][]
  path?: [number, number][]
  mode?: MoveMode
  elevation_ft?: number
}

const base = (roomId: string, mapId: string, tokenId: string) => `/rooms/${roomId}/maps/${mapId}/tokens/${tokenId}/move`

export const previewRoute = (roomId: string, mapId: string, tokenId: string, body: RouteBody) =>
  request<{ speed: number; budget: number; route?: RoutePreview }>(`${base(roomId, mapId, tokenId)}/preview`, { method: 'POST', body: { mode: 'walk', ...body, cells: false }, auth: true })

/** Ход ровно по клеткам маршрута */
export const moveAlong = (roomId: string, mapId: string, tokenId: string, body: { path: [number, number][]; mode?: MoveMode; elevation_ft?: number }) =>
  request<MoveResult & { provokes?: Provoke[] }>(base(roomId, mapId, tokenId), { method: 'POST', body: { mode: 'walk', ...body }, auth: true })

/** Что делать с маршрутом перед ходом: не пройти, спросить про атаку по возможности или идти */
export const routeVerdict = (r: RoutePreview): 'blocked' | 'ask' | 'go' => (!r.valid ? 'blocked' : r.provokes.length ? 'ask' : 'go')
