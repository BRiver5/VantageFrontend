/**
 * Погода сцены: дождь, снег, туман, пепел, искры, листья. Частицы живут в
 * пикселях карты внутри видимой рамки и заворачиваются по краям (как тор):
 * ни рождения, ни смерти, плотность ровная при любом пане камеры. Пул —
 * типизированные массивы с потолком WEATHER_CAP, в кадре ничего не
 * создаётся. Без React и canvas: проверяется тестами.
 */
import type { MapWeather, WeatherKind } from './types'

export type WeatherLook = 'streak' | 'flake' | 'blob' | 'dust' | 'ember' | 'leaf'

export interface WeatherSpec {
  label: string
  look: WeatherLook
  /** частиц на миллион экранных пикселей при силе 1 */
  density: number
  /** скорость падения, px карты/с на клетку 70 px: [мин, макс] */
  fall: [number, number]
  /** как сильно ветер сносит: 0 — никак, 1 — со скоростью ветра */
  windK: number
  /** покачивание поперёк: амплитуда px/с и частота рад/с */
  sway: number
  swayHz: number
  /** размер, px на клетку 70 px */
  size: [number, number]
  /** цвета: светлый и тёмный вариант */
  colors: [string, string]
  alpha: number
}

export const WEATHER: Record<Exclude<WeatherKind, 'none'>, WeatherSpec> = {
  rain: { label: 'Дождь', look: 'streak', density: 520, fall: [620, 900], windK: 0.55, sway: 0, swayHz: 0, size: [0.8, 1.3], colors: ['rgba(190, 215, 255, 0.55)', 'rgba(140, 170, 220, 0.4)'], alpha: 1 },
  snow: { label: 'Снег', look: 'flake', density: 300, fall: [40, 90], windK: 0.35, sway: 26, swayHz: 1.3, size: [1.4, 3.4], colors: ['rgba(255, 255, 255, 0.9)', 'rgba(220, 232, 255, 0.7)'], alpha: 1 },
  fog: { label: 'Туман', look: 'blob', density: 14, fall: [4, 10], windK: 0.25, sway: 6, swayHz: 0.2, size: [110, 190], colors: ['rgba(214, 220, 228, 1)', 'rgba(190, 198, 210, 1)'], alpha: 0.16 },
  ash: { label: 'Пепел', look: 'dust', density: 240, fall: [18, 46], windK: 0.4, sway: 18, swayHz: 0.8, size: [1, 2.4], colors: ['rgba(120, 116, 112, 0.85)', 'rgba(70, 66, 64, 0.75)'], alpha: 1 },
  embers: { label: 'Искры', look: 'ember', density: 120, fall: [-60, -24], windK: 0.45, sway: 22, swayHz: 1.6, size: [1, 2.2], colors: ['rgba(255, 190, 90, 0.95)', 'rgba(255, 110, 40, 0.85)'], alpha: 1 },
  leaves: { label: 'Листья', look: 'leaf', density: 40, fall: [30, 60], windK: 0.7, sway: 40, swayHz: 0.9, size: [3, 5.5], colors: ['rgba(196, 120, 44, 0.9)', 'rgba(128, 84, 36, 0.9)'], alpha: 1 },
}

export const WEATHER_KINDS: WeatherKind[] = ['none', 'rain', 'snow', 'fog', 'ash', 'embers', 'leaves']
export const weatherLabel = (k: WeatherKind) => (k === 'none' ? 'Ясно' : WEATHER[k].label)

export const WEATHER_CAP = 900
/** скорость ветра при силе 1, px карты/с на клетку 70 px */
export const WIND_MAX = 420

export const NO_WEATHER: MapWeather = { kind: 'none', intensity: 0, wind_deg: 90, wind: 0 }

/** погода идёт: вид не «ясно» и сила больше нуля */
export const isWeatherOn = (w: MapWeather | null | undefined): w is MapWeather => !!w && w.kind !== 'none' && w.kind in WEATHER && w.intensity > 0

/**
 * Сколько частиц держать: по плотности вида, силе и площади экрана; щадящий
 * режим — треть. Никогда больше потолка.
 */
export function weatherCount(kind: WeatherKind, intensity: number, screenArea: number, calm = false): number {
  if (kind === 'none' || !(kind in WEATHER)) return 0
  const k = Math.max(0, Math.min(1, intensity))
  const n = (WEATHER[kind].density * k * Math.max(0, screenArea)) / 1e6
  return Math.min(WEATHER_CAP, Math.round(n * (calm ? 0.35 : 1)))
}

/** снос ветром, px карты/с: по направлению и силе, с поправкой вида */
export function windDrift(spec: WeatherSpec, w: Pick<MapWeather, 'wind_deg' | 'wind'>, unit: number, out: { x: number; y: number }) {
  const a = ((w.wind_deg ?? 0) * Math.PI) / 180
  const s = Math.max(0, Math.min(1, w.wind ?? 0)) * WIND_MAX * spec.windK * unit
  out.x = Math.cos(a) * s
  out.y = Math.sin(a) * s
  return out
}

/** v в отрезок [lo, lo + size): заворот по краю рамки */
export function wrap(v: number, lo: number, size: number): number {
  if (size <= 0) return lo
  const d = (v - lo) % size
  return lo + (d < 0 ? d + size : d)
}

/** рамка карты, где идёт погода: видимое ∩ карта */
export interface WeatherRect {
  x: number
  y: number
  w: number
  h: number
}

/** Пул частиц погоды */
export class WeatherField {
  readonly cap: number
  n = 0
  kind: WeatherKind = 'none'
  readonly x: Float32Array
  readonly y: Float32Array
  /** скорость падения частицы (своя) */
  readonly fall: Float32Array
  readonly size: Float32Array
  /** фаза покачивания и мерцания */
  readonly phase: Float32Array
  /** 0 или 1: светлый или тёмный цвет */
  readonly tone: Uint8Array
  t = 0
  /** скорость по оси последнего шага — для длины штриха дождя */
  vx = 0
  vy = 0
  private drift = { x: 0, y: 0 }
  private rnd: () => number

  constructor(cap = WEATHER_CAP, rnd: () => number = Math.random) {
    this.cap = cap
    this.rnd = rnd
    this.x = new Float32Array(cap)
    this.y = new Float32Array(cap)
    this.fall = new Float32Array(cap)
    this.size = new Float32Array(cap)
    this.phase = new Float32Array(cap)
    this.tone = new Uint8Array(cap)
  }

  private seed(i: number, spec: WeatherSpec, r: WeatherRect, unit: number) {
    const q = this.rnd
    this.x[i] = r.x + q() * r.w
    this.y[i] = r.y + q() * r.h
    this.fall[i] = (spec.fall[0] + q() * (spec.fall[1] - spec.fall[0])) * unit
    this.size[i] = (spec.size[0] + q() * (spec.size[1] - spec.size[0])) * unit
    this.phase[i] = q() * Math.PI * 2
    this.tone[i] = q() < 0.5 ? 0 : 1
  }

  /**
   * Шаг: досеять или убавить до count, сдвинуть, завернуть в рамку.
   * speedK — множитель скорости (щадящий режим), dt — мс.
   */
  step(dt: number, kind: WeatherKind, w: Pick<MapWeather, 'wind_deg' | 'wind'>, r: WeatherRect, count: number, unit: number, speedK = 1) {
    if (kind === 'none' || !(kind in WEATHER)) {
      this.n = 0
      this.kind = kind
      return
    }
    const spec = WEATHER[kind]
    if (kind !== this.kind) {
      this.kind = kind
      this.n = 0
    }
    const want = Math.max(0, Math.min(this.cap, count))
    for (let i = this.n; i < want; i++) this.seed(i, spec, r, unit)
    this.n = want
    const s = (Math.min(dt, 50) / 1000) * speedK
    this.t += s
    const d = windDrift(spec, w, unit, this.drift)
    // «падение» — вниз по экрану; ветер сносит вдоль своего направления
    this.vx = d.x
    this.vy = d.y
    const sway = spec.sway * unit
    for (let i = 0; i < this.n; i++) {
      const f = this.fall[i]
      const sw = sway ? Math.sin(this.t * spec.swayHz + this.phase[i]) * sway : 0
      this.x[i] = wrap(this.x[i] + (d.x + sw) * s, r.x, r.w)
      this.y[i] = wrap(this.y[i] + (d.y + f) * s, r.y, r.h)
    }
  }
}
