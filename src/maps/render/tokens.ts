/** Жетоны: подставка, портрет, обводка стороны, подписи и шанс над целью */
import type { MapGrid, MapToken, Pt } from '../types'
import { relColors, sideColors } from './constants'
import { drawLookOver, drawLookTint, drawLookUnder, lookAlpha, lookFilter, lookJitter } from './looks'
import type { ImgFn, MapOverlays, View } from './types'

/** now и still — для состояний на жетоне (ov.looks): пульс и рябь, still — без движения */
export function drawTokens(ctx: CanvasRenderingContext2D, tokens: MapToken[], pos: Map<string, Pt>, g: MapGrid, ov: MapOverlays, v: View, img: ImgFn, art: (t: MapToken) => string | null, now = 0, still = false) {
  const SIDE = sideColors()
  const REL = relColors()
  for (const t of [...tokens].sort((a, b) => a.size - b.size)) {
    const look = ov.looks?.[t.id]
    const p0 = pos.get(t.id)!
    const jx = lookJitter(look, now, still)
    const p = jx ? { x: p0.x + jx, y: p0.y } : p0
    const r = (t.size * g.cell_px) / 2 - 2
    const rel = ov.relations?.[t.id]
    const picked = ov.picked?.includes(t.id)
    ctx.save()
    ctx.globalAlpha = (t.hidden ? 0.45 : 1) * lookAlpha(look)
    // тень-подставка (выше — дальше от пола)
    const lift = Math.min(18, (t.elevation_ft ?? 0) / 2)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y + r * 0.85, r * 0.9, r * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
    const cy = p.y - lift
    if (look) drawLookUnder(ctx, look, p.x, cy, r, now, still)
    // сбитый с ног лежит на боку: портрет повёрнут
    ctx.save()
    if (look?.prone) {
      ctx.translate(p.x, cy)
      ctx.rotate(Math.PI / 2)
      ctx.translate(-p.x, -cy)
    }
    if (rel || picked || ov.selected === t.id) {
      ctx.shadowColor = rel ? REL[rel] : picked ? '#ff6b4a' : '#f5d06a'
      ctx.shadowBlur = 18
    }
    ctx.beginPath()
    ctx.arc(p.x, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#1a120c'
    ctx.fill()
    ctx.shadowBlur = 0
    const im = img(art(t))
    if (im) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(p.x, cy, r - 2, 0, Math.PI * 2)
      ctx.clip()
      const s = Math.max((r * 2) / im.naturalWidth, (r * 2) / im.naturalHeight)
      if (look) ctx.filter = lookFilter(look)
      ctx.drawImage(im, p.x - (im.naturalWidth * s) / 2, cy - (im.naturalHeight * s) * 0.38, im.naturalWidth * s, im.naturalHeight * s)
      ctx.filter = 'none'
      if (look) drawLookTint(ctx, look, p.x, cy, r - 2, now, still)
      ctx.restore()
    } else {
      ctx.fillStyle = '#f1d9a2'
      ctx.font = `700 ${Math.max(10, r)}px Cormorant Unicase, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((t.label || '?').charAt(0).toUpperCase(), p.x, cy + 1)
      if (look) drawLookTint(ctx, look, p.x, cy, r - 2, now, still)
    }
    ctx.lineWidth = Math.max(2, r * 0.12)
    ctx.strokeStyle = rel ? REL[rel] : picked ? '#ff6b4a' : SIDE[t.side ?? 'neutral'] ?? SIDE.neutral
    ctx.beginPath()
    ctx.arc(p.x, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    if (look) drawLookOver(ctx, look, p.x, cy, r, now, still)
    if (ov.selected === t.id) {
      ctx.strokeStyle = '#fff2c4'
      ctx.lineWidth = 2 / v.k
      ctx.setLineDash([5 / v.k, 4 / v.k])
      ctx.beginPath()
      ctx.arc(p.x, cy, r + 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // подпись и высота
    ctx.font = `600 ${Math.max(9, g.cell_px * 0.18)}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillStyle = '#f1e3c4'
    ctx.strokeText(t.label, p.x, cy + r + 2)
    ctx.fillText(t.label, p.x, cy + r + 2)
    if (t.elevation_ft) {
      const tag = `${t.elevation_ft > 0 ? '▲' : '▼'}${Math.abs(t.elevation_ft)}`
      ctx.fillStyle = '#9fd0ff'
      ctx.strokeText(tag, p.x + r, cy - r - 2)
      ctx.fillText(tag, p.x + r, cy - r - 2)
    }
    // шанс над целью
    const ch = ov.chances?.[t.id]
    if (ch != null) {
      ctx.fillStyle = 'rgba(12, 8, 5, 0.85)'
      ctx.beginPath()
      ctx.arc(p.x, cy - r - 14, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = ch >= 0.65 ? '#6fd08e' : ch <= 0.35 ? '#ff7d63' : '#e4c46e'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(p.x, cy - r - 14, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ch)
      ctx.stroke()
      ctx.fillStyle = '#fff2c4'
      ctx.font = '700 10px Inter, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.round(ch * 100)}`, p.x, cy - r - 14)
    }
    ctx.restore()
  }
}
