/**
 * Личная громкость звуков местности: «Громкость у меня» из плеера комнаты
 * (vantage-room-volume) × «Фон карты» (vantage-ambience-volume). Меняются —
 * событие vantage-volume (и storage из другой вкладки).
 */
const ROOM_KEY = 'vantage-room-volume'
const AMB_KEY = 'vantage-ambience-volume'
export const VOLUME_EVENT = 'vantage-volume'

const read = (key: string, d: number) => {
  try {
    const raw = localStorage.getItem(key)
    const v = raw === null ? d : Number(raw)
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d
  } catch {
    return d
  }
}

export const roomVolume = () => read(ROOM_KEY, 0.8)
export const ambienceVolume = () => read(AMB_KEY, 1)

export function setAmbienceVolume(v: number) {
  try {
    localStorage.setItem(AMB_KEY, String(v))
  } catch {
    /* приватный режим */
  }
  window.dispatchEvent(new Event(VOLUME_EVENT))
}

/** подписка на смену личной громкости */
export function onVolumeChange(fn: () => void): () => void {
  window.addEventListener(VOLUME_EVENT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(VOLUME_EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}
