/**
 * Этажи карты (контракт: MAPS_FRONTEND.md → «Этажи»). Этаж жетона — тот, в
 * чей диапазон [bottom_ft, top_ft) попадает его высота; вещь с level_id есть
 * только на своём этаже, без него — на всех. Клиент рисует один этаж: карту,
 * собранную mapOnLevel (пересобирается при смене карты или этажа, не в кадре).
 */
import type { BattleMap, MapLevel, MapToken } from './types'

type Leveled = { level_id?: string | null }

/** этажи снизу вверх */
export function sortedLevels(levels: readonly MapLevel[] | undefined): MapLevel[] {
  return [...(levels ?? [])].sort((a, b) => a.bottom_ft - b.bottom_ft || a.top_ft - b.top_ft)
}

/** этаж высоты: содержащий её (при перекрытии — с самым высоким низом), иначе ближайший снизу, иначе нижний */
export function levelAt(levels: readonly MapLevel[] | undefined, elevation: number): MapLevel | null {
  const all = sortedLevels(levels)
  if (!all.length) return null
  let inside: MapLevel | null = null
  let below: MapLevel | null = null
  for (const lv of all) {
    if (lv.bottom_ft <= elevation) {
      below = lv
      if (elevation < lv.top_ft) inside = lv
    }
  }
  return inside ?? below ?? all[0]
}

export const tokenLevel = (map: Pick<BattleMap, 'levels'>, t: Pick<MapToken, 'elevation_ft'>): string | null => levelAt(map.levels, t.elevation_ft ?? 0)?.id ?? null

/** земной этаж: содержит высоту 0 (иначе нижний) */
export const groundLevel = (map: Pick<BattleMap, 'levels'>): string | null => levelAt(map.levels, 0)?.id ?? null

/** есть ли вещь на этаже (level null — все этажи) */
export const onLevel = (x: Leveled, level: string | null): boolean => level == null || x.level_id == null || x.level_id === level

/**
 * Какой этаж показывать. Мастер — выбранный им (null — все). Игрок — этаж
 * выбранного своего жетона, иначе первого своего, иначе земной.
 */
export function viewLevel(map: BattleMap | null, o: { isDm: boolean; chosen: string | null; selected: string | null; mine: readonly MapToken[] }): string | null {
  if (!map?.levels?.length) return null
  if (o.isDm) return o.chosen && map.levels.some((l) => l.id === o.chosen) ? o.chosen : null
  const own = o.mine.find((t) => t.id === o.selected) ?? o.mine[0]
  return own ? tokenLevel(map, own) : groundLevel(map)
}

/**
 * Карта одного этажа: жетоны этажа, вещи этажа и «на всех», свет в руке — с
 * жетоном, подложка этажа вместо фона карты, исследованный туман этажа.
 * Без этажей или при level null — та же карта (тот же объект).
 */
export function mapOnLevel(map: BattleMap, level: string | null): BattleMap {
  if (level == null || !map.levels?.length) return map
  const lv = map.levels.find((l) => l.id === level)
  if (!lv) return map
  const tokens = map.tokens.filter((t) => tokenLevel(map, t) === level)
  const here = new Set(tokens.map((t) => t.id))
  const layers = map.layers.filter((l) => onLevel(l, level) && !(lv.background && l.kind === 'background' && l.level_id == null))
  const explored = map.fog.explored_levels?.[level]
  return {
    ...map,
    tokens,
    layers: lv.background ? [{ ...lv.background, kind: 'background', level_id: level }, ...layers] : layers,
    walls: map.walls.filter((w) => onLevel(w, level)),
    objects: map.objects.filter((o) => onLevel(o, level)),
    items: map.items.filter((i) => (i.carried_by ? here.has(i.carried_by) : onLevel(i, level))),
    zones: map.zones.filter((z) => onLevel(z, level)),
    lights: map.lights.filter((l) => (l.attached_to ? here.has(l.attached_to) : onLevel(l, level))),
    fog: explored ? { ...map.fog, explored } : map.fog,
  }
}

/** метки, звуки, рисунки этажа (тот же массив, если отбирать нечего) */
export function layerOnLevel<T extends Leveled>(xs: T[], level: string | null): T[] {
  return level == null || !xs.some((x) => x.level_id != null && x.level_id !== level) ? xs : xs.filter((x) => onLevel(x, level))
}

const STAMPED = ['walls', 'objects', 'lights', 'items', 'zones', 'layers'] as const

/**
 * Конструктор: новые вещи (их id не было в prev) встают на этаж level, если
 * им не задан свой; новый жетон поднимается на пол этажа. level null —
 * «на всех этажах», ничего не меняем.
 */
export function stampLevel(prev: BattleMap, next: BattleMap, level: string | null): BattleMap {
  const lv = level ? next.levels?.find((l) => l.id === level) : undefined
  if (!lv || prev === next) return next
  let out = next
  for (const k of STAMPED) {
    const before = new Set((prev[k] as { id: string }[]).map((x) => x.id))
    const list = next[k] as (Leveled & { id: string })[]
    if (!list.some((x) => !before.has(x.id) && x.level_id === undefined)) continue
    out = { ...out, [k]: list.map((x) => (!before.has(x.id) && x.level_id === undefined ? { ...x, level_id: level } : x)) }
  }
  const had = new Set(prev.tokens.map((t) => t.id))
  if (next.tokens.some((t) => !had.has(t.id) && tokenLevel(next, t) !== level)) {
    out = { ...out, tokens: next.tokens.map((t) => (!had.has(t.id) && tokenLevel(next, t) !== level ? { ...t, elevation_ft: lv.bottom_ft } : t)) }
  }
  return out
}

/** этаж удалили: его вещи — «на всех этажах», лестницы на него — обычные зоны (как сервер) */
export function pruneLevels(map: BattleMap): BattleMap {
  const known = new Set((map.levels ?? []).map((l) => l.id))
  const stale = (x: Leveled) => x.level_id != null && !known.has(x.level_id)
  let out = map
  for (const k of STAMPED) {
    const list = map[k] as Leveled[]
    if (list.some(stale)) out = { ...out, [k]: list.map((x) => (stale(x) ? { ...x, level_id: null } : x)) }
  }
  if (out.zones.some((z) => z.stairs_to != null && !known.has(z.stairs_to))) {
    out = { ...out, zones: out.zones.map((z) => (z.stairs_to != null && !known.has(z.stairs_to) ? { ...z, stairs_to: null } : z)) }
  }
  return out
}

/** новый этаж над самым верхним */
export function nextLevel(levels: readonly MapLevel[] | undefined, id: string): MapLevel {
  const all = sortedLevels(levels)
  const top = all[all.length - 1]
  const bottom = top ? top.top_ft : 0
  const name = all.length ? `Этаж ${all.length + 1}` : 'Первый этаж'
  return { id, name, bottom_ft: bottom, top_ft: bottom + 10, background: null }
}

/** конструктор: поставить вещь с этим id на этаж (null — на все этажи) */
export function setLevelOf(map: BattleMap, id: string | null, level: string | null): BattleMap {
  if (!id) return map
  for (const k of STAMPED) {
    const list = map[k] as (Leveled & { id: string })[]
    if (list.some((x) => x.id === id)) return { ...map, [k]: list.map((x) => (x.id === id ? { ...x, level_id: level } : x)) }
  }
  return map
}
