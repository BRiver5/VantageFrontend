/**
 * Состояние туров на всё приложение: открыт ли список, идущий тур,
 * предложение пройти тур и прогресс. Модульный стор — кнопкам запуска
 * (шапка стола, боковое меню) не нужен провайдер, достаточно openToursPanel().
 */
import { useSyncExternalStore } from 'react'
import { tourById } from './content'
import { contextReady } from './dom'
import { isFinished, progressOf, startRun, stepRun, type RunAction, type TourRun } from './engine'
import { ProgressStore, type KeyValueStorage } from './progress'

export interface TourUi {
  panel: boolean
  run: TourRun | null
  /** id тура, который сейчас предлагаем пройти */
  offer: string | null
  /** короткое сообщение после тура: «пройден» или «здесь нечего показать» */
  notice: string | null
}

function safeStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const progressStore = new ProgressStore(safeStorage())

let ui: TourUi = { panel: false, run: null, offer: null, notice: null }
const listeners = new Set<() => void>()
let navigateFn: (to: string) => void = (to) => {
  location.assign(to)
}

function setUi(patch: Partial<TourUi>): void {
  ui = { ...ui, ...patch }
  for (const fn of listeners) fn()
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const getTourUi = (): TourUi => ui

export function useTourUi(): TourUi {
  return useSyncExternalStore(subscribe, getTourUi, getTourUi)
}

export function useTourProgress() {
  return useSyncExternalStore(progressStore.subscribe, () => progressStore.snapshot, () => progressStore.snapshot)
}

/** Навигация роутера: туры сайта из комнаты сначала уводят на главную */
export function setTourNavigator(fn: (to: string) => void): void {
  navigateFn = fn
}

export const tourNavigate = (to: string): void => navigateFn(to)

export function openToursPanel(): void {
  setUi({ panel: true, offer: null })
}

export function closeToursPanel(): void {
  setUi({ panel: false })
}

/** Запустить тур; fresh — с начала, даже если он был прерван */
export function startTour(id: string, fresh = false): boolean {
  const tour = tourById(id)
  if (!tour) return false
  if (ui.run) finishRun(stepRun(ui.run, { type: 'close' }))
  if (tour.context === 'site' && !contextReady('site', location.pathname)) navigateFn('/')
  const run = startRun(tour.id, tour.steps.length, fresh ? null : progressStore.get(tour.id))
  setUi({ run, panel: false, offer: null, notice: null })
  return run !== null
}

function finishRun(run: TourRun): void {
  const saved = progressOf(run)
  if (saved) progressStore.set(run.tourId, saved)
  const title = tourById(run.tourId)?.title ?? ''
  const notice =
    run.phase === 'done'
      ? `Тур «${title}» пройден`
      : run.phase === 'empty'
        ? `«${title}»: здесь пока нечего показать. Откройте нужный экран и запустите тур снова.`
        : null
  setUi({ run: null, notice })
}

export function clearTourNotice(): void {
  if (ui.notice) setUi({ notice: null })
}

export function dispatchTour(action: RunAction): void {
  if (!ui.run) return
  const next = stepRun(ui.run, action)
  if (next === ui.run) return
  if (isFinished(next)) finishRun(next)
  else setUi({ run: next })
}

/** Ненавязчиво предложить тур — один раз за всё время */
export function offerTour(id: string): void {
  if (ui.run || ui.panel || ui.offer || progressStore.get(id)) return
  progressStore.markOffered(id)
  setUi({ offer: id })
}

export function dismissOffer(): void {
  setUi({ offer: null })
}
