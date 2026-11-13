/** Стиль рисования по умолчанию: свой у каждого, хранится в localStorage */
import type { DrawingStyle } from '../layers/types'

const KEY = 'vantage-draw-style'

export const DEFAULT_STYLE: DrawingStyle = {
  stroke_color: '#f5d06a',
  stroke_width: 4,
  stroke_opacity: 1,
  fill: 'none',
  fill_color: '#f5d06a',
  fill_opacity: 0.25,
  font_size: 32,
  text_color: '#ffffff',
}

const HEX = /^#[0-9a-f]{6}$/i
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d)

/** привести что угодно к допустимому стилю (значения сервера) */
export function cleanStyle(raw: unknown): DrawingStyle {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof DrawingStyle, unknown>>
  const d = DEFAULT_STYLE
  return {
    stroke_color: hex(o.stroke_color, d.stroke_color),
    stroke_width: num(o.stroke_width, 0, 64, d.stroke_width),
    stroke_opacity: num(o.stroke_opacity, 0, 1, d.stroke_opacity),
    fill: o.fill === 'solid' ? 'solid' : 'none',
    fill_color: hex(o.fill_color, d.fill_color),
    fill_opacity: num(o.fill_opacity, 0, 1, d.fill_opacity),
    font_size: num(o.font_size, 6, 256, d.font_size),
    text_color: hex(o.text_color, d.text_color),
  }
}

export function loadStyle(): DrawingStyle {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? cleanStyle(JSON.parse(raw)) : DEFAULT_STYLE
  } catch {
    return DEFAULT_STYLE
  }
}

export function saveStyle(s: DrawingStyle) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* приватный режим: стиль живёт до перезагрузки */
  }
}
