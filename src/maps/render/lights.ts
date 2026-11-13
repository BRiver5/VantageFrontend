/** Конструктор: источники света значками */
import type { BattleMap } from '../types'
import type { MapOverlays, View } from './types'

export function drawLightMarkers(ctx: CanvasRenderingContext2D, m: BattleMap, ov: MapOverlays, v: View) {
  const g = m.grid
  const ppf = g.cell_px / g.feet_per_cell
  for (const l of m.lights) {
    ctx.save()
    ctx.globalAlpha = l.enabled ? 1 : 0.4
    const tint = l.negative ? '#8a6cff' : l.color || '#ffd27a'
    ctx.strokeStyle = tint
    ctx.setLineDash([4 / v.k, 6 / v.k])
    ctx.lineWidth = 1.2 / v.k
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.bright_ft * ppf, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha *= 0.5
    ctx.beginPath()
    ctx.arc(l.x, l.y, (l.bright_ft + l.dim_ft) * ppf, 0, Math.PI * 2)
    ctx.stroke()
    if (l.angle < 360) {
      // сектор направленного источника
      const r = (l.bright_ft + l.dim_ft) * ppf
      const rot = (l.rotation * Math.PI) / 180
      const half = (l.angle * Math.PI) / 360
      ctx.beginPath()
      ctx.moveTo(l.x, l.y)
      ctx.arc(l.x, l.y, r, rot - half, rot + half)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.fillStyle = l.negative ? '#1a1030' : tint
    ctx.strokeStyle = ov.selected === l.id ? '#78c8ff' : '#2a1d0e'
    ctx.lineWidth = (ov.selected === l.id ? 3 : 1.5) / v.k
    ctx.beginPath()
    ctx.arc(l.x, l.y, 7 / v.k, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}
