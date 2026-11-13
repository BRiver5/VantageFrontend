/**
 * Щадящий режим пингов: настройка клиента в localStorage. Включён сам —
 * или если система просит меньше движения (prefers-reduced-motion).
 */
import { useSyncExternalStore } from 'react'

export const PING_CALM_KEY = 'vantage.pings.calm.v1'

const listeners = new Set<() => void>()
let stored: boolean | null = null

function readStored(): boolean {
  try {
    return localStorage.getItem(PING_CALM_KEY) === '1'
  } catch {
    return false
  }
}

let motionQuery: MediaQueryList | null | undefined
function reducedMotion(): boolean {
  if (motionQuery === undefined) {
    try {
      motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
      motionQuery?.addEventListener?.('change', () => listeners.forEach((fn) => fn()))
    } catch {
      motionQuery = null
    }
  }
  return !!motionQuery?.matches
}

/** включено вручную (без учёта системы) */
export function getPingCalmSetting(): boolean {
  return (stored ??= readStored())
}

export function setPingCalmSetting(on: boolean): void {
  stored = on
  try {
    if (on) localStorage.setItem(PING_CALM_KEY, '1')
    else localStorage.removeItem(PING_CALM_KEY)
  } catch {
    // хранилище недоступно: настройка живёт до перезагрузки
  }
  listeners.forEach((fn) => fn())
}

/** действующий режим: ручная настройка или системная просьба о меньшем движении */
export function isPingCalm(): boolean {
  return getPingCalmSetting() || reducedMotion()
}

/** системная просьба о меньшем движении */
export const prefersReducedMotion = (): boolean => reducedMotion()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PING_CALM_KEY) return
    stored = null
    fn()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

/** [ручная настройка, действующий режим] */
export function usePingCalm(): [boolean, boolean] {
  const manual = useSyncExternalStore(subscribe, getPingCalmSetting, () => false)
  const active = useSyncExternalStore(subscribe, isPingCalm, () => false)
  return [manual, active]
}
