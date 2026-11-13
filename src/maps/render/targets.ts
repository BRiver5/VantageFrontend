/** Цели игрока: прицел вокруг жетона и рамка выделения (Shift + протянуть) */
import { cssVar } from '../../styles/palette'
import type { MapGrid, MapToken, Pt } from '../types'
import type { View } from './types'

const targetColor = () => cssVar('--target', '#ff6b4a')

/** прицел: кольцо с четырьмя засечками — читается и поверх портрета, и в темноте */
export function drawTargets(ctx: CanvasRenderingContext2D, tokens: MapToken[], pos: Map<string, Pt>, g: MapGrid, targets: readonly string[], v: View) {
  if (!targets.length) return
  const color = targetColor()
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  for (const t of tokens) {
    if (!targets.includes(t.id)) continue
    const p = pos.get(t.id)
    if (!p) continue
    const r = (t.size * g.cell_px) / 2 + 4
    // как у жетона: выше пола — выше на холсте
    const cy = p.y - Math.min(18, (t.elevation_ft ?? 0) / 2)
    const w = Math.max(2, 2.5 / v.k)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 4
    ctx.lineWidth = w
    ctx.setLineDash([r * 0.5, r * 0.28])
    ctx.beginPath()
    ctx.arc(p.x, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    const tick = Math.max(6, r * 0.32)
    ctx.lineWidth = w * 1.4
    ctx.beginPath()
    for (const a of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const cx = Math.cos(a)
      const sy = Math.sin(a)
      ctx.moveTo(p.x + cx * (r - tick * 0.35), cy + sy * (r - tick * 0.35))
      ctx.lineTo(p.x + cx * (r + tick), cy + sy * (r + tick))
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** рамка, которой отмечают несколько целей сразу */
export function drawTargetBox(ctx: CanvasRenderingContext2D, box: { a: Pt; b: Pt }, v: View) {
  const x = Math.min(box.a.x, box.b.x)
  const y = Math.min(box.a.y, box.b.y)
  const w = Math.abs(box.b.x - box.a.x)
  const h = Math.abs(box.b.y - box.a.y)
  const color = targetColor()
  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.12
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 / v.k
  ctx.setLineDash([6 / v.k, 4 / v.k])
  ctx.strokeRect(x, y, w, h)
  ctx.restore()
}
