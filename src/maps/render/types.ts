import type { HealthView } from '../../rooms/health'
import type { MapVfx, Pt } from '../types'
import type { PingKind } from '../pings'
import type { RulerOverlay } from './ruler'

export interface MapOverlays {
  /** досягаемые клетки и их стоимость */
  reach?: Map<string, number> | null
  /** путь под курсором: центры клеток */
  path?: Pt[] | null
  /** фигура наведения (от сервера или своя до ответа) */
  aim?: { polygon: Pt[]; color: string; origin?: Pt; ok: boolean } | null
  /** отношение токенов под фигурой */
  relations?: Record<string, 'enemy' | 'ally' | 'self' | 'neutral'>
  /** шанс над целью */
  chances?: Record<string, number>
  selected?: string | null
  picked?: string[]
  /** чужие перетаскивания: token_id → точка */
  drags?: Record<string, Pt>
  /** конструктор: показывать стены, свет, сетку ярче */
  editor?: boolean
  /** черновик стены в конструкторе */
  draft?: Pt[] | null
  /** конструктор: высоты пола числами и цветом */
  heights?: boolean
  /** черновик — замкнутый контур (зона) */
  closeDraft?: boolean
  /** предметы, до которых можно дотянуться: пульсируют */
  reachItems?: string[]
  /** чужие шаблоны наведения: бледно */
  ghosts?: { polygon: Pt[]; color: string }[]
  /** линейка или маршрут перетаскивания с ценой и атаками по возможности */
  ruler?: RulerOverlay | null
  /** p1/hud: мои цели (id жетонов) — прицел на жетоне */
  targets?: readonly string[]
  /** p1/hud: рамка выделения целей */
  targetBox?: { a: Pt; b: Pt } | null
  /** здоровье под жетонами: token_id → вид для зрителя (игроку о врагах — только состояние) */
  health?: Record<string, HealthView>
  /** жетон того, чей сейчас ход */
  turn?: string | null
  /** p2/editor: выбрано несколько объектов (id) */
  multi?: readonly string[]
  /** p2/editor: рамка выбора в конструкторе */
  selectBox?: { a: Pt; b: Pt } | null
}

export interface MapViewer {
  isDm: boolean
  /** жетоны, чьими глазами смотрим (игрок — свои) */
  eyes: string[]
  /** мастер «глазами игрока» */
  asPlayer?: boolean
}

export interface MapCanvasHandle {
  /** экран → карта */
  toMap: (clientX: number, clientY: number) => Pt
  centerOn: (p: Pt) => void
  ping: (p: Pt, color?: string, kind?: PingKind) => void
  /** плавно перевести камеру в точку; zoom — масштаб камеры (как у мастера) */
  panTo: (p: Pt, zoom?: number | null) => void
  /** текущий масштаб камеры */
  zoom: () => number
  vfx: (v: MapVfx, at: (combatantId: string) => Pt | null) => void
  /** разовый пресет в точке (зона легла, предмет упал) */
  effect: (presetId: string, p: Pt, size?: number) => void
  /** анимировать ход по клеткам */
  walk: (tokenId: string, path: Pt[]) => void
}

export interface FloatText {
  x: number
  y: number
  text: string
  color: string
  life: number
}

export interface Ping {
  p: Pt
  t0: number
  color: string
  /** вид пинга; нет — обычный */
  kind?: PingKind
}

/** камера: сдвиг и масштаб */
export interface View {
  x: number
  y: number
  k: number
}

/** загруженная картинка или null, пока грузится */
export type ImgFn = (url: string | null | undefined) => HTMLImageElement | null
