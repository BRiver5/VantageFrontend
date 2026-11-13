/** Линейка и маршрут перетаскивания: линия через точки, подписи футов, враги с атакой по возможности */
import type { Pt } from '../types'
import type { View } from './types'

export interface RulerOverlay {
  /** линия: центры клеток подряд (маршрут) или точки линейки */
  path: Pt[]
  /** точки маршрута: кружки */
  waypoints: Pt[]
  /** подписи у точек: «15 фт. · ↑10 фт.» */
  labels: { at: Pt; text: string; strong?: boolean }[]
  /** measure — линейка, ok — можно идти, bad — нельзя */
  tone: 'measure' | 'ok' | 'bad'
  /** враги, которые ударят атакой по возможности: центр и радиус кольца */
  threats: { x: number; y: number; r: number }[]
  /** где бьют: клетки выхода из досягаемости */
  hits: Pt[]
}

const TONE = {
  measure: { line: '#8fd3ff', fill: 'rgba(14, 22, 30, 0.86)' },
  ok: { line: '#f5d06a', fill: 'rgba(24, 18, 8, 0.86)' },
  bad: { line: '#e5484d', fill: 'rgba(36, 10, 10, 0.88)' },
}

export function drawRuler(ctx: CanvasRenderingContext2D, ov: RulerOverlay, v: View, now: number) {
  const tone = TONE[ov.tone]
  ctx.save()
  // враги: пульсирующее красное кольцо
  const pulse = 0.5 + 0.5 * Math.sin(now / 180)
  for (const t of ov.threats) {
    ctx.strokeStyle = `rgba(229, 72, 77, ${0.55 + pulse * 0.4})`
    ctx.lineWidth = (3 + pulse * 2) / v.k
    ctx.beginPath()
    ctx.arc(t.x, t.y, t.r + 4 / v.k, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (ov.path.length > 1) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = 6 / v.k
    ctx.beginPath()
    ov.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.stroke()
    ctx.strokeStyle = tone.line
    ctx.lineWidth = 3 / v.k
    ctx.setLineDash(ov.tone === 'measure' ? [] : [10 / v.k, 6 / v.k])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = tone.line
  for (const p of ov.waypoints) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5 / v.k, 0, Math.PI * 2)
    ctx.fill()
  }
  // удар: крестик на клетке выхода
  ctx.strokeStyle = '#ff8a7a'
  ctx.lineWidth = 2.5 / v.k
  const s = 6 / v.k
  for (const h of ov.hits) {
    ctx.beginPath()
    ctx.moveTo(h.x - s, h.y - s)
    ctx.lineTo(h.x + s, h.y + s)
    ctx.moveTo(h.x + s, h.y - s)
    ctx.lineTo(h.x - s, h.y + s)
    ctx.stroke()
  }
  // подписи: плашки постоянного экранного размера
  ctx.font = `${600} ${12 / v.k}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const l of ov.labels) {
    const w = ctx.measureText(l.text).width + 12 / v.k
    const h = 20 / v.k
    const x = l.at.x + 10 / v.k
    const y = l.at.y - 18 / v.k
    ctx.fillStyle = tone.fill
    ctx.beginPath()
    ctx.roundRect(x, y - h / 2, w, h, h / 2)
    ctx.fill()
    ctx.strokeStyle = l.strong ? tone.line : 'rgba(255, 255, 255, 0.18)'
    ctx.lineWidth = 1 / v.k
    ctx.stroke()
    ctx.fillStyle = l.strong ? tone.line : '#f1e4c8'
    ctx.fillText(l.text, x + 6 / v.k, y)
  }
  ctx.restore()
}
