import type { AimInfo, AimRequest } from '../maps/types'
/**
 * Типы комнат — по контракту бэкенда (ROOMS_FRONTEND.md).
 * Даты и UUID приходят строками. Схемы Equipment, MagicItem, Creature,
 * Character и Sheet — те же, что у остального API.
 */
import type { Creature, Equipment, Item as MagicItem } from '../api'

/* ---------- комната ---------- */

export type RoomStatus = 'lobby' | 'active' | 'paused' | 'closed'
export type RoomRole = 'dm' | 'player'
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'kicked' | 'left'
export type HpVisibility = 'exact' | 'band' | 'hidden'

export interface RoomSettings {
  max_players: number
  allow_player_rolls_hidden: boolean
  /** пока ни на что не влияет: видимость хитов задаётся у каждого существа */
  show_enemy_hp: HpVisibility
  /** p2/layers: «Игроки могут рисовать» на карте */
  players_can_draw?: boolean
}

/** Задел под музыку: эндпоинтов пока нет */
export interface AudioTrack {
  id: string
  name: string
  url: string
  loop: boolean
}
export interface SoundboardPad {
  id: string
  label: string
  url: string
  icon: string | null
}
export interface RoomAudioState {
  tracks: AudioTrack[]
  pads: SoundboardPad[]
  track_id: string | null
  playing: boolean
  position_sec: number
  started_at: string | null
  volume: number
}

export interface Room {
  id: string
  name: string
  description: string
  cover_url: string | null
  dm_id: string
  status: RoomStatus
  /** только мастеру и не в room.updated */
  invite_code?: string
  settings: RoomSettings
  seq: number
  active_combat_id: string | null
  /** карта на столе */
  active_map_id?: string | null
  audio: RoomAudioState
  created_at?: string
  updated_at?: string
}

/** Строка списка GET /rooms */
export type RoomListItem = Room & { my_status: MemberStatus; my_role: RoomRole; pending_requests?: number }

export interface RoomMemberView {
  user_id: string
  role: RoomRole
  status: MemberStatus
  room_character_id: string | null
  nickname: string | null
  display_name: string | null
  avatar_url: string | null
  online: boolean
  /** только мастеру */
  source_character_id?: string | null
  /** имя героя в заявке: приходит в событии member.requested */
  character_name?: string | null
}

export interface OnlineUser {
  user_id: string
  label: string
  is_dm: boolean
}

/* ---------- персонажи ---------- */

export interface CharacterCard {
  id: string
  user_id: string | null
  name: string
  avatar_url: string | null
  level: number
  ac: number
  /** пассивная Внимательность; у старых карточек появится при первом изменении */
  passive_perception?: number | null
  hp: { current: number; max: number; temp: number }
  effects: string[]
  /** те же эффекты с id: для DELETE …/effects/{id} */
  effects_detail?: EffectBrief[]
}

export interface EffectBrief {
  id: string
  label: string
  expires: string
  rounds_left: number | null
}

/* ---------- броски ---------- */

/** dm и self видят бросивший и мастер; blind — только мастер, даже бросивший получает noop */
export type RollVisibility = 'public' | 'dm' | 'self' | 'blind'

export interface RollRequest {
  /** «1d20+5», «2d6+1d4+3», можно русскую «к»; до 100 костей */
  expression: string
  label?: string
  mode?: 'adv' | 'dis' | null
  visibility?: RollVisibility
  character_id?: string | null
  /** что бросается: сервер прибавит кости эффектов (Благословение к атаке и спасброску) */
  kind?: 'attack' | 'save' | 'check'
}

export interface RolledDie {
  sides: number
  sign: 1 | -1
  /** итоговые грани всех костей, и отброшенных тоже */
  rolls: number[]
  /** kh/kl/dh/dl: индексы отброшенных костей */
  dropped?: number[]
  /** r/ro: что выпадало до переброса */
  rerolled?: number[][]
  /** прибавочная кость эффекта: «Благословение», «Порча»; знак — в sign */
  source?: string
}

export interface RolledDice {
  expression: string
  dice: RolledDie[]
  modifier: number
  total: number
  mode: 'adv' | 'dis' | null
  /** при adv и dis второй итог; в dice только оставленный бросок */
  discarded_total: number | null
}

export interface DiceStyle {
  body_color: string
  accent_color: string
  number_color: string
}

export interface DiceRollEvent extends RolledDice {
  label: string
  character_id?: string | null
  /** у инициативы */
  combatant_id?: string
  visibility: RollVisibility
  dice_style: DiceStyle
  /** номер события: приходит в ответе POST /rolls */
  seq?: number | null
  /** у события dice.revealed: номер раскрытого броска */
  rolled_seq?: number
}

/** Бросок способности движка: выглядит иначе, отличается полем engine */
export interface EngineRollEvent {
  character_id: string
  label: string
  engine: { dice: string; rolls: number[]; total: number; mode?: 'adv' | 'dis' }
}

export type RollPayload = DiceRollEvent | EngineRollEvent
export const isEngineRoll = (p: RollPayload): p is EngineRollEvent => 'engine' in p

/* ---------- предметы ---------- */

export type ItemKind = 'equipment' | 'magic_item'
export type ItemTarget = 'table' | 'screen' | string

export interface RoomItem {
  id: string
  room_id: string
  holder: 'table' | 'screen'
  kind: ItemKind
  equipment: Equipment | null
  magic_item: MagicItem | null
  /** только мастеру */
  catalog_ref?: string | null
  quantity: number
  notes: string
}

export interface ScreenItemTemplate {
  id: string
  room_id: string
  name: string
  description: string
  image_url: string | null
  base_kind: ItemKind
  base_ref: string | null
  overrides: Record<string, unknown>
  tags: string[]
}

/* ---------- существа ---------- */

export interface CreatureVisibility {
  name: boolean
  image: boolean
  hp: HpVisibility
  ac: boolean
  stats: boolean
  actions: boolean
  description: boolean
}

export interface Modifier {
  /** путь или шаблон: char.ac, char.skills.*.prof */
  target: string
  op: string
  /** выражение движка */
  value: string
  when?: string | null
  priority?: number
  stack_group?: string | null
  note?: string | null
}

export type EffectExpiry = 'never' | 'short_rest' | 'long_rest' | 'turn_start' | 'turn_end' | 'rounds' | 'save_ends'

export interface ActiveEffect {
  id: string
  grant_id: string | null
  label: string
  modifiers: Modifier[]
  expires: EffectExpiry
  rounds_left: number | null
  /** «до успешного спасброска» */
  save_ability?: StatKey | null
  save_dc?: number | null
}

/** Только мастеру */
export interface RoomCreature {
  id: string
  room_id: string
  catalog_ref: string | null
  snapshot: Creature
  display_name: string
  /** «Существо» */
  public_name: string
  image_url: string | null
  hp_current: number
  hp_max: number
  hp_temp: number
  conditions: ActiveEffect[]
  visibility: CreatureVisibility
  /** true: игроки не знают о существе */
  on_screen_only: boolean
  quick_access: boolean
  revision: number
  legendary_actions?: number
  legendary_actions_left?: number
  legendary_resistances?: number
  legendary_resistances_left?: number
  /** призванное: кто призвал, каким заклинанием, кто им управляет */
  summoned_by?: string | null
  summon_spell?: string | null
  controller_id?: string | null
}

/** Счётчики легендарных действий у игрока: только если открыт visibility.actions */
export interface LegendaryView {
  actions: number
  actions_left: number
  resistances: number
  resistances_left: number
}

export type HpBand = 'healthy' | 'bloodied' | 'critical' | 'down'
export type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

/** Игроку; необязательные поля приходят, только если мастер их открыл */
export interface CreaturePlayerView {
  id: string
  /** public_name, пока имя скрыто */
  name: string
  image_url: string | null
  effects: string[]
  hp?: { current: number; max: number; temp: number }
  hp_band?: HpBand
  ac?: number
  stats?: Record<StatKey, number | null>
  speed?: number | null
  size?: string | null
  creature_type?: string | null
  features?: Record<string, string>[] | null
  actions?: Record<string, string>[] | null
  description?: string | null
  legendary?: LegendaryView | null
  effects_detail?: EffectBrief[]
  controller_id?: string | null
}

export type AnyCreature = RoomCreature | CreaturePlayerView
/** У полного вида есть snapshot — так отличаем мастерский от игрового */
export const isFullCreature = (c: AnyCreature): c is RoomCreature => 'snapshot' in c

/* ---------- бой ---------- */

export interface Combatant {
  id: string
  kind: 'character' | 'creature'
  ref_id: string
  /** party снизу, enemies сверху */
  side: 'party' | 'enemies'
  /** место в своём ряду слева направо */
  slot: number
  initiative: number | null
  initiative_bonus: number
  defeated: boolean
  hidden: boolean
  action_used?: boolean
  bonus_used?: boolean
  reaction_used?: boolean
  /** в футах */
  movement_used?: number
  surprised?: boolean
  /** призванное существо: им управляет игрок заклинателя */
  controller_id?: string | null
  summoned_by?: string | null
}

export interface CombatantPatch {
  action_used?: boolean
  bonus_used?: boolean
  reaction_used?: boolean
  movement_used?: number
  /** только мастер */
  surprised?: boolean
  hidden?: boolean
  side?: 'party' | 'enemies'
  slot?: number
  defeated?: boolean
}

export type CombatantView = Combatant & {
  card?: CharacterCard
  creature?: AnyCreature
}

export interface CombatView {
  id: string
  status: 'setup' | 'active' | 'ended'
  round: number
  revision: number
  map_id: string | null
  /** null, если ходит скрытый участник */
  current_combatant_id: string | null
  /** уже в порядке хода */
  combatants: CombatantView[]
}

export interface DamageRoll {
  dice: string
  /** fire, cold, slashing… */
  type?: string | null
}

export type AbilityShort = StatKey

export interface SaveSpec {
  ability: AbilityShort
  dc: number
  half_on_success: boolean
}

export interface SlotSpec {
  level: number
  pool: 'spell' | 'pact'
}

export interface EffectSpec {
  label: string
  modifiers: Modifier[]
  expires: EffectExpiry
  rounds_left: number | null
  concentration: boolean
  save_ability?: StatKey | null
  save_dc?: number | null
}

export interface CombatActionRequest {
  actor_combatant_id: string
  kind?: 'attack' | 'spell' | 'item' | 'ability' | 'other'
  label?: string
  /** до 30; id участников боя, а не персонажей */
  target_ids?: string[]
  attack_bonus?: number | null
  advantage?: 'adv' | 'dis' | null
  /** до 6 */
  damage?: DamageRoll[]
  heal_dice?: string | null
  save?: SaveSpec | null
  slot?: SlotSpec | null
  effect?: EffectSpec | null
  as_reaction?: boolean
  /** что тратит действие; уже потрачено — у игрока 409 */
  uses?: 'action' | 'bonus' | 'reaction'
  /** ручной режим: что выпало на живых кубиках, модификаторы прибавит сервер */
  fixed?: FixedRolls | null
  /** только мастер */
  secret?: boolean
}

export interface FixedRolls {
  /** {combatant_id: натуральный к20} */
  attack?: Record<string, number>
  save?: Record<string, number>
  /** грани костей урона и лечения по порядку */
  damage?: number[]
}

/** POST /combat/{c}/cast и /cast/preview */
export interface CastRequest {
  actor_combatant_id: string
  spell_name: string
  slot_level?: number | null
  pool?: 'spell' | 'pact'
  class_slug?: string | null
  target_ids?: string[]
  ritual?: boolean
  repeat?: boolean
  damage_type?: string | null
  advantage?: 'adv' | 'dis' | null
  projectiles?: Record<string, number>
  mode?: 'auto' | 'manual'
  fixed?: FixedRolls | null
  dc?: number | null
  attack_bonus?: number | null
  secret?: boolean
  summon_ref?: string | null
  summon_count?: number | null
  /** наведение на карте: точка или направление; цели тогда выбирает сервер */
  aim?: AimRequest | null
}

/** Что сервер собирается сделать: ответ spell у cast и cast/preview */
export interface CastPlan {
  status?: 'full' | 'narrative' | 'partial'
  slot_level?: number | null
  pool?: string | null
  class_slug?: string | null
  dc?: number | null
  attack_bonus?: number | null
  spell_mod?: number
  steps?: number
  damage?: { dice: string; type: string | null }[]
  rider_damage?: { dice: string; type: string | null }[]
  heal_dice?: string | null
  temp_hp_dice?: string | null
  projectiles?: { count: number; dice: string; type: string; attack: boolean; shared_roll: boolean } | null
  attack?: string | null
  save?: { ability: StatKey; dc: number; half_on_success: boolean; effect_only?: boolean } | null
  effect?: { label: string } | null
  self_effect?: { label: string } | null
  concentration_label?: string | null
  summons?: Record<string, unknown>[]
  max_targets?: number | null
  notes?: string | null
}

export interface CastPreview {
  spell: CastPlan
  /** фигура на карте и кто под ней */
  aim?: AimInfo | null
  /** high_ground — преимущество за высоту по правилу карты, шанс уже с ним */
  targets: { combatant_id: string; kind: 'attack' | 'save' | 'auto'; chance: number; ac?: number; high_ground?: boolean }[]
}

export interface ConcentrationCheck {
  combatant_id: string
  character_id: string
  dc: number
  damage: number
}

export interface ConcentrationSave {
  combatant_id: string
  dc: number
  roll: RolledDice
  success: boolean
  /** названия снятых эффектов */
  lost: string[]
}

export interface SaveEndsResult {
  combatant_id: string
  effect: string
  roll: RolledDice
  dc: number
  success: boolean
}

export interface CombatTargetResult {
  combatant_id: string
  hit: boolean
  crit: boolean
  saved: boolean
  /** high_ground — преимущество за высоту по правилу карты */
  attack: (RolledDice & { high_ground?: boolean }) | null
  save: RolledDice | null
  damage: { roll: RolledDice; type: string | null; amount?: number; taken?: number | null; source?: string }[]
  healed: number | null
  effect: string | null
  card?: CharacterCard
  creature?: AnyCreature
}

export interface CombatActionResult {
  action_id: string
  actor_combatant_id: string
  kind: string
  label: string
  secret: boolean
  /** дальняя атака (с дальностью или прицелом) или не оружие; нет у старых событий */
  ranged?: boolean
  /** виды урона из запроса — есть и при промахе */
  damage_types?: string[]
  /** явный VFX-пресет анимации */
  vfx?: string
  targets: CombatTargetResult[]
}

/* ---------- ширма (только мастер) ---------- */

export interface ScreenNote {
  id: string
  room_id: string
  title: string
  body: string
  folder: string | null
  pinned: boolean
  order: number
  /** открыта игрокам */
  shared?: boolean
  updated_at?: string
  /** растёт с каждой правкой; пришлите в PATCH — при чужой правке будет 409 */
  revision?: number
}

/** Что игрок получает от общей заметки */
export type SharedNote = Pick<ScreenNote, 'id' | 'title' | 'body' | 'folder' | 'pinned' | 'order'> & { updated_at?: string }

/* ---------- чат и часы ---------- */

export interface ChatMessage {
  id: string
  channel: 'ic' | 'ooc' | 'whisper' | 'emote'
  /** показывать как текст, не как HTML */
  text: string
  /** от чьего имени */
  character_id: string | null
  /** у шёпота */
  to_user_id: string | null
  /** заполняем на клиенте из события */
  seq?: number | null
  ts?: string
  from_user_id?: string | null
  from_label?: string | null
}

export interface RoomClock {
  id: string
  name: string
  /** rounds — сервер сам делает шаг с каждым новым раундом боя */
  kind: 'progress' | 'countdown' | 'rounds'
  segments: number
  filled: number
  /** у countdown: когда закончится */
  ends_at: string | null
  started_at?: string | null
  duration_sec?: number | null
  /** часы только этого боя: снимутся с его окончанием */
  combat_id?: string | null
  visible: boolean
  order: number
}

export interface MapGrid {
  cols: number
  rows: number
  cell_px: number
  offset_x: number
  offset_y: number
}

export interface MapToken {
  id: string
  combatant_id: string | null
  label: string
  image_url: string | null
  col: number
  row: number
  size: number
  hidden: boolean
}

export interface BattleMap {
  id: string
  room_id: string
  name: string
  image_url: string | null
  grid: MapGrid
  tokens: MapToken[]
  walls: Record<string, unknown>[]
  fog: Record<string, unknown>
  revealed: boolean
  quick_access: boolean
}

export type WidgetType =
  | 'notes'
  | 'party'
  | 'initiative'
  | 'creatures'
  | 'quick_items'
  | 'quick_maps'
  | 'dice'
  | 'log'
  | 'soundboard'

export interface DashboardWidget {
  id: string
  type: WidgetType
  x: number
  y: number
  /** x + w не больше 12 */
  w: number
  h: number
  config: Record<string, unknown>
}

/* ---------- снимок и события ---------- */

export interface RoomState {
  seq: number
  room: Room
  me: { user_id: string; role: RoomRole; room_character_id: string | null }
  members: RoomMemberView[]
  characters: CharacterCard[]
  /** у мастера здесь и предметы ширмы: смотрите holder */
  table: RoomItem[]
  creatures: AnyCreature[]
  combat: CombatView | null
  online: OnlineUser[]
}

export interface RoomEventMessage<P = unknown> {
  v: 1
  /** null — сообщение не хранится и не влияет на нумерацию */
  seq: number | null
  type: string
  ts?: string
  actor?: { user_id: string | null; label: string | null }
  payload: P
}

/** Запись общего журнала комнаты: то, что игрокам стоит видеть списком */
export interface RoomLogEntry {
  key: string
  seq: number | null
  ts: string
  type: string
  kind: 'roll' | 'item' | 'combat' | 'member' | 'room'
  text: string
  /** кто сделал: для подписи */
  who?: string | null
  roll?: DiceRollEvent
}

/* ---------- запросы ---------- */

export interface RoomCreateBody {
  name: string
  description?: string
  cover_url?: string | null
  settings?: Partial<RoomSettings>
}
export type RoomPatchBody = Partial<RoomCreateBody>

export interface RoomJoinBody {
  code: string
  character_id: string
}

export interface ItemIssueBody {
  kind: ItemKind
  catalog_ref: string
  quantity?: number
  target?: ItemTarget
  notes?: string
}

export interface CreatureAddBody {
  catalog_ref?: string
  snapshot?: Creature
  count?: number
  display_name?: string
  public_name?: string
  image_url?: string | null
  visibility?: Partial<CreatureVisibility>
  on_screen_only?: boolean
  quick_access?: boolean
}

export interface CreaturePatchBody {
  display_name?: string
  public_name?: string
  image_url?: string | null
  visibility?: Partial<CreatureVisibility>
  quick_access?: boolean
  snapshot?: Creature
}

export interface CombatStartBody {
  character_ids?: string[]
  creature_ids?: string[]
  /** один флаг на всех существ запроса; смешанный состав — через POST /combatants */
  hidden_creatures?: boolean
  map_id?: string | null
}

export interface ContentPreloadBody {
  urls: string[]
  title?: string
  kind?: string
  auto_reveal?: boolean
  timeout_sec?: number
}

/** Ответ POST /media/upload */
export interface UploadResponse {
  url: string
  variants: { original: string; medium: string; low: string }
  path: string
  filename: string
  storage: 'r2' | 'local'
}
