/**
 * Боевые карты (контракт vantageserver/docs/MAPS_FRONTEND.md). Координаты —
 * пиксели карты, начало слева сверху, y вниз; высоты — футы; углы — градусы,
 * 0° вправо, рост по часовой. Правила (кто в области, путь, обзор, укрытие)
 * считает сервер — клиент рисует.
 */

export type Pt = { x: number; y: number }

export interface MapGrid {
  kind: 'square' | 'hex'
  cell_px: number
  feet_per_cell: number
  cols: number
  rows: number
  offset_x: number
  offset_y: number
  area_rule: 'touch' | 'center'
  diagonal: '5' | '5-10'
}

export interface MapLayer {
  id: string
  asset_id?: string | null
  image_url?: string | null
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  kind: 'background' | 'floor' | 'overlay' | 'roof'
  opacity: number
  hide_when_occupied?: boolean
}

export interface MapObject {
  id: string
  asset_id?: string | null
  image_url?: string | null
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  height_ft: number
  base_ft: number
  climbable: boolean
  cover: 'none' | 'half' | 'three_quarters' | 'full'
  blocks_move: boolean
  blocks_sight: boolean
  blocks_light: boolean
  walkable_top: boolean
  container: boolean
  interactions?: MapInteraction[]
  state?: Record<string, unknown>
  hidden?: boolean
}

/** Действие на объекте: «Открыть», «Обыскать», «Потянуть рычаг». Игроку — без check и сценария */
export interface MapInteraction {
  id: string
  label: string
  economy: 'free' | 'object' | 'action' | 'bonus' | 'reaction'
  reach_ft: number
  check?: { skill?: string; ability?: string; dc: number } | null
  on_success?: SceneAction[]
  on_fail?: SceneAction[]
  once?: boolean
  dm_only?: boolean
}

export interface MapWall {
  id: string
  a: Pt
  b: Pt
  kind: 'wall' | 'door' | 'window' | 'secret' | 'invisible' | 'terrain'
  height_ft: number
  base_ft: number
  blocks: { move: boolean; sight: boolean; light: boolean; sound: boolean }
  door?: { open: boolean; locked: boolean; lock_dc?: number | null; secret?: boolean } | null
  one_way?: boolean
}

export interface MapLight {
  id: string
  x: number
  y: number
  elevation_ft: number
  bright_ft: number
  dim_ft: number
  color?: string | null
  angle: number
  rotation: number
  flicker: boolean
  attached_to?: string | null
  enabled: boolean
}

export type VisionMode = 'normal' | 'darkvision' | 'blindsight' | 'truesight' | 'tremorsense'

export interface MapToken {
  id: string
  combatant_id?: string | null
  creature_id?: string | null
  character_id?: string | null
  label: string
  asset_id?: string | null
  image_url?: string | null
  x: number
  y: number
  elevation_ft: number
  /** в клетках */
  size: number
  rotation: number
  vision_mode: VisionMode
  senses: Record<string, number>
  flying: boolean
  hidden: boolean
  dormant?: boolean
  group?: string | null
  side?: 'party' | 'enemies' | 'neutral' | null
  light_id?: string | null
}

export interface MapItem {
  id: string
  room_item_id?: string | null
  name: string
  x: number
  y: number
  elevation_ft?: number
  hidden?: boolean
  carried_by?: string | null
  container_object_id?: string | null
  asset_id?: string | null
  image_url?: string | null
}

export interface MapZone {
  id: string
  name: string
  shape: { kind: 'polygon' | 'circle' | 'cells'; points?: Pt[]; center?: Pt; radius_ft?: number; cells?: string[]; attached_to?: string | null }
  vfx_preset?: string | null
  visible_to_players: boolean
  source?: { kind?: 'dm' | 'spell'; spell?: string }
  difficult_terrain?: boolean
  enabled: boolean
  on_enter?: SceneAction[]
  on_start_turn?: SceneAction[]
  on_end_turn?: SceneAction[]
  on_leave?: SceneAction[]
  frequency?: 'every_time' | 'once_per_turn' | 'once_per_creature' | 'once'
  affects?: 'all' | 'party' | 'enemies'
  obscured?: 'none' | 'lightly' | 'heavily'
  duration_rounds?: number | null
  asset_id?: string | null
  /** «без погоды»: навес, пещера */
  no_weather?: boolean
}

/** Блок сценария: op и поля по /scene-blocks */
export type SceneAction = { op: string } & Record<string, unknown>

export type TriggerEvent =
  | 'token_enters_zone'
  | 'token_leaves_zone'
  | 'turn_start_in_zone'
  | 'turn_end_in_zone'
  | 'turn_start'
  | 'turn_end'
  | 'round_start'
  | 'combat_started'
  | 'combat_ended'
  | 'door_opened'
  | 'door_closed'
  | 'object_interacted'
  | 'item_picked'
  | 'creature_died'
  | 'hp_below'
  | 'variable_changed'
  | 'group_activated'
  | 'manual'

export interface MapTrigger {
  id: string
  name: string
  enabled: boolean
  event: TriggerEvent
  match: Record<string, unknown>
  condition?: string | null
  actions: SceneAction[]
  once: boolean
  cooldown_rounds: number
}

export interface SpawnCycle {
  id: string
  name: string
  enabled: boolean
  start_round: number
  every_rounds: number
  max_total: number
  count: number
  creature: { catalog_ref?: string | null; name?: string | null; asset_id?: string | null }
  at: { zone_id?: string | null; x?: number; y?: number }
  side: 'party' | 'enemies' | 'neutral'
  group?: string | null
  condition?: string | null
}

export interface SceneBlockField {
  name: string
  kind: 'enum' | 'expr' | 'blocks' | 'str' | 'bool' | 'modifiers' | 'json' | 'text' | string
  label: string
  required: boolean
  default?: unknown
  options?: string[]
  help?: string
}
export interface SceneBlockDef {
  op: string
  label: string
  category: string
  sentence: string
  fields: SceneBlockField[]
  child_lists: string[]
  doc?: string
}

export interface BattleMap {
  id: string
  room_id: string | null
  name: string
  description: string
  revision: number
  revealed: boolean
  grid: MapGrid
  layers: MapLayer[]
  terrain: { elevation: Record<string, number>; difficult: string[]; water: string[]; climbable: string[] }
  objects: MapObject[]
  walls: MapWall[]
  lights: MapLight[]
  ambient: { level: 'bright' | 'dim' | 'dark'; color: string | null }
  tokens: MapToken[]
  items: MapItem[]
  zones: MapZone[]
  fog: { mode: 'off' | 'manual' | 'dynamic'; honest: boolean; shared_party_vision: boolean }
  /** только мастеру */
  triggers?: MapTrigger[]
  spawns?: SpawnCycle[]
  variables?: Record<string, unknown>
  audio?: { music: string[]; ambience: string[]; soundboard: string[]; volume: number }
  rules?: { high_ground_advantage: boolean; high_ground_min_ft?: number; pickup_costs: string }
  /** погода сцены: частицы поверх карты (нет — ясно) */
  weather?: MapWeather
  /** игроку: фигуры спрятанных зон «без погоды» */
  weather_masks?: MapZone['shape'][]
}

export type WeatherKind = 'none' | 'rain' | 'snow' | 'fog' | 'ash' | 'embers' | 'leaves'
export interface MapWeather {
  kind: WeatherKind
  /** 0..1 */
  intensity: number
  /** куда дует ветер: 0° — вправо, по часовой */
  wind_deg: number
  /** сила ветра 0..1 */
  wind: number
}

/** Пакет конструктора: add / update / remove по видам */
export type EditKind = 'walls' | 'objects' | 'lights' | 'layers' | 'tokens' | 'items' | 'zones' | 'triggers' | 'spawns'
export type EditBatch = { revision?: number } & Partial<Record<EditKind, { add?: unknown[]; update?: unknown[]; remove?: string[] }>>

export interface MovePreview {
  speed: number
  budget: number
  cells: { cell: [number, number]; cost: number; elevation_ft: number }[]
}

export interface MoveResult {
  token_id: string
  path: [number, number][]
  x: number
  y: number
  elevation_ft: number
  cost: number
  fall_ft?: number
  log?: unknown[]
}

/** Наведение: что сервер сказал про фигуру */
export interface AimInfo {
  origin: [number, number]
  angle_deg: number
  in_range: boolean
  polygon: [number, number][]
  path: [number, number][]
  warnings: string[]
  tokens: { token_id: string; combatant_id?: string | null; relation: 'enemy' | 'ally' | 'self' | 'neutral'; cover: string }[]
}

export interface AimRequest {
  x?: number
  y?: number
  angle_deg?: number
  distance_ft?: number
}

/** Как заклинание наводится (mechanics.targeting) */
export interface SpellTargeting {
  mode: 'self' | 'creature' | 'creatures' | 'point' | 'direction' | 'area_from_self' | 'area_at_point' | 'object' | 'projectiles' | 'none'
  shape?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation' | 'wall' | 'square'
  size_ft?: number
  width_ft?: number
  range_ft?: number | null
  origin?: 'self' | 'point' | 'target'
  requires_sight?: boolean
  max_targets?: number
  allow_self?: boolean
  hits_allies?: boolean
  joystick?: { rotate: boolean; step_deg: number; distance: boolean; snap_to_grid: boolean }
}

/** Эфемерный map.vfx: анимация заклинания для всех */
export interface VfxStage {
  vfx: string
  sfx_tags?: string[]
  at?: 'caster' | 'target' | 'area' | 'path' | 'point'
  delay_ms?: number
}

export interface MapVfx {
  spell: string
  presentation?: {
    element?: string
    palette?: string[]
    damage_number?: { color: string; style: string }
    shake?: number
    flash?: string
    cast?: VfxStage
    travel?: VfxStage
    area?: VfxStage
    impact?: VfxStage
    persistent?: VfxStage
  }
  actor_combatant_id: string
  damage_type?: string | null
  map_id: string
  caster_token_id?: string | null
  origin?: [number, number]
  angle_deg?: number
  polygon?: [number, number][]
  path?: [number, number][]
  targets?: { combatant_id: string; hit: boolean; saved: boolean; damage: number; types: string[]; healed?: number }[]
}
