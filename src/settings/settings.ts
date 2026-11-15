/**
 * Настройки в одном месте. Три области:
 *
 * - «Это устройство» (device) — только этот браузер, localStorage;
 * - «Мой профиль» (user) — едут за человеком: хранятся на сервере в
 *   preferences.interface, здесь — их копия для быстрого старта и для гостя;
 * - «Эта комната» — настройки комнаты на сервере, их правит мастер (не здесь).
 *
 * Любое обращение к хранилищу — в try/catch: в приватном режиме или при
 * запрете хранилища настройки живут до перезагрузки.
 *
 * Профиль: изменение сразу применяется и помечается «не отправлено»; мост
 * SettingsSync отправляет его на сервер. Пришёл профиль с сервера — его
 * значения побеждают, кроме ещё не отправленных.
 */
import { useSyncExternalStore } from 'react'

/* ---------- устройство ---------- */

export type DeviceSettings = {
  /** масштаб шрифта интерфейса, 0.85…1.3 */
  fontScale: number
  /** режим производительности: ниже разрешение холста, без погоды и мерцания света */
  performance: boolean
  /** предел кадров в секунду для карты; 0 — без предела */
  maxFps: number
  /** музыка и звуки комнаты («Громкость у меня») */
  musicVolume: number
  /** фон карты: звуки местности (вдобавок к громкости музыки) */
  ambienceVolume: number
  /** звуки интерфейса: кубики */
  interfaceVolume: number
  /** панель партии в комнате развёрнута */
  partyHudOpen: boolean
}

export const DEVICE_DEFAULTS: Readonly<DeviceSettings> = Object.freeze({
  fontScale: 1,
  performance: false,
  maxFps: 0,
  musicVolume: 0.8,
  ambienceVolume: 1,
  interfaceVolume: 0.5,
  partyHudOpen: true,
})

export const FONT_SCALE_MIN = 0.85
export const FONT_SCALE_MAX = 1.3
export const FPS_CHOICES = [0, 120, 60, 30, 20] as const

/* ---------- профиль ---------- */

export type UserSettings = {
  /** меньше движения во всём приложении (вдобавок к системной настройке) */
  reduceMotion: boolean
  /** фоточувствительность: без вспышек и мигания */
  photosensitive: boolean
}

export const USER_DEFAULTS: Readonly<UserSettings> = Object.freeze({
  reduceMotion: false,
  photosensitive: false,
})

/** Как поле профиля называется на сервере (preferences.interface) */
export type ServerInterfacePrefs = { reduce_motion: boolean; photosensitive: boolean }
const SERVER_NAME: Record<keyof UserSettings, keyof ServerInterfacePrefs> = {
  reduceMotion: 'reduce_motion',
  photosensitive: 'photosensitive',
}

/* ---------- ключи хранилища ---------- */

export const DEVICE_KEY = 'vantage.settings.device.v1'
export const USER_KEY = 'vantage.settings.user.v1'

/** Прежние разрозненные ключи: читаются один раз, пока нет общего */
export const LEGACY_KEYS = {
  musicVolume: 'vantage-room-volume',
  ambienceVolume: 'vantage-ambience-volume',
  interfaceVolume: 'vantage-dice-volume',
  partyHudOpen: 'vantage.partyHud.open',
  pingCalm: 'vantage.pings.calm.v1',
} as const

/* ---------- чтение и проверка ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function num(v: unknown, d: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? clamp(n, lo, hi) : d
}

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)

export function sanitizeDevice(raw: unknown): DeviceSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const d = DEVICE_DEFAULTS
  const fps = num(o.maxFps, d.maxFps, 0, 240)
  return {
    fontScale: Math.round(num(o.fontScale, d.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX) * 100) / 100,
    performance: bool(o.performance, d.performance),
    maxFps: fps > 0 && fps < 10 ? 10 : Math.round(fps),
    musicVolume: num(o.musicVolume, d.musicVolume, 0, 1),
    ambienceVolume: num(o.ambienceVolume, d.ambienceVolume, 0, 1),
    interfaceVolume: num(o.interfaceVolume, d.interfaceVolume, 0, 1),
    partyHudOpen: bool(o.partyHudOpen, d.partyHudOpen),
  }
}

export function sanitizeUser(raw: unknown): UserSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    reduceMotion: bool(o.reduceMotion, USER_DEFAULTS.reduceMotion),
    photosensitive: bool(o.photosensitive, USER_DEFAULTS.photosensitive),
  }
}

function getItem(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function setItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // хранилище недоступно: настройка живёт до перезагрузки
  }
}

function parse(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Прежние ключи → настройки устройства (только то, что было записано) */
function legacyDevice(): Partial<DeviceSettings> {
  const out: Partial<DeviceSettings> = {}
  for (const k of ['musicVolume', 'ambienceVolume', 'interfaceVolume'] as const) {
    const raw = getItem(LEGACY_KEYS[k])
    if (raw !== null && Number.isFinite(Number(raw)) && raw.trim() !== '') out[k] = Number(raw)
  }
  const party = getItem(LEGACY_KEYS.partyHudOpen)
  if (party !== null) out.partyHudOpen = party !== '0'
  return out
}

function readDevice(): DeviceSettings {
  const saved = parse(getItem(DEVICE_KEY))
  return sanitizeDevice(saved ?? legacyDevice())
}

type UserCache = { values: UserSettings; dirty: (keyof UserSettings)[] }

function readUser(): UserCache {
  const saved = parse(getItem(USER_KEY)) as { values?: unknown; dirty?: unknown } | null
  if (saved && typeof saved === 'object') {
    const dirty = Array.isArray(saved.dirty) ? saved.dirty.filter((k): k is keyof UserSettings => k === 'reduceMotion' || k === 'photosensitive') : []
    return { values: sanitizeUser(saved.values), dirty }
  }
  // прежний щадящий режим пингов — теперь «фоточувствительность» профиля
  if (getItem(LEGACY_KEYS.pingCalm) === '1') return { values: { ...USER_DEFAULTS, photosensitive: true }, dirty: ['photosensitive'] }
  return { values: { ...USER_DEFAULTS }, dirty: [] }
}

/* ---------- состояние и подписка ---------- */

let device: DeviceSettings | null = null
let user: UserCache | null = null
const listeners = new Set<() => void>()

const dev = (): DeviceSettings => (device ??= readDevice())
const usr = (): UserCache => (user ??= readUser())

function emit() {
  for (const fn of [...listeners]) fn()
}

let storageHooked = false
function hookStorage() {
  if (storageHooked || typeof window === 'undefined') return
  storageHooked = true
  // другая вкладка поменяла настройки
  window.addEventListener('storage', (e) => {
    if (e.key === DEVICE_KEY) device = null
    else if (e.key === USER_KEY) user = null
    else return
    emit()
  })
}

/** Подписка на любые изменения настроек; возвращает отписку */
export function subscribeSettings(fn: () => void): () => void {
  hookStorage()
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Перечитать хранилище (тесты, смена вкладки) */
export function reloadSettings(): void {
  device = null
  user = null
  emit()
}

export const getDeviceSettings = (): DeviceSettings => dev()
export const getUserSettings = (): UserSettings => usr().values

export function setDeviceSettings(patch: Partial<DeviceSettings>): void {
  const next = sanitizeDevice({ ...dev(), ...patch })
  device = next
  setItem(DEVICE_KEY, JSON.stringify(next))
  emit()
}

export function resetDeviceSettings(): void {
  setDeviceSettings({ ...DEVICE_DEFAULTS })
}

/* ---------- профиль: отправка на сервер ---------- */

type Syncer = (patch: Partial<ServerInterfacePrefs>) => Promise<unknown>
let syncer: Syncer | null = null
let flushing: Promise<void> | null = null

function writeUser(cache: UserCache) {
  user = cache
  setItem(USER_KEY, JSON.stringify(cache))
}

export function setUserSettings(patch: Partial<UserSettings>): void {
  const cur = usr()
  const values = sanitizeUser({ ...cur.values, ...patch })
  const changed = (Object.keys(patch) as (keyof UserSettings)[]).filter((k) => k in values)
  writeUser({ values, dirty: [...new Set([...cur.dirty, ...changed])] })
  emit()
  void flushUserSettings()
}

/** Есть ли изменения профиля, ещё не дошедшие до сервера */
export const hasPendingUserSettings = (): boolean => usr().dirty.length > 0

/** Отправить неотправленное. Без входа (нет моста) — ждёт входа */
export function flushUserSettings(): Promise<void> {
  // уже отправляем — после этого отправить ещё раз (вдруг появились новые изменения или мост)
  if (flushing) return flushing.then(() => flushUserSettings())
  const run = async () => {
    const cur = usr()
    if (!syncer || cur.dirty.length === 0) return
    const sent = { ...cur.values }
    const keys = [...cur.dirty]
    const body: Partial<ServerInterfacePrefs> = {}
    for (const k of keys) body[SERVER_NAME[k]] = sent[k]
    try {
      await syncer(body)
    } catch {
      return // останется «не отправлено»; повторим при следующем изменении или входе
    }
    const now = usr()
    // за время запроса значение могло снова поменяться — тогда оно остаётся грязным
    writeUser({ values: now.values, dirty: now.dirty.filter((k) => !keys.includes(k) || now.values[k] !== sent[k]) })
  }
  flushing = run().finally(() => {
    flushing = null
  })
  return flushing
}

/** Мост к серверу: SettingsSync ставит его после входа и снимает при выходе */
export function setUserSettingsSyncer(fn: Syncer | null): void {
  syncer = fn
  if (fn) void flushUserSettings()
}

/** Профиль пришёл с сервера: его значения, кроме ещё не отправленных */
export function hydrateUserSettings(server: Partial<ServerInterfacePrefs> | null | undefined): void {
  const cur = usr()
  const values = { ...cur.values }
  for (const k of Object.keys(SERVER_NAME) as (keyof UserSettings)[]) {
    if (cur.dirty.includes(k)) continue
    const v = server?.[SERVER_NAME[k]]
    values[k] = typeof v === 'boolean' ? v : USER_DEFAULTS[k]
  }
  const same = (Object.keys(values) as (keyof UserSettings)[]).every((k) => values[k] === cur.values[k])
  writeUser({ values, dirty: cur.dirty })
  if (!same) emit()
}

/* ---------- хуки ---------- */

export function useDeviceSettings(): DeviceSettings {
  return useSyncExternalStore(subscribeSettings, getDeviceSettings, () => DEVICE_DEFAULTS)
}

export function useUserSettings(): UserSettings {
  return useSyncExternalStore(subscribeSettings, getUserSettings, () => USER_DEFAULTS)
}
