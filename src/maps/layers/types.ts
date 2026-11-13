/**
 * Слои поверх карты: метки, звуки местности, рисунки (контракт
 * vantageserver/docs/MAPS_FRONTEND.md → «Слои карты»). Живут отдельно от
 * BattleMap: свои маршруты и события map.notes / map.sounds / map.drawings.
 */
import type { Pt } from '../types'

export type NoteIcon =
  | 'pin'
  | 'book'
  | 'scroll'
  | 'skull'
  | 'castle'
  | 'house'
  | 'tavern'
  | 'shop'
  | 'cave'
  | 'tree'
  | 'mountain'
  | 'star'
  | 'question'
  | 'exclamation'
  | 'chest'
  | 'door'
  | 'flag'
  | 'sword'
  | 'camp'
  | 'portal'

export interface MapNote {
  id: string
  map_id: string
  x: number
  y: number
  label: string
  icon: NoteIcon
  size: number
  tint: string | null
  /** «видна всегда»: поверх тумана и темноты */
  always_visible: boolean
  page_id: string | null
  /** limited — игроку только подпись, без страницы */
  access: 'full' | 'limited'
  /** только мастеру */
  limited?: boolean
  hidden?: boolean
  page_title?: string | null
  page_shared?: boolean
}

export interface MapSound {
  id: string
  map_id: string
  name: string
  asset_id: string | null
  url: string
  x: number
  y: number
  radius_ft: number
  volume: number
  /** тише к краю */
  easing: boolean
  /** глушится стенами с blocks.sound */
  walls: boolean
  /** темнота карты 0 день · 0.5 сумерки · 1 тьма */
  darkness: { min: number; max: number } | null
  enabled: boolean
}

export type DrawingKind = 'rect' | 'ellipse' | 'polygon' | 'freehand' | 'text'

export interface DrawingStyle {
  stroke_color: string
  stroke_width: number
  stroke_opacity: number
  fill: 'none' | 'solid'
  fill_color: string
  fill_opacity: number
  font_size: number
  text_color: string
}

export interface MapDrawing extends DrawingStyle {
  id: string
  map_id: string
  author_id: string
  kind: DrawingKind
  x: number
  y: number
  w: number
  h: number
  points: Pt[]
  text: string
  z: number
  hidden: boolean
}

export type DrawingInput = Omit<MapDrawing, 'id' | 'map_id' | 'author_id' | 'z' | 'hidden'> & { hidden?: boolean }

export interface MapLayersData {
  map_id: string
  notes: MapNote[]
  sounds: MapSound[]
  drawings: MapDrawing[]
  players_can_draw: boolean
}

/** событие слоя: заменить по id или убрать */
export interface LayerDelta<T> {
  map_id: string
  upsert?: T[]
  remove?: string[]
}
