/** Папки списков мастера: GET/POST/PATCH/DELETE /rooms/{id}/folders (см. docs/ROOMS_FRONTEND.md → «Папки списков мастера») */
import { request } from '../../api'
import type { ServerFolder, SortMode } from './model'

/** item_templates — «Свои» заготовки добычи, scene_images — картинки для показа: у каждого списка свои папки */
export type FolderKind = 'creatures' | 'items' | 'item_templates' | 'maps' | 'scene_images' | 'tables' | 'kb'

export interface Placement {
  folder_id: string | null
  sort_order: number | null
}

export interface FolderListing {
  kind: FolderKind
  folders: ServerFolder[]
  placements: Record<string, Placement>
}

export interface FolderPatch {
  name?: string
  color?: string | null
  parent_id?: string | null
  sort?: SortMode | null
  order?: number
}

export interface MoveBody {
  kind: FolderKind
  folder_id: string | null
  ids?: string[]
  folders?: string[]
  order?: string[]
}

const base = (roomId: string, path = '') => `/rooms/${roomId}/folders${path}`

export const listFolders = (roomId: string, kind: FolderKind) => request<FolderListing>(`${base(roomId)}?kind=${kind}`, { auth: true })
export const createFolder = (roomId: string, body: { kind: FolderKind; name: string; parent_id?: string | null; color?: string | null }) =>
  request<ServerFolder>(base(roomId), { method: 'POST', body, auth: true })
export const patchFolder = (roomId: string, id: string, body: FolderPatch) => request<ServerFolder>(base(roomId, `/${id}`), { method: 'PATCH', body, auth: true })
export const deleteFolder = (roomId: string, id: string) => request<void>(base(roomId, `/${id}`), { method: 'DELETE', auth: true })
export const ensureFolderPath = (roomId: string, kind: FolderKind, path: string) =>
  request<{ folder: ServerFolder; folders: ServerFolder[] }>(base(roomId, '/ensure'), { method: 'POST', body: { kind, path }, auth: true })
export const moveInFolders = (roomId: string, body: MoveBody) => request<FolderListing>(base(roomId, '/move'), { method: 'POST', body, auth: true })
