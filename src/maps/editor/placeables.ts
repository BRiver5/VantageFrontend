/** Список объектов сцены: стены, объекты, свет, жетоны, предметы, зоны; фильтры, рамка выбора, закрепление */
import { pxPerFt } from '../geometry'
import type { BattleMap, MapWall, MapZone, Pt } from '../types'

export type PlaceKind = 'walls' | 'objects' | 'lights' | 'tokens' | 'items' | 'zones'

export const PLACE_KINDS: { id: PlaceKind; label: string }[] = [
  { id: 'walls', label: 'Стены' },
  { id: 'objects', label: 'Объекты' },
  { id: 'lights', label: 'Свет' },
  { id: 'tokens', label: 'Жетоны' },
  { id: 'items', label: 'Находки' },
  { id: 'zones', label: 'Зоны' },
]

export interface Placeable {
  id: string
  kind: PlaceKind
  name: string
  /** скрыто от игроков */
  hidden: boolean
  locked: boolean
  /** куда навести камеру */
  at: Pt
}

export type Tri = 'any' | 'yes' | 'no'

export interface PlaceFilter {
  /** пусто — все виды */
  kinds: PlaceKind[]
  q: string
  hidden: Tri
  locked: Tri
}

export const EMPTY_FILTER: PlaceFilter = { kinds: [], q: '', hidden: 'any', locked: 'any' }

const WALL_NAMES: Record<MapWall['kind'], string> = { wall: 'Стена', door: 'Дверь', window: 'Окно', secret: 'Секретная дверь', invisible: 'Невидимая стена', terrain: 'Ограда' }

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** центр зоны */
export function zoneCenter(z: MapZone, map: BattleMap): Pt {
  const s = z.shape
  if (s.kind === 'circle' && s.center) return s.center
  if (s.kind === 'cells' && s.cells?.length) {
    const g = map.grid
    const cs = s.cells.map((k) => k.split(',').map(Number))
    const c = cs.reduce((a, [x, y]) => ({ x: a.x + x, y: a.y + y }), { x: 0, y: 0 })
    return { x: g.offset_x + (c.x / cs.length + 0.5) * g.cell_px, y: g.offset_y + (c.y / cs.length + 0.5) * g.cell_px }
  }
  const pts = s.points ?? []
  if (!pts.length) return { x: 0, y: 0 }
  const c = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
  return { x: c.x / pts.length, y: c.y / pts.length }
}

/** все объекты карты одним списком */
export function placeables(map: BattleMap): Placeable[] {
  const n: Partial<Record<string, number>> = {}
  const num = (base: string) => {
    n[base] = (n[base] ?? 0) + 1
    return `${base} ${n[base]}`
  }
  return [
    ...map.walls.map((w) => ({ id: w.id, kind: 'walls' as const, name: num(WALL_NAMES[w.kind] ?? 'Стена'), hidden: w.kind === 'secret' || !!w.door?.secret, locked: !!w.locked, at: mid(w.a, w.b) })),
    ...map.objects.map((o) => ({ id: o.id, kind: 'objects' as const, name: o.name || num('Объект'), hidden: !!o.hidden, locked: !!o.locked, at: { x: o.x, y: o.y } })),
    ...map.lights.map((l) => ({ id: l.id, kind: 'lights' as const, name: num('Свет'), hidden: !l.enabled, locked: !!l.locked, at: { x: l.x, y: l.y } })),
    ...map.tokens.map((t) => ({ id: t.id, kind: 'tokens' as const, name: t.label || num('Жетон'), hidden: t.hidden || !!t.dormant, locked: !!t.locked, at: { x: t.x, y: t.y } })),
    ...map.items.map((i) => ({ id: i.id, kind: 'items' as const, name: i.name || num('Находка'), hidden: !!i.hidden, locked: !!i.locked, at: { x: i.x, y: i.y } })),
    ...map.zones.map((z) => ({ id: z.id, kind: 'zones' as const, name: z.name || num('Зона'), hidden: !z.visible_to_players, locked: !!z.locked, at: zoneCenter(z, map) })),
  ]
}

const tri = (t: Tri, v: boolean) => t === 'any' || (t === 'yes') === v

export function filterPlaceables(list: Placeable[], f: PlaceFilter): Placeable[] {
  const q = f.q.trim().toLowerCase()
  return list.filter((x) => (!f.kinds.length || f.kinds.includes(x.kind)) && (!q || x.name.toLowerCase().includes(q)) && tri(f.hidden, x.hidden) && tri(f.locked, x.locked))
}

/** вид объекта по id */
export function kindOf(map: BattleMap, id: string): PlaceKind | null {
  for (const k of PLACE_KINDS) if ((map[k.id] as { id: string }[]).some((x) => x.id === id)) return k.id
  return null
}

/** что попало в рамку a–b целиком (стена — обоими концами); закреплённое не выбирается */
export function idsInBox(map: BattleMap, a: Pt, b: Pt): string[] {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
  const free = <T extends { id: string; locked?: boolean }>(xs: T[], at: (x: T) => boolean) => xs.filter((x) => !x.locked && at(x)).map((x) => x.id)
  const ppf = pxPerFt(map.grid)
  return [
    ...free(map.walls, (w) => inside(w.a) && inside(w.b)),
    ...free(map.objects, (o) => inside(o)),
    ...free(map.lights, (l) => inside(l)),
    ...free(map.tokens, (t) => inside(t)),
    ...free(map.items, (i) => !i.carried_by && inside(i)),
    ...free(map.zones, (z) => {
      const s = z.shape
      if (s.kind === 'circle' && s.center) {
        const r = (s.radius_ft ?? 10) * ppf
        return inside({ x: s.center.x - r, y: s.center.y - r }) && inside({ x: s.center.x + r, y: s.center.y + r })
      }
      const pts = s.points ?? []
      return pts.length > 0 ? pts.every(inside) : inside(zoneCenter(z, map))
    }),
  ]
}

/** закрепить или открепить объекты ids */
export function setLocked(map: BattleMap, ids: readonly string[], locked: boolean): BattleMap {
  const want = new Set(ids)
  const out = { ...map }
  const lists = out as unknown as Record<PlaceKind, unknown[]>
  for (const k of PLACE_KINDS) {
    const xs = map[k.id] as { id: string; locked?: boolean }[]
    if (!xs.some((x) => want.has(x.id) && !!x.locked !== locked)) continue
    lists[k.id] = xs.map((x) => (want.has(x.id) ? { ...x, locked } : x))
  }
  return out
}

/** Shift+клик: добавить или убрать из выбора */
export const toggleId = (ids: readonly string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])

/** удалить объекты ids (фон не удаляется) */
export function removeIds(m: BattleMap, ids: readonly string[]): BattleMap {
  const rm = new Set(ids)
  return {
    ...m,
    walls: m.walls.filter((w) => !rm.has(w.id)),
    lights: m.lights.filter((l) => !rm.has(l.id)),
    tokens: m.tokens.filter((t) => !rm.has(t.id)),
    objects: m.objects.filter((o) => !rm.has(o.id)),
    items: m.items.filter((i) => !rm.has(i.id)),
    zones: m.zones.filter((z) => !rm.has(z.id)),
    layers: m.layers.filter((l) => !rm.has(l.id) || l.kind === 'background'),
  }
}
