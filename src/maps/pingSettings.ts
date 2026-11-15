/**
 * Щадящий режим пингов — это «фоточувствительность» из настроек профиля
 * (src/settings). Включён сам или если просили меньше движения (система
 * или профиль). Модуль оставлен ради прежних импортов.
 */
import { useSyncExternalStore } from 'react'
import { getUserSettings, setUserSettings } from '../settings/settings'
import { isPhotosensitive, prefersReducedMotion as reducedMotion, subscribeMotion } from '../settings/motion'

/** прежний ключ localStorage: переносится в настройки при первом чтении */
export const PING_CALM_KEY = 'vantage.pings.calm.v1'

/** включено вручную (без учёта «меньше движения») */
export function getPingCalmSetting(): boolean {
  return getUserSettings().photosensitive
}

export function setPingCalmSetting(on: boolean): void {
  setUserSettings({ photosensitive: on })
}

/** действующий режим: фоточувствительность или меньше движения */
export function isPingCalm(): boolean {
  return isPhotosensitive()
}

/** меньше движения: система или настройка профиля */
export const prefersReducedMotion = (): boolean => reducedMotion()

/** [ручная настройка, действующий режим] */
export function usePingCalm(): [boolean, boolean] {
  const manual = useSyncExternalStore(subscribeMotion, getPingCalmSetting, () => false)
  const active = useSyncExternalStore(subscribeMotion, isPingCalm, () => false)
  return [manual, active]
}
