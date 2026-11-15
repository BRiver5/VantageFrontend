import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEVICE_DEFAULTS,
  DEVICE_KEY,
  LEGACY_KEYS,
  USER_DEFAULTS,
  USER_KEY,
  flushUserSettings,
  getDeviceSettings,
  getUserSettings,
  hasPendingUserSettings,
  hydrateUserSettings,
  reloadSettings,
  resetDeviceSettings,
  sanitizeDevice,
  setDeviceSettings,
  setUserSettings,
  setUserSettingsSyncer,
  subscribeSettings,
} from './settings'
import { isPhotosensitive, lightsStill, prefersReducedMotion } from './motion'
import { getDiceVolume, setDiceVolume } from '../dice/diceSounds'
import { ambienceVolume, roomVolume } from '../maps/sounds/prefs'
import { getPingCalmSetting, isPingCalm, setPingCalmSetting } from '../maps/pingSettings'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  setUserSettingsSyncer(null)
  reloadSettings()
})

describe('defaults', () => {
  it('empty storage gives defaults', () => {
    expect(getDeviceSettings()).toEqual(DEVICE_DEFAULTS)
    expect(getUserSettings()).toEqual(USER_DEFAULTS)
    expect(prefersReducedMotion()).toBe(false)
    expect(isPhotosensitive()).toBe(false)
  })

  it('broken or out-of-range values fall back or clamp', () => {
    storage.setItem(DEVICE_KEY, '{not json')
    reloadSettings()
    expect(getDeviceSettings()).toEqual(DEVICE_DEFAULTS)
    expect(sanitizeDevice({ fontScale: 9, musicVolume: -1, maxFps: 3, performance: 'yes' })).toMatchObject({ fontScale: 1.3, musicVolume: 0, maxFps: 10, performance: false })
  })

  it('works when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
    })
    reloadSettings()
    expect(getDeviceSettings()).toEqual(DEVICE_DEFAULTS)
    setDeviceSettings({ performance: true })
    expect(getDeviceSettings().performance).toBe(true)
  })
})

describe('device scope', () => {
  it('persists and survives reload', () => {
    setDeviceSettings({ fontScale: 1.15, maxFps: 30, performance: true })
    reloadSettings()
    expect(getDeviceSettings()).toMatchObject({ fontScale: 1.15, maxFps: 30, performance: true })
    expect(JSON.parse(storage.getItem(DEVICE_KEY)!).fontScale).toBe(1.15)
  })

  it('reset returns defaults', () => {
    setDeviceSettings({ musicVolume: 0.1 })
    resetDeviceSettings()
    expect(getDeviceSettings()).toEqual(DEVICE_DEFAULTS)
  })

  it('migrates old scattered keys once', () => {
    storage.setItem(LEGACY_KEYS.musicVolume, '0.3')
    storage.setItem(LEGACY_KEYS.ambienceVolume, '0.6')
    storage.setItem(LEGACY_KEYS.interfaceVolume, '0.9')
    storage.setItem(LEGACY_KEYS.partyHudOpen, '0')
    reloadSettings()
    expect(getDeviceSettings()).toMatchObject({ musicVolume: 0.3, ambienceVolume: 0.6, interfaceVolume: 0.9, partyHudOpen: false })
    setDeviceSettings({ musicVolume: 0.5 })
    storage.setItem(LEGACY_KEYS.musicVolume, '0.1')
    reloadSettings()
    expect(getDeviceSettings().musicVolume).toBe(0.5)
  })

  it('old modules read and write through the settings', () => {
    setDiceVolume(0.25)
    expect(getDeviceSettings().interfaceVolume).toBe(0.25)
    expect(getDiceVolume()).toBe(0.25)
    setDeviceSettings({ musicVolume: 0.4, ambienceVolume: 0.7 })
    expect(roomVolume()).toBe(0.4)
    expect(ambienceVolume()).toBe(0.7)
  })

  it('performance mode stills the lights', () => {
    expect(lightsStill()).toBe(false)
    setDeviceSettings({ performance: true })
    expect(lightsStill()).toBe(true)
  })
})

describe('subscription', () => {
  it('notifies on every change until unsubscribed', () => {
    const fn = vi.fn()
    const off = subscribeSettings(fn)
    setDeviceSettings({ performance: true })
    setUserSettings({ reduceMotion: true })
    expect(fn).toHaveBeenCalledTimes(2)
    off()
    setDeviceSettings({ performance: false })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('snapshot keeps identity until something changes', () => {
    const a = getDeviceSettings()
    expect(getDeviceSettings()).toBe(a)
    setDeviceSettings({ maxFps: 60 })
    expect(getDeviceSettings()).not.toBe(a)
  })
})

describe('user scope', () => {
  it('is stored apart from device settings', () => {
    setUserSettings({ reduceMotion: true })
    setDeviceSettings({ performance: true })
    expect(JSON.parse(storage.getItem(USER_KEY)!).values.reduceMotion).toBe(true)
    expect(JSON.parse(storage.getItem(DEVICE_KEY)!)).not.toHaveProperty('reduceMotion')
    expect(getDeviceSettings()).not.toHaveProperty('reduceMotion')
    expect(getUserSettings()).not.toHaveProperty('performance')
  })

  it('reduce motion and photosensitive drive the shared helpers', () => {
    setUserSettings({ reduceMotion: true })
    expect(prefersReducedMotion()).toBe(true)
    expect(isPhotosensitive()).toBe(true) // меньше движения — значит и без вспышек
    setUserSettings({ reduceMotion: false, photosensitive: true })
    expect(prefersReducedMotion()).toBe(false)
    expect(isPingCalm()).toBe(true)
  })

  it('ping calm mode is the photosensitive setting', () => {
    setPingCalmSetting(true)
    expect(getUserSettings().photosensitive).toBe(true)
    expect(getPingCalmSetting()).toBe(true)
  })

  it('old ping calm key becomes photosensitive and waits for sync', () => {
    storage.setItem(LEGACY_KEYS.pingCalm, '1')
    reloadSettings()
    expect(getUserSettings().photosensitive).toBe(true)
    expect(hasPendingUserSettings()).toBe(true)
  })

  it('sends changes to the server once a syncer is set', async () => {
    const sent: unknown[] = []
    setUserSettings({ reduceMotion: true })
    expect(hasPendingUserSettings()).toBe(true)
    setUserSettingsSyncer(async (p) => void sent.push(p))
    await flushUserSettings()
    expect(sent).toEqual([{ reduce_motion: true }])
    expect(hasPendingUserSettings()).toBe(false)
  })

  it('failed sync keeps the change pending', async () => {
    setUserSettingsSyncer(async () => {
      throw new Error('offline')
    })
    setUserSettings({ photosensitive: true })
    await flushUserSettings()
    expect(hasPendingUserSettings()).toBe(true)
    expect(getUserSettings().photosensitive).toBe(true)
  })

  it('server values win except pending ones', () => {
    hydrateUserSettings({ reduce_motion: true, photosensitive: true })
    expect(getUserSettings()).toEqual({ reduceMotion: true, photosensitive: true })
    setUserSettings({ photosensitive: false }) // без моста — ждёт отправки
    hydrateUserSettings({ reduce_motion: false, photosensitive: true })
    expect(getUserSettings()).toEqual({ reduceMotion: false, photosensitive: false })
  })

  it('missing server block means defaults', () => {
    setUserSettingsSyncer(async () => undefined)
    hydrateUserSettings({ reduce_motion: true, photosensitive: false })
    hydrateUserSettings(undefined)
    expect(getUserSettings()).toEqual(USER_DEFAULTS)
  })
})
