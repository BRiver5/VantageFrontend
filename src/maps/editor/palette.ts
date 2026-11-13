/**
 * Палитра конструктора (как Palette в Foundry): свойства для новых стен,
 * объектов и жетонов и массовая правка выбранного.
 *
 * - «Применить» — поля палитры на выбранное этого вида (тронутые поля, а если
 *   ничего не трогали — все);
 * - «Клонировать» — свойства первого выбранного в палитру целиком;
 * - «Сбросить» — тронутые поля обратно к значениям выбранного (без выбора — к
 *   исходным).
 */
import type { BattleMap, MapObject, MapToken, MapWall, Pt, VisionMode } from '../types'
import { uid } from './batch'

export type PaletteKind = 'walls' | 'objects' | 'tokens'

export interface WallStyle {
  kind: MapWall['kind']
  height_ft: number
  one_way: boolean
  move: boolean
  sight: boolean
  light: boolean
  sound: boolean
}

export interface ObjectStyle {
  height_ft: number
  cover: MapObject['cover']
  blocks_move: boolean
  blocks_sight: boolean
  blocks_light: boolean
  climbable: boolean
  walkable_top: boolean
  hidden: boolean
}

export interface TokenStyle {
  hidden: boolean
  side: 'party' | 'enemies' | 'neutral'
  vision_mode: VisionMode
  elevation_ft: number
}

export interface Styles {
  walls: WallStyle
  objects: ObjectStyle
  tokens: TokenStyle
}

export interface Palette extends Styles {
  /** поля, которые правили в палитре после клонирования или сброса */
  touched: { [K in PaletteKind]: (keyof Styles[K])[] }
  /** новые объекты и жетоны тоже получают поля палитры (стены — всегда) */
  forNew: { objects: boolean; tokens: boolean }
}

export const DEFAULT_STYLES: Styles = {
  walls: { kind: 'wall', height_ft: 10, one_way: false, move: true, sight: true, light: true, sound: true },
  objects: { height_ft: 0, cover: 'none', blocks_move: false, blocks_sight: false, blocks_light: false, climbable: false, walkable_top: false, hidden: false },
  tokens: { hidden: false, side: 'enemies', vision_mode: 'normal', elevation_ft: 0 },
}

export const defaultPalette = (): Palette => ({
  walls: { ...DEFAULT_STYLES.walls },
  objects: { ...DEFAULT_STYLES.objects },
  tokens: { ...DEFAULT_STYLES.tokens },
  touched: { walls: [], objects: [], tokens: [] },
  forNew: { objects: false, tokens: false },
})

/** Заготовки стен: что задают кнопки палитры */
export const WALL_PRESETS: { id: string; label: string; hint: string; style: Pick<WallStyle, 'kind' | 'move' | 'sight' | 'light' | 'sound'> }[] = [
  { id: 'solid', label: 'Сплошная', hint: 'Не пройти, не увидеть, не услышать', style: { kind: 'wall', move: true, sight: true, light: true, sound: true } },
  { id: 'terrain', label: 'Местность', hint: 'Низкая ограда: пройти можно, обзор закрывает', style: { kind: 'terrain', move: false, sight: true, light: true, sound: true } },
  { id: 'invisible', label: 'Невидимая', hint: 'Не пройти, но всё видно и слышно', style: { kind: 'invisible', move: true, sight: false, light: false, sound: false } },
  { id: 'ethereal', label: 'Эфирная', hint: 'Пройти можно; закрывает обзор и звук, свет проходит', style: { kind: 'wall', move: false, sight: true, light: false, sound: true } },
  { id: 'door', label: 'Дверь', hint: 'Открывается и запирается', style: { kind: 'door', move: true, sight: true, light: true, sound: true } },
  { id: 'secret', label: 'Секретная дверь', hint: 'Игроки не видят, пока мастер не покажет', style: { kind: 'secret', move: true, sight: true, light: true, sound: true } },
  { id: 'window', label: 'Окно', hint: 'Видно и светит насквозь, звук глушит', style: { kind: 'window', move: false, sight: false, light: false, sound: true } },
]

const PRESET_KEYS: (keyof WallStyle)[] = ['kind', 'move', 'sight', 'light', 'sound']

/** какая заготовка совпадает со стилем стены */
export const presetOf = (s: WallStyle) => WALL_PRESETS.find((p) => PRESET_KEYS.every((k) => p.style[k as keyof typeof p.style] === s[k]))?.id ?? null

const listOf = <K extends PaletteKind>(map: BattleMap, kind: K) => map[kind] as { id: string }[]

// ------------------------------------------------------------------ стиль ↔ объект

export function styleOf(kind: 'walls', x: MapWall): WallStyle
export function styleOf(kind: 'objects', x: MapObject): ObjectStyle
export function styleOf(kind: 'tokens', x: MapToken): TokenStyle
export function styleOf(kind: PaletteKind, x: MapWall | MapObject | MapToken): Styles[PaletteKind]
export function styleOf(kind: PaletteKind, x: MapWall | MapObject | MapToken): Styles[PaletteKind] {
  if (kind === 'walls') {
    const w = x as MapWall
    return { kind: w.kind, height_ft: w.height_ft, one_way: !!w.one_way, ...w.blocks }
  }
  if (kind === 'objects') {
    const o = x as MapObject
    return { height_ft: o.height_ft, cover: o.cover, blocks_move: o.blocks_move, blocks_sight: o.blocks_sight, blocks_light: o.blocks_light, climbable: o.climbable, walkable_top: o.walkable_top, hidden: !!o.hidden }
  }
  const t = x as MapToken
  return { hidden: t.hidden, side: t.side ?? 'neutral', vision_mode: t.vision_mode, elevation_ft: t.elevation_ft }
}

const pick = <T extends object>(s: T, keys: (keyof T)[]): Partial<T> => Object.fromEntries(keys.map((k) => [k, s[k]])) as Partial<T>

/** стена с полями стиля keys */
export function styledWall(w: MapWall, s: Partial<WallStyle>): MapWall {
  const out: MapWall = { ...w, blocks: { ...w.blocks } }
  if (s.height_ft !== undefined) out.height_ft = s.height_ft
  if (s.one_way !== undefined) out.one_way = s.one_way
  for (const b of ['move', 'sight', 'light', 'sound'] as const) if (s[b] !== undefined) out.blocks[b] = s[b]
  if (s.kind !== undefined) {
    out.kind = s.kind
    const isDoor = s.kind === 'door' || s.kind === 'secret'
    out.door = isDoor ? { ...(w.door ?? { open: false, locked: false }), secret: s.kind === 'secret' } : null
  }
  return out
}

/** новая стена по палитре */
export const paletteWall = (s: WallStyle, a: Pt, b: Pt): MapWall =>
  styledWall({ id: uid('w'), a, b, kind: 'wall', height_ft: 10, base_ft: 0, blocks: { move: true, sight: true, light: true, sound: true } }, s)

function patched(kind: PaletteKind, x: { id: string }, s: Partial<Styles[PaletteKind]>): { id: string } {
  if (kind === 'walls') return styledWall(x as MapWall, s as Partial<WallStyle>)
  return { ...x, ...s }
}

// ------------------------------------------------------------------ действия

/** какие поля палитры уходят на выбранное: тронутые, а если ничего не трогали — все */
export const applyKeys = <K extends PaletteKind>(p: Palette, kind: K): (keyof Styles[K])[] =>
  p.touched[kind].length ? p.touched[kind] : (Object.keys(p[kind]) as (keyof Styles[K])[])

/** «Применить»: поля палитры на выбранные объекты вида kind */
export function applyPalette(map: BattleMap, ids: readonly string[], kind: PaletteKind, p: Palette): BattleMap {
  const want = new Set(ids)
  const s = pick(p[kind] as unknown as Record<string, unknown>, applyKeys(p, kind) as string[]) as Partial<Styles[PaletteKind]>
  let hit = false
  const next = listOf(map, kind).map((x) => {
    if (!want.has(x.id)) return x
    hit = true
    return patched(kind, x, s)
  })
  return hit ? { ...map, [kind]: next } : map
}

const firstOf = (map: BattleMap, ids: readonly string[], kind: PaletteKind) => {
  const want = new Set(ids)
  return listOf(map, kind).find((x) => want.has(x.id)) as MapWall | MapObject | MapToken | undefined
}

/** «Клонировать»: свойства первого выбранного вида kind — в палитру; null — такого не выбрано */
export function clonePalette(p: Palette, map: BattleMap, ids: readonly string[], kind: PaletteKind): Palette | null {
  const x = firstOf(map, ids, kind)
  if (!x) return null
  return { ...p, [kind]: styleOf(kind, x), touched: { ...p.touched, [kind]: [] } }
}

/** «Сбросить»: тронутые поля — к значениям выбранного, без выбора — к исходным */
export function resetPalette(p: Palette, map: BattleMap, ids: readonly string[], kind: PaletteKind): Palette {
  const x = firstOf(map, ids, kind)
  const src = (x ? styleOf(kind, x) : DEFAULT_STYLES[kind]) as unknown as Record<string, unknown>
  const keys = (p.touched[kind].length ? p.touched[kind] : Object.keys(p[kind])) as string[]
  return { ...p, [kind]: { ...p[kind], ...pick(src, keys) }, touched: { ...p.touched, [kind]: [] } }
}

/** правка поля палитры: запоминаем, что его трогали */
export function setPaletteField<K extends PaletteKind>(p: Palette, kind: K, patch: Partial<Styles[K]>): Palette {
  const keys = Object.keys(patch) as (keyof Styles[K])[]
  const touched = [...new Set([...p.touched[kind], ...keys])]
  return { ...p, [kind]: { ...p[kind], ...patch }, touched: { ...p.touched, [kind]: touched } }
}

/** кнопка-заготовка стены */
export function applyWallPreset(p: Palette, id: string): Palette {
  const preset = WALL_PRESETS.find((x) => x.id === id)
  return preset ? setPaletteField(p, 'walls', preset.style) : p
}

/** сколько выбранного каждого вида */
export function countKinds(map: BattleMap, ids: readonly string[]): Record<PaletteKind, number> {
  const want = new Set(ids)
  const n = (kind: PaletteKind) => listOf(map, kind).filter((x) => want.has(x.id)).length
  return { walls: n('walls'), objects: n('objects'), tokens: n('tokens') }
}

/** новый объект или жетон с id: поля палитры, если включено «новым тоже» (герои — без палитры) */
export function withNewDefaults(map: BattleMap, id: string | undefined, p: Palette): BattleMap {
  if (!id) return map
  for (const kind of ['objects', 'tokens'] as const) {
    if (p.forNew[kind] && (map[kind] as (MapObject | MapToken)[]).some((x) => x.id === id && !('character_id' in x && x.character_id))) return applyPalette(map, [id], kind, { ...p, touched: { ...p.touched, [kind]: [] } })
  }
  return map
}

// ------------------------------------------------------------------ хранение в браузере

const STORE = 'vantage.mapPalette.v1'

export function loadPalette(): Palette {
  const base = defaultPalette()
  try {
    const raw = localStorage.getItem(STORE)
    if (!raw) return base
    const v = JSON.parse(raw) as Partial<Palette>
    return {
      walls: { ...base.walls, ...v.walls },
      objects: { ...base.objects, ...v.objects },
      tokens: { ...base.tokens, ...v.tokens },
      touched: { walls: [], objects: [], tokens: [] },
      forNew: { ...base.forNew, ...v.forNew },
    }
  } catch {
    return base
  }
}

export function savePalette(p: Palette) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ walls: p.walls, objects: p.objects, tokens: p.tokens, forNew: p.forNew }))
  } catch {
    /* хранилище недоступно: палитра живёт до закрытия */
  }
}
