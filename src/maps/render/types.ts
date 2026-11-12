import type { MapVfx, Pt } from '../types'

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
  ping: (p: Pt, color?: string) => void
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
}

/** камера: сдвиг и масштаб */
export interface View {
  x: number
  y: number
  k: number
}

/** загруженная картинка или null, пока грузится */
export type ImgFn = (url: string | null | undefined) => HTMLImageElement | null
