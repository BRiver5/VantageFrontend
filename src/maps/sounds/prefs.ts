/**
 * Личная громкость звуков местности: «Музыка» (громкость комнаты у меня) ×
 * «Фон карты». Обе живут в настройках устройства (src/settings).
 */
import { getDeviceSettings, setDeviceSettings, subscribeSettings } from '../../settings/settings'

export const roomVolume = () => getDeviceSettings().musicVolume
export const ambienceVolume = () => getDeviceSettings().ambienceVolume

export function setAmbienceVolume(v: number) {
  setDeviceSettings({ ambienceVolume: v })
}

/** подписка на смену личной громкости (и из другой вкладки) */
export function onVolumeChange(fn: () => void): () => void {
  return subscribeSettings(fn)
}
