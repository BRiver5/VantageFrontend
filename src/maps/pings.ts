/**
 * Пинги на карте: виды, цвета, сколько живут, стрелка у края экрана.
 *
 * basic — обычный (долгое нажатие или правая кнопка), alert — «внимание»
 * (Alt+клик), pan — «сюда» мастера (Shift+клик): все переводят камеру в точку.
 * Щадящий режим (фоточувствительность или prefers-reduced-motion) рисует все
 * пинги медленным кругом со стрелкой, без вспышек.
 */
import type { Pt } from './types'

export type PingKind = 'basic' | 'alert' | 'pan'

export const PING_KINDS: readonly PingKind[] = ['basic', 'alert', 'pan']

export const ALERT_COLOR = '#e5484d'
export const PAN_COLOR = '#f5d06a'
export const DEFAULT_PING_COLOR = '#f5d06a'

/** сколько живёт пинг, мс */
export function pingLife(kind: PingKind, calm: boolean): number {
  if (calm) return 4000
  return kind === 'basic' ? 2000 : 3200
}

/** вид по модификаторам клика: Alt — внимание, Shift у мастера — «сюда» */
export function pingKindFor(e: { altKey: boolean; shiftKey: boolean }, isDm: boolean): PingKind | null {
  if (e.altKey) return 'alert'
  if (e.shiftKey && isDm) return 'pan'
  return null
}

export interface PingMessage {
  mapId: string
  at: Pt
  kind: PingKind
  color: string | null
  zoom: number | null
  userId: string | null
}

/** Разбор `map.ping` от сервера. Старые клиенты не шлют kind — это basic */
export function parsePing(p: Record<string, unknown>): PingMessage | null {
  const x = Number(p.x)
  const y = Number(p.y)
  if (!Number.isFinite(x) || !Number.isFinite(y) || typeof p.map_id !== 'string') return null
  const kind = PING_KINDS.includes(p.kind as PingKind) ? (p.kind as PingKind) : 'basic'
  const zoom = kind === 'pan' && typeof p.zoom === 'number' && Number.isFinite(p.zoom) && p.zoom > 0 ? p.zoom : null
  return {
    mapId: p.map_id,
    at: { x, y },
    kind,
    color: typeof p.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : null,
    zoom,
    userId: typeof p.user_id === 'string' ? p.user_id : null,
  }
}

/** Цвет участника: стабильный оттенок по user_id */
export function userColor(userId: string | null | undefined): string {
  if (!userId) return DEFAULT_PING_COLOR
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  // красный оставляем «вниманию»: оттенки 30..330
  const hue = 30 + (h % 300)
  return `hsl(${hue} 75% 62%)`
}

/** Цвет пинга по виду */
export function pingColor(kind: PingKind, own: string): string {
  if (kind === 'alert') return ALERT_COLOR
  if (kind === 'pan') return PAN_COLOR
  return own
}

/**
 * Точка вне экрана → место стрелки у края и её угол. null — точка видна.
 * Экранные координаты: прямоугольник 0..w × 0..h, отступ margin от края.
 */
export function edgeArrow(p: Pt, w: number, h: number, margin = 28): { x: number; y: number; angle: number } | null {
  if (p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h) return null
  const cx = w / 2
  const cy = h / 2
  const dx = p.x - cx
  const dy = p.y - cy
  const hw = Math.max(1, cx - margin)
  const hh = Math.max(1, cy - margin)
  const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity)
  return { x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) }
}
