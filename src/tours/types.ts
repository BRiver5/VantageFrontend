/**
 * Туры по интерфейсу — это данные: шаги с якорем `[data-tour="…"]`, текстом и
 * действием «до шага» (открыть створку, нажать инструмент). Движок (engine.ts)
 * про DOM не знает, оверлей (TourOverlay.tsx) ищет якоря и подсвечивает их.
 */

/** Кому тур полезен: мастеру, игроку или всем */
export type TourAudience = 'gm' | 'player' | 'all'

/** Где тур может идти: на страницах сайта, в комнате, в комнате мастера */
export type TourContextId = 'site' | 'room' | 'room-gm'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

/** Что сделать перед шагом. Селекторы — обычный CSS, обычно `[data-tour="…"]` */
export type TourAction =
  /** нажать элемент, если он есть; unless — не нажимать, если этот селектор уже на экране */
  | { click: string; unless?: string }
  /** перейти по адресу сайта */
  | { navigate: string }

export interface TourStep {
  /** якорь шага; без него — окно по центру экрана */
  selector?: string
  title: string
  text: string
  image?: { src: string; alt: string }
  placement?: TourPlacement
  before?: TourAction[]
  /** шаг не нужен, если на экране есть этот селектор (например, уже открыт конструктор) */
  skipIf?: string
}

export interface Tour {
  id: string
  title: string
  /** одна строка в списке туров */
  summary: string
  audience: TourAudience
  context: TourContextId
  steps: TourStep[]
}

export type TourStatus = 'offered' | 'in_progress' | 'completed'

export interface TourProgress {
  status: TourStatus
  /** in_progress: с какого шага продолжить */
  step: number
  /** ISO-время последнего изменения: по нему сливаются локальная и серверная копии */
  updated_at?: string | null
}

export type ProgressMap = Record<string, TourProgress>
