/**
 * Свет сцены: те же формулы, что у сервера (app/maps/lighting.py), плюс
 * анимации источников и часы сервера. Чистые функции — рисует fog.ts.
 *
 * - Темнота сцены 0 (день) … 1 (ночь), переход от darkness_from к darkness
 *   за darkness_duration_s секунд с darkness_started_at (время сервера):
 *   все клиенты считают по часам сервера, поэтому рисуют одно и то же.
 * - Источник горит, пока темнота сцены в его диапазоне darkness_min..max.
 */
import type { LightAnimation, MapAmbient, MapGrid, MapLight } from '../types'

/* ---------- часы сервера ---------- */

let offset: number | null = null
const sampled = new WeakSet<object>()

/**
 * Отметить время сервера из карты. Свежий образец даёт наибольший сдвиг
 * (старые события из журнала — меньший), поэтому берём максимум.
 */
export function noteServerTime(holder: object, iso: string | undefined | null, clientNow = Date.now()): void {
  if (!iso || sampled.has(holder)) return
  sampled.add(holder)
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return
  const sample = t - clientNow
  if (offset == null || sample > offset) offset = sample
}

export const serverNow = (clientNow = Date.now()) => clientNow + (offset ?? 0)

/** для тестов */
export function resetServerClock(): void {
  offset = null
}

/* ---------- темнота сцены ---------- */

const parseUtc = (iso: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)

export function darknessAt(a: MapAmbient | undefined, nowMs: number): number {
  if (!a) return 0
  const target = a.darkness ?? 0
  const dur = a.darkness_duration_s ?? 0
  if (!a.darkness_started_at || dur <= 0) return target
  const t = Math.min(1, Math.max(0, (nowMs - parseUtc(a.darkness_started_at)) / 1000 / dur))
  const from = a.darkness_from ?? 0
  return from + (target - from) * t
}

/** идёт ли переход (нужна перерисовка каждый кадр) */
export function darknessMoving(a: MapAmbient | undefined, nowMs: number): boolean {
  if (!a?.darkness_started_at || !a.darkness_duration_s) return false
  const end = parseUtc(a.darkness_started_at) + a.darkness_duration_s * 1000
  return nowMs < end + 100
}

export const DIM_FROM = 0.35
export const DARK_FROM = 0.75

/** уровень окружения для подписи: темнее из уровня карты и темноты сцены */
export function ambientLevel(a: MapAmbient | undefined, d: number): 'bright' | 'dim' | 'dark' {
  const rank = Math.min(a?.level === 'dark' ? 0 : a?.level === 'dim' ? 1 : 2, d >= DARK_FROM ? 0 : d >= DIM_FROM ? 1 : 2)
  return rank === 0 ? 'dark' : rank === 1 ? 'dim' : 'bright'
}

/** Насколько затемнить сцену: уровень карты или темнота, что темнее (0..0.92) */
export function sceneShade(a: MapAmbient | undefined, d: number): number {
  const byLevel = a?.level === 'dark' ? 0.92 : a?.level === 'dim' ? 0.5 : 0
  return Math.max(byLevel, Math.min(1, Math.max(0, d)) * 0.92)
}

/** Цвет темноты: ночью уходит в синеву */
export function shadeColor(d: number): [number, number, number] {
  const k = Math.min(1, Math.max(0, d))
  return [Math.round(4 + 4 * k), Math.round(3 + 9 * k), Math.round(8 + 22 * k)]
}

export function lightActive(l: MapLight, d: number): boolean {
  const lo = Math.min(l.darkness_min ?? 0, l.darkness_max ?? 1)
  const hi = Math.max(l.darkness_min ?? 0, l.darkness_max ?? 1)
  return l.enabled && d >= lo - 1e-9 && d <= hi + 1e-9
}

/* ---------- анимации ---------- */

/** старое «мерцает» без анимации — факел */
export function animationOf(l: MapLight): LightAnimation {
  const a = l.animation ?? 'none'
  return a === 'none' && l.flicker ? 'torch' : a
}

export interface LightFrame {
  /** множитель радиуса */
  radius: number
  /** множитель яркости 0..1 */
  alpha: number
  /** сдвиг оттенка, градусы (chroma) */
  hue: number
  /** поворот узора, радианы (fog, sunburst) */
  spin: number
}

export const STILL: LightFrame = { radius: 1, alpha: 1, hue: 0, spin: 0 }

/** Кадр анимации: t — мс, speed и intensity — 1..10, seed — разнобой между источниками. calm — без движения. */
export function lightFrame(kind: LightAnimation, t: number, speed = 5, intensity = 5, seed = 0, calm = false): LightFrame {
  if (kind === 'none' || calm) return STILL
  const s = Math.max(1, Math.min(10, speed)) / 5
  const k = Math.max(1, Math.min(10, intensity)) / 10
  const ts = t * s
  switch (kind) {
    case 'torch': {
      const n = Math.sin(ts / 90 + seed) * 0.5 + Math.sin(ts / 37 + seed * 1.7) * 0.3 + Math.sin(ts / 13 + seed * 3.1) * 0.2
      return { radius: 1 + n * 0.08 * k, alpha: 1 - (0.5 - n * 0.5) * 0.35 * k, hue: 0, spin: 0 }
    }
    case 'pulse': {
      const p = Math.sin(ts / 400 + seed)
      return { radius: 1 + p * 0.1 * k, alpha: 1 - (0.5 - p * 0.5) * 0.6 * k, hue: 0, spin: 0 }
    }
    case 'chroma':
      // сила — размах оттенка: от ±36° до полного круга
      return { radius: 1, alpha: 1, hue: k >= 1 ? (ts / 20 + seed * 57) % 360 : Math.sin(ts / 1200 + seed) * 360 * k * 0.5, spin: 0 }
    case 'fog':
      return { radius: 1, alpha: 1 - 0.15 * k * (0.5 + 0.5 * Math.sin(ts / 700 + seed)), hue: 0, spin: ts / 4000 + seed }
    case 'sunburst':
      return { radius: 1 + Math.sin(ts / 600 + seed) * 0.03 * k, alpha: 1, hue: 0, spin: ts / 3000 + seed }
  }
  return STILL
}

/** число из id: разные источники мерцают вразнобой */
export function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return (Math.abs(h) % 1000) / 100
}

/** Сдвинуть оттенок #rrggbb на deg градусов */
export function hueShift(hex: string, deg: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m || !deg) return hex
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const dd = max - min
  let h = 0
  const sat = dd === 0 ? 0 : dd / (1 - Math.abs(2 * l - 1))
  if (dd) h = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4
  h = (((h * 60 + deg) % 360) + 360) % 360
  return `hsl(${Math.round(h)}, ${Math.round(Math.max(sat, 0.6) * 100)}%, ${Math.round(Math.min(0.7, Math.max(0.45, l)) * 100)}%)`
}

/** Есть ли источники, которые надо перерисовывать каждый кадр */
export function lightsAnimating(lights: MapLight[], d: number): boolean {
  return lights.some((l) => lightActive(l, d) && animationOf(l) !== 'none')
}

/* ---------- исследованный туман ---------- */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Исследованные клетки «col,row» → прямоугольники: соседние в строке сливаются */
export function exploredRects(cells: readonly string[], g: MapGrid): Rect[] {
  const rows = new Map<number, number[]>()
  for (const key of cells) {
    const [c, r] = key.split(',').map(Number)
    if (!Number.isFinite(c) || !Number.isFinite(r)) continue
    const list = rows.get(r)
    if (list) list.push(c)
    else rows.set(r, [c])
  }
  const out: Rect[] = []
  for (const [r, cols] of rows) {
    cols.sort((a, b) => a - b)
    let start = cols[0]
    let prev = cols[0]
    for (let i = 1; i <= cols.length; i++) {
      const c = cols[i]
      if (c === prev + 1) {
        prev = c
        continue
      }
      if (c === prev) continue
      out.push({ x: g.offset_x + start * g.cell_px, y: g.offset_y + r * g.cell_px, w: (prev - start + 1) * g.cell_px, h: g.cell_px })
      start = c
      prev = c
    }
  }
  return out
}
