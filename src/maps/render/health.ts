/**
 * Здоровье под жетоном: тонкая дуга снизу. Точные хиты — сплошной дугой с
 * долей; только состояние — дуга, поделённая на зоны, заполненная до верха
 * зоны, чтобы по ней нельзя было вычислить хиты.
 */
import type { HealthView } from '../../rooms/health'
import type { MapGrid, MapToken, Pt } from '../types'
import type { View } from './types'

const TONE = { ok: '#6fd08e', mid: '#e4c46e', low: '#ff7d63', down: '#7b7b7b' }

const toneOf = (h: Exclude<HealthView, { kind: 'hidden' }>) => (h.band === 'down' ? TONE.down : h.band === 'critical' ? TONE.low : h.band === 'bloodied' ? TONE.mid : TONE.ok)

export function drawHealth(ctx: CanvasRenderingContext2D, tokens: MapToken[], pos: Map<string, Pt>, g: MapGrid, health: Record<string, HealthView>, v: View) {
  ctx.save()
  ctx.lineCap = 'round'
  for (const t of tokens) {
    const h = health[t.id]
    const p = pos.get(t.id)
    if (!h || h.kind === 'hidden' || !p) continue
    const r = (t.size * g.cell_px) / 2 + 1
    const cy = p.y - Math.min(18, (t.elevation_ft ?? 0) / 2)
    // нижняя дуга: от 150° до 30° через низ
    const a0 = (150 * Math.PI) / 180
    const span = (-120 * Math.PI) / 180
    const w = Math.max(2.5, 3 / v.k)
    ctx.lineWidth = w + 2
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.beginPath()
    ctx.arc(p.x, cy, r, a0, a0 + span, true)
    ctx.stroke()
    ctx.lineWidth = w
    ctx.strokeStyle = toneOf(h)
    if (h.ratio > 0) {
      ctx.beginPath()
      ctx.arc(p.x, cy, r, a0, a0 + span * h.ratio, true)
      ctx.stroke()
    }
    if (h.kind === 'band') {
      // засечки на границах зон: четверть, половина
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.lineWidth = 1.5 / v.k
      for (const k of [0.25, 0.5]) {
        const a = a0 + span * k
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w))
        ctx.lineTo(p.x + Math.cos(a) * (r + w), cy + Math.sin(a) * (r + w))
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}
