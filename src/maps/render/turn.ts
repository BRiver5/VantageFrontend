/**
 * Чей ход: золотое кольцо на земле вокруг жетона и медленно бегущие по нему
 * засечки. При «уменьшить движение» кольцо стоит на месте (still — из
 * prefersReducedMotion в pingSettings.ts).
 */
import { cssVar } from '../../styles/palette'
import type { MapGrid, MapToken, Pt } from '../types'
import type { View } from './types'

export function drawTurnRing(ctx: CanvasRenderingContext2D, t: MapToken, p: Pt, g: MapGrid, v: View, now: number, still: boolean) {
  const gold = cssVar('--gold-3', '#e3c46e')
  const r = (t.size * g.cell_px) / 2 + Math.max(6, g.cell_px * 0.1)
  const cy = p.y - Math.min(18, (t.elevation_ft ?? 0) / 2)
  const phase = still ? 0 : (now / 2400) % 1
  const pulse = still ? 0.75 : 0.6 + 0.25 * Math.sin(now / 420)
  ctx.save()
  // мягкое свечение
  ctx.shadowColor = gold
  ctx.shadowBlur = 16
  ctx.globalAlpha = pulse
  ctx.strokeStyle = gold
  ctx.lineWidth = Math.max(2, 3 / v.k)
  ctx.beginPath()
  ctx.arc(p.x, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  // засечки по кругу
  ctx.shadowBlur = 0
  ctx.globalAlpha = 0.95
  ctx.lineWidth = Math.max(2, 4 / v.k)
  ctx.lineCap = 'round'
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = (i / n + phase) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(p.x, cy, r + 4 / v.k, a, a + 0.22)
    ctx.stroke()
  }
  ctx.restore()
}
