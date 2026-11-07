/** Библиотека ассетов (GET /assets): тайлы, декор, жетоны, иконки, звуки */
import { request } from '../api'

export type AssetKind = 'terrain' | 'decor' | 'wall_texture' | 'token' | 'icon' | 'vfx_sprite' | 'vfx_preset' | 'sfx' | 'music' | 'ambience' | 'soundboard' | 'map_background'

export interface Asset {
  id: string
  kind: AssetKind
  title: { ru?: string; en?: string }
  tags: string[]
  category: string
  style: string
  urls: { original: string; medium?: string | null; low?: string | null; animated?: string | null; ogg?: string | null }
  mime: string
  width_px?: number | null
  height_px?: number | null
  footprint: { w_cells: number; h_cells: number }
  anchor: { x: number; y: number }
  rotation_snap: number
  height_ft: number
  climbable: boolean
  cover: 'none' | 'half' | 'three_quarters' | 'full'
  blocks_move: boolean
  blocks_sight: boolean
  walkable_top: boolean
  audio?: { duration_sec?: number; bpm?: number; mood?: string[]; loop?: boolean } | null
  license: { id: string; url?: string | null; attribution?: string | null }
  attribution?: string | null
  author?: string | null
}

export const assetTitle = (a: Asset) => a.title.ru || a.title.en || 'Без названия'
export const assetImage = (a: Asset) => a.urls.animated || a.urls.original
export const assetThumb = (a: Asset) => a.urls.medium || a.urls.original

export async function searchAssets(q: { kind?: string; q?: string; category?: string; tags?: string; offset?: number; limit?: number }): Promise<{ total: number; items: Asset[] }> {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v))
  const r = await request<{ total: number; items: Asset[] }>(`/assets?${p}`)
  return { total: r?.total ?? 0, items: r?.items ?? [] }
}

export interface AssetCategory {
  kind: string
  category: string
  style: string
  count: number
}
const cats = new Map<string, Promise<AssetCategory[]>>()
export function assetCategories(kind: string): Promise<AssetCategory[]> {
  let p = cats.get(kind)
  if (!p) {
    p = request<{ items: AssetCategory[] }>(`/assets/categories?kind=${kind}`).then(
      (r) => (r?.items ?? []).filter((c) => c.kind === kind),
      () => (cats.delete(kind), []),
    )
    cats.set(kind, p)
  }
  return p
}

/** Первый звук по тегам: для этапов заклинаний и саундборда */
const sfxCache = new Map<string, Promise<Asset | null>>()
export function sfxFor(tags: string[]): Promise<Asset | null> {
  const key = tags.join(',')
  let p = sfxCache.get(key)
  if (!p) {
    p = (async () => {
      for (const t of tags) {
        const r = await searchAssets({ kind: 'sfx', tags: t, limit: 1 }).catch(() => null)
        if (r?.items[0]) return r.items[0]
      }
      return null
    })()
    sfxCache.set(key, p)
  }
  return p
}

export interface AssetCredit {
  id: string
  attribution: string | null
  license: { id: string; url?: string | null; attribution?: string | null }
}
/** Авторы ассетов на карте: CC-BY требует их показать */
export const getAttribution = (ids: string[]) =>
  request<{ items: AssetCredit[] }>(`/assets/attribution?${ids.map((i) => `ids=${encodeURIComponent(i)}`).join('&')}`).then((r) => r?.items ?? [])
