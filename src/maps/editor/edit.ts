/** Правки карты конструктора: попадание курсором, ассеты, рельеф, перетаскивание */
import { assetImage, assetTitle, type Asset } from '../assets'
import { cellCenter, cellOf, dist, pointInPolygon } from '../geometry'
import type { BattleMap, MapObject, MapToken, Pt } from '../types'
import { uid } from './batch'
import { segDist, zonePoly } from './geometry'
import type { Brush, Tool } from './types'

type Grid = BattleMap['grid']

/** объект в клетках: чётный размер — к углу, нечётный — к центру */
export const snapCell = (g: Grid, p: Pt, w = 1, h = 1) => {
  const [c, r] = cellOf(g, p)
  const cc = cellCenter(g, c, r)
  return { x: cc.x + (w % 2 === 0 ? g.cell_px / 2 : 0), y: cc.y + (h % 2 === 0 ? g.cell_px / 2 : 0) }
}

/** что под курсором: свет, жетон, предмет, объект, стена, зона */
export const hitAt = (map: BattleMap, p: Pt): string | null => {
  const g = map.grid
  const near = g.cell_px * 0.3
  const l = map.lights.find((x) => dist(x, p) < near)
  if (l) return l.id
  const t = map.tokens.find((x) => dist(x, p) <= (x.size * g.cell_px) / 2)
  if (t) return t.id
  const it = map.items.find((x) => !x.carried_by && dist(x, p) < near)
  if (it) return it.id
  const o = [...map.objects].reverse().find((x) => Math.abs(p.x - x.x) <= x.w / 2 && Math.abs(p.y - x.y) <= x.h / 2)
  if (o) return o.id
  const w = map.walls.map((x) => ({ x, d: segDist(p, x.a, x.b) })).filter((x) => x.d < near * 0.6).sort((a, b) => a.d - b.d)[0]
  if (w) return w.x.id
  const z = [...map.zones].reverse().find((x) => pointInPolygon(p, zonePoly(x, map)))
  return z?.id ?? null
}

/** поставить ассет: по виду — пол, фон, жетон или объект */
export const assetPlacement = (g: Grid, a: Asset, p: Pt): { apply: (m: BattleMap) => BattleMap; select?: string } => {
  const w = Math.max(0.5, a.footprint?.w_cells ?? 1)
  const h = Math.max(0.5, a.footprint?.h_cells ?? 1)
  const url = assetImage(a)
  if (a.kind === 'map_background') {
    const ratio = (a.height_px ?? 1) / (a.width_px ?? 1)
    const W = g.cols * g.cell_px
    return { apply: (m) => ({ ...m, layers: [...m.layers.filter((l) => l.kind !== 'background'), { id: uid('bg'), asset_id: a.id, image_url: url, x: g.offset_x, y: g.offset_y, w: W, h: Math.round(W * ratio), rotation: 0, z: 0, kind: 'background', opacity: 1 }] }) }
  }
  if (a.kind === 'terrain') {
    const [c, r] = cellOf(g, p)
    const x = g.offset_x + c * g.cell_px
    const y = g.offset_y + r * g.cell_px
    return { apply: (m) => ({ ...m, layers: [...m.layers.filter((l) => !(l.kind === 'floor' && l.x === x && l.y === y)), { id: uid('fl'), asset_id: a.id, image_url: url, x, y, w: g.cell_px, h: g.cell_px, rotation: 0, z: 1, kind: 'floor', opacity: 1 }] }) }
  }
  if (a.kind === 'token') {
    const at = snapCell(g, p, w, w)
    const t: MapToken = { id: uid('t'), asset_id: a.id, image_url: url, label: assetTitle(a), x: at.x, y: at.y, elevation_ft: 0, size: w, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: true, side: 'enemies' }
    return { apply: (m) => ({ ...m, tokens: [...m.tokens, t] }), select: t.id }
  }
  const at = snapCell(g, p, w, h)
  const o: MapObject = {
    id: uid('o'),
    asset_id: a.id,
    image_url: url,
    name: assetTitle(a),
    x: at.x,
    y: at.y,
    w: w * g.cell_px,
    h: h * g.cell_px,
    rotation: 0,
    z: 2,
    height_ft: a.height_ft ?? 0,
    base_ft: 0,
    climbable: !!a.climbable,
    cover: a.cover ?? 'none',
    blocks_move: !!a.blocks_move,
    blocks_sight: !!a.blocks_sight,
    blocks_light: !!a.blocks_sight,
    walkable_top: !!a.walkable_top,
    container: false,
    interactions: [],
    hidden: false,
  }
  return { apply: (m) => ({ ...m, objects: [...m.objects, o] }), select: o.id }
}

/** кисть рельефа по клетке key */
export const paintTerrain = (m: BattleMap, key: string, brush: Brush, add: boolean): BattleMap => {
  const tr = { elevation: { ...(m.terrain?.elevation ?? {}) }, difficult: [...(m.terrain?.difficult ?? [])], water: [...(m.terrain?.water ?? [])], climbable: [...(m.terrain?.climbable ?? [])] }
  if (brush === 'up' || brush === 'down') {
    const v = (tr.elevation[key] ?? 0) + (brush === 'up' ? 5 : -5)
    if (v === 0) delete tr.elevation[key]
    else tr.elevation[key] = v
  } else {
    const set = new Set(tr[brush])
    if (add) set.add(key)
    else set.delete(key)
    tr[brush] = [...set]
  }
  return { ...m, terrain: tr }
}

/** перетаскивание выбранного: free — без привязки к клеткам */
export const dragTo = (m: BattleMap, g: Grid, d: { id: string; kind: 'token' | 'light' | 'item' | 'object' }, p: Pt, free: boolean): BattleMap => {
  const raw = { x: Math.round(p.x), y: Math.round(p.y) }
  if (d.kind === 'token') {
    return { ...m, tokens: m.tokens.map((t) => (t.id === d.id ? { ...t, ...(free ? raw : snapCell(g, p, t.size, t.size)) } : t)) }
  }
  if (d.kind === 'object') {
    return { ...m, objects: m.objects.map((o) => (o.id === d.id ? { ...o, ...(free ? raw : snapCell(g, p, Math.round(o.w / g.cell_px), Math.round(o.h / g.cell_px))) } : o)) }
  }
  if (d.kind === 'item') return { ...m, items: m.items.map((i) => (i.id === d.id ? { ...i, ...raw } : i)) }
  return { ...m, lights: m.lights.map((l) => (l.id === d.id ? { ...l, ...raw } : l)) }
}

/** подсказка инструмента над холстом */
export const toolTip = (tool: Tool, asset: Asset | null) =>
  tool === 'wall'
    ? 'Клик — точка, двойной клик или Enter — закончить, Shift — без привязки'
    : tool === 'door' || tool === 'window'
      ? 'Два клика: начало и конец'
      : tool === 'zone'
        ? 'Клики — углы зоны, Enter — замкнуть; один клик и Enter — круг 10 фт.'
        : tool === 'terrain'
          ? 'Ведите по клеткам; числа — высота пола в футах'
          : tool === 'asset'
            ? asset
              ? `«${assetTitle(asset)}»: клик по карте — поставить. Или перетащите из библиотеки`
              : 'Выберите ассет снизу или перетащите на карту'
            : tool === 'item'
              ? 'Клик — положить находку; в контейнер — кликом по сундуку'
              : null

/** копия выбранного рядом (Ctrl+D) */
export const duplicateNear = (m: BattleMap, sel: string): BattleMap => {
  const shift = m.grid.cell_px
  const o = m.objects.find((x) => x.id === sel)
  if (o) return { ...m, objects: [...m.objects, { ...o, id: uid('o'), x: o.x + shift, y: o.y + shift }] }
  const l = m.lights.find((x) => x.id === sel)
  if (l) return { ...m, lights: [...m.lights, { ...l, id: uid('l'), x: l.x + shift }] }
  const t = m.tokens.find((x) => x.id === sel && !x.character_id)
  if (t) return { ...m, tokens: [...m.tokens, { ...t, id: uid('t'), x: t.x + shift, combatant_id: null }] }
  return m
}

/**
 * Номер следующего жетона штампа: первый — «Гоблин», дальше «Гоблин 2», «Гоблин 3».
 * Считаются только такие подписи («Гоблин-вожак» — другой штамп); номер — после
 * наибольшего, чтобы удалённый из середины не дал повтор.
 */
export const nextStampNumber = (labels: string[], base: string): number => {
  let top = 0
  for (const l of labels) {
    if (l === base) top = Math.max(top, 1)
    else if (l.startsWith(`${base} `) && /^\d+$/.test(l.slice(base.length + 1))) top = Math.max(top, Number(l.slice(base.length + 1)))
  }
  return top + 1
}
