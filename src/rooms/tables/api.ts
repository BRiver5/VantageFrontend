import { request } from '../../api'
import type { DrawResponse, RollTable, TableBody } from './types'

const base = (roomId: string, path = '') => `/rooms/${roomId}/tables${path}`

export async function listTables(roomId: string): Promise<RollTable[]> {
  return (await request<{ items: RollTable[] }>(base(roomId), { auth: true }))?.items ?? []
}
export const createTable = (roomId: string, body: TableBody) => request<RollTable>(base(roomId), { method: 'POST', body, auth: true })
export const patchTable = (roomId: string, id: string, body: TableBody) => request<RollTable>(base(roomId, `/${id}`), { method: 'PATCH', body, auth: true })
export const deleteTable = (roomId: string, id: string) => request<void>(base(roomId, `/${id}`), { method: 'DELETE', auth: true })
export const normalizeTable = (roomId: string, id: string) => request<RollTable>(base(roomId, `/${id}/normalize`), { method: 'POST', auth: true })
export const resetTable = (roomId: string, id: string) => request<RollTable>(base(roomId, `/${id}/reset`), { method: 'POST', auth: true })

export interface DrawBody {
  count?: number
  mode?: 'public' | 'gm'
  force_result_id?: string | null
}
export const drawTable = (roomId: string, id: string, body: DrawBody) => request<DrawResponse>(base(roomId, `/${id}/draw`), { method: 'POST', body, auth: true })

export interface FromFolderBody {
  source: 'kb_page' | 'item' | 'creature'
  folder?: string | null
  ids?: string[]
  name?: string
  replacement?: boolean
}
export const tableFromFolder = (roomId: string, body: FromFolderBody) => request<RollTable>(base(roomId, '/from-folder'), { method: 'POST', body, auth: true })
