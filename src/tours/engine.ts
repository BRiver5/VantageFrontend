/**
 * Машина состояний тура без DOM. Шаг сначала «разрешается» (resolving):
 * оверлей выполняет действие «до шага» и ищет якорь, затем сообщает found.
 * Нет якоря — шаг пропускается в ту же сторону, куда шли.
 */
import type { TourProgress } from './types'

export type RunPhase =
  /** ищем якорь шага index */
  | 'resolving'
  | 'showing'
  /** дошли до конца — тур пройден */
  | 'done'
  /** закрыли посреди — сохраняем шаг */
  | 'closed'
  /** ни одного шага не нашлось: тур здесь не к месту, прогресс не трогаем */
  | 'empty'

export interface TourRun {
  tourId: string
  total: number
  index: number
  dir: 1 | -1
  phase: RunPhase
  /** последний показанный шаг: туда возвращаемся, если назад идти некуда */
  lastShown: number | null
  skipped: number[]
}

export type RunAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'resolved'; found: boolean }
  | { type: 'close' }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Начать тур: с шага сохранённого прогресса, если тур был прерван */
export function startRun(tourId: string, total: number, progress?: TourProgress | null): TourRun | null {
  if (total <= 0) return null
  const at = progress?.status === 'in_progress' ? clamp(Math.floor(progress.step) || 0, 0, total - 1) : 0
  return { tourId, total, index: at, dir: 1, phase: 'resolving', lastShown: null, skipped: [] }
}

export const isFinished = (run: TourRun): boolean => run.phase === 'done' || run.phase === 'closed' || run.phase === 'empty'

export function stepRun(run: TourRun, action: RunAction): TourRun {
  if (isFinished(run)) return run
  switch (action.type) {
    case 'next':
      if (run.phase !== 'showing') return run
      if (run.index >= run.total - 1) return { ...run, phase: 'done' }
      return { ...run, index: run.index + 1, dir: 1, phase: 'resolving' }
    case 'prev':
      if (run.phase !== 'showing' || run.index <= 0) return run
      return { ...run, index: run.index - 1, dir: -1, phase: 'resolving' }
    case 'close':
      return { ...run, phase: 'closed' }
    case 'resolved': {
      if (run.phase !== 'resolving') return run
      if (action.found) {
        return { ...run, phase: 'showing', lastShown: run.index, skipped: run.skipped.filter((i) => i !== run.index) }
      }
      const skipped = run.skipped.includes(run.index) ? run.skipped : [...run.skipped, run.index]
      const nextIndex = run.index + run.dir
      if (nextIndex >= run.total) return { ...run, skipped, phase: run.lastShown === null ? 'empty' : 'done' }
      if (nextIndex < 0) {
        // назад идти некуда: остаёмся на последнем показанном шаге
        if (run.lastShown !== null) return { ...run, skipped, index: run.lastShown, dir: 1, phase: 'showing' }
        return run.total > 1 ? { ...run, skipped, index: 1, dir: 1 } : { ...run, skipped, phase: 'empty' }
      }
      return { ...run, skipped, index: nextIndex }
    }
  }
}

/** Что сохранить после тура; null — ничего */
export function progressOf(run: TourRun): Pick<TourProgress, 'status' | 'step'> | null {
  if (run.phase === 'done') return { status: 'completed', step: run.total }
  if (run.phase === 'closed') return { status: 'in_progress', step: run.index }
  return null
}

export const canGoBack = (run: TourRun): boolean => run.phase === 'showing' && run.index > 0
export const isLastStep = (run: TourRun): boolean => run.index >= run.total - 1
