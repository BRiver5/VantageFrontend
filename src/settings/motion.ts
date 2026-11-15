/**
 * Единая проверка «меньше движения» для всего приложения: системная просьба
 * (prefers-reduced-motion) ИЛИ настройка профиля. Все проверки движения в
 * коде идут через prefersReducedMotion(), а не через matchMedia напрямую.
 *
 * Фоточувствительность (щадящий режим): без вспышек и мигания — включена в
 * профиле или следует из «меньше движения».
 */
import { useSyncExternalStore } from 'react'
import { getDeviceSettings, getUserSettings, subscribeSettings } from './settings'

const osListeners = new Set<() => void>()
let motionQuery: MediaQueryList | null | undefined

function osReducedMotion(): boolean {
  if (motionQuery === undefined) {
    try {
      motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
      motionQuery?.addEventListener?.('change', () => osListeners.forEach((fn) => fn()))
    } catch {
      motionQuery = null
    }
  }
  return !!motionQuery?.matches
}

/** система просит меньше движения (без учёта настройки) */
export const systemPrefersReducedMotion = (): boolean => osReducedMotion()

/** меньше движения: система или настройка профиля */
export function prefersReducedMotion(): boolean {
  return getUserSettings().reduceMotion || osReducedMotion()
}

/** щадящий режим: фоточувствительность или меньше движения */
export function isPhotosensitive(): boolean {
  return getUserSettings().photosensitive || prefersReducedMotion()
}

/** режим производительности: ниже разрешение холста, без погоды и живого света */
export const isPerformanceMode = (): boolean => getDeviceSettings().performance

/** свет на карте стоит: щадящий режим или производительность */
export const lightsStill = (): boolean => isPhotosensitive() || isPerformanceMode()

function subscribe(fn: () => void): () => void {
  osReducedMotion()
  osListeners.add(fn)
  const off = subscribeSettings(fn)
  return () => {
    osListeners.delete(fn)
    off()
  }
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}

export function usePhotosensitive(): boolean {
  return useSyncExternalStore(subscribe, isPhotosensitive, () => false)
}

/** подписка с учётом системной настройки — для внешних хранилищ */
export const subscribeMotion = subscribe
