/** Конструктор: выбор нескольких объектов и рамка выбора */
import { circle, pxPerFt } from '../geometry'
import type { BattleMap, Pt } from '../types'
import type { View } from './types'

const SEL = 'rgba(120, 200, 255, 0.9)'
const SEL_SOFT = 'rgba(120, 200, 255, 0.45)'

export function drawSelection(ctx: CanvasRenderingContext2D, m: BattleMap, ids: readonly string[], box: { a: Pt; b: Pt } | null | undefined, v: View) {
  const want = new Set(ids)
  const g = m.grid
  ctx.save()
  ctx.strokeStyle = SEL
  ctx.lineWidth = 2 / v.k
  ctx.setLineDash([5 / v.k, 3 / v.k])
  const ring = (p: Pt, r: number) => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (want.size) {
    for (const w of m.walls) {
      if (!want.has(w.id)) continue
      ctx.save()
      ctx.setLineDash([])
      ctx.strokeStyle = SEL_SOFT
      ctx.lineCap = 'round'
      ctx.lineWidth = 12 / v.k
      ctx.beginPath()
      ctx.moveTo(w.a.x, w.a.y)
      ctx.lineTo(w.b.x, w.b.y)
      ctx.stroke()
      ctx.restore()
    }
    for (const o of m.objects) if (want.has(o.id)) ctx.strokeRect(o.x - o.w / 2 - 2 / v.k, o.y - o.h / 2 - 2 / v.k, o.w + 4 / v.k, o.h + 4 / v.k)
    for (const l of m.lights) if (want.has(l.id)) ring(l, g.cell_px * 0.35)
    for (const t of m.tokens) if (want.has(t.id)) ring(t, (t.size * g.cell_px) / 2 + 3 / v.k)
    for (const i of m.items) if (want.has(i.id) && !i.carried_by) ring(i, g.cell_px * 0.28)
    for (const z of m.zones) {
      if (!want.has(z.id)) continue
      const s = z.shape
      const pts = s.kind === 'circle' && s.center ? circle(s.center, (s.radius_ft ?? 10) * pxPerFt(g), 32) : (s.points ?? [])
      if (pts.length < 2) continue
      ctx.beginPath()
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.stroke()
    }
  }
  if (box) {
    const x = Math.min(box.a.x, box.b.x)
    const y = Math.min(box.a.y, box.b.y)
    ctx.fillStyle = 'rgba(120, 200, 255, 0.1)'
    ctx.fillRect(x, y, Math.abs(box.b.x - box.a.x), Math.abs(box.b.y - box.a.y))
    ctx.strokeRect(x, y, Math.abs(box.b.x - box.a.x), Math.abs(box.b.y - box.a.y))
  }
  ctx.restore()
}
