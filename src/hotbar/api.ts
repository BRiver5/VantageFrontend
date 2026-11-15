import { request } from '../api'
import { normalizePages, type HotbarPages } from './model'

const path = (roomId: string) => `/rooms/${roomId}/hotbar`

export async function getHotbar(roomId: string): Promise<HotbarPages> {
  const res = await request<{ pages: unknown }>(path(roomId), { auth: true })
  return normalizePages(res.pages)
}

export async function putHotbar(roomId: string, pages: HotbarPages): Promise<HotbarPages> {
  const res = await request<{ pages: unknown }>(path(roomId), { method: 'PUT', body: { pages }, auth: true })
  return normalizePages(res.pages)
}
