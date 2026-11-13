/** Рисунки на карте: фигуры, линии от руки, текст; черновик — пунктиром */
import { drawingBounds } from '../drawings/geometry'
import type { MapDrawing } from '../layers/types'
import type { Pt } from '../types'
import type { View } from './types'

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return Number.isFinite(n) ? `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})` : `rgba(255, 255, 255, ${a})`
}

function path(ctx: CanvasRenderingContext2D, d: MapDrawing, open: boolean) {
  ctx.beginPath()
  if (d.kind === 'rect') ctx.rect(d.x, d.y, d.w, d.h)
  else if (d.kind === 'ellipse') ctx.ellipse(d.x + d.w / 2, d.y + d.h / 2, Math.max(0.1, d.w / 2), Math.max(0.1, d.h / 2), 0, 0, Math.PI * 2)
  else if (d.points.length) {
    ctx.moveTo(d.points[0].x, d.points[0].y)
    for (const p of d.points.slice(1)) ctx.lineTo(p.x, p.y)
    if (d.kind === 'polygon' && !open) ctx.closePath()
  }
}

export function drawDrawing(ctx: CanvasRenderingContext2D, d: MapDrawing, v: View, opts: { selected?: boolean; dimmed?: boolean; open?: boolean } = {}) {
  ctx.save()
  if (opts.dimmed) ctx.globalAlpha = 0.45
  if (d.kind === 'text') {
    const lines = d.text.split('\n')
    ctx.font = `600 ${d.font_size}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(2, d.font_size * 0.18)
    ctx.strokeStyle = 'rgba(10, 6, 3, 0.8)'
    ctx.fillStyle = d.text_color
    lines.forEach((l, i) => {
      ctx.strokeText(l, d.x, d.y + i * d.font_size * 1.2)
      ctx.fillText(l, d.x, d.y + i * d.font_size * 1.2)
    })
  } else {
    path(ctx, d, !!opts.open)
    if (d.fill === 'solid' && d.kind !== 'freehand' && !opts.open) {
      ctx.fillStyle = rgba(d.fill_color, d.fill_opacity)
      ctx.fill()
    }
    if (d.stroke_width > 0) {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = d.stroke_width
      ctx.strokeStyle = rgba(d.stroke_color, d.stroke_opacity)
      ctx.stroke()
    }
  }
  if (opts.selected) {
    const b = drawingBounds(d)
    const pad = 4 / v.k + d.stroke_width / 2
    ctx.globalAlpha = 1
    ctx.setLineDash([5 / v.k, 4 / v.k])
    ctx.lineWidth = 1.5 / v.k
    ctx.strokeStyle = '#78c8ff'
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
  }
  ctx.restore()
}

export function drawDrawings(ctx: CanvasRenderingContext2D, list: readonly MapDrawing[], v: View, isDm: boolean, selected?: string | null) {
  for (const d of list) drawDrawing(ctx, d, v, { selected: selected === d.id, dimmed: isDm && d.hidden })
}

/** черновик: фигура и точки многоугольника */
export function drawDrawingDraft(ctx: CanvasRenderingContext2D, d: MapDrawing, v: View, open: boolean, cursor?: Pt | null) {
  const shown = open && cursor && d.kind === 'polygon' ? { ...d, points: [...d.points, cursor] } : d
  drawDrawing(ctx, shown, v, { open })
  if (d.kind === 'polygon') {
    ctx.save()
    ctx.fillStyle = '#78c8ff'
    for (const p of d.points) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5 / v.k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
