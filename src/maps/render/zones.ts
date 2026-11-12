/** Зоны: заливка и контур, плюс постоянный эффект зоны в движке частиц */
import { circle, pxPerFt } from '../geometry'
import { loadPresets, presetOf, type VfxEngine } from '../vfx'
import type { BattleMap } from '../types'
import type { MapOverlays, View } from './types'

export function drawZones(ctx: CanvasRenderingContext2D, m: BattleMap, isDm: boolean, ov: MapOverlays, v: View, fx: VfxEngine, dt: number) {
  const g = m.grid
  for (const z of m.zones.filter((z) => z.enabled && (isDm || z.visible_to_players))) {
    const ppf = pxPerFt(g)
    const pts = z.shape.kind === 'circle' && z.shape.center ? circle(z.shape.center, (z.shape.radius_ft ?? 10) * ppf) : z.shape.points ?? []
    ctx.save()
    ctx.fillStyle = z.source?.kind === 'spell' ? 'rgba(170, 120, 255, 0.18)' : 'rgba(255, 200, 90, 0.12)'
    ctx.strokeStyle = z.source?.kind === 'spell' ? 'rgba(190, 150, 255, 0.7)' : 'rgba(255, 210, 120, 0.5)'
    ctx.setLineDash(ov.editor && ov.selected === z.id ? [] : [6 / v.k, 4 / v.k])
    ctx.lineWidth = (ov.editor && ov.selected === z.id ? 3 : 1.5) / v.k
    if (ov.editor && ov.selected === z.id) ctx.strokeStyle = '#78c8ff'
    if (z.shape.kind === 'cells') {
      for (const key of z.shape.cells ?? []) {
        const [cc, rr] = key.split(',').map(Number)
        ctx.fillRect(g.offset_x + cc * g.cell_px, g.offset_y + rr * g.cell_px, g.cell_px, g.cell_px)
      }
    } else if (pts.length) {
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
    // постоянный эффект зоны
    if (z.vfx_preset) {
      const pre = presetOf(z.vfx_preset)
      if (!pre) void loadPresets([z.vfx_preset])
      const cellsPts = z.shape.kind === 'cells' ? (z.shape.cells ?? []).map((key) => { const [cc, rr] = key.split(',').map(Number); return { x: g.offset_x + (cc + 0.5) * g.cell_px, y: g.offset_y + (rr + 0.5) * g.cell_px } }) : []
      const all = pts.length ? pts : cellsPts
      if (all.length) {
        const cx = all.reduce((s, p) => s + p.x, 0) / all.length
        const cy = all.reduce((s, p) => s + p.y, 0) / all.length
        const size = Math.max(g.cell_px / 2, ...all.map((p) => Math.hypot(p.x - cx, p.y - cy)))
        fx.zone(z.id, pre, pts.length > 2 ? { at: { x: cx, y: cy }, size, polygon: pts } : { at: { x: cx, y: cy }, size }, dt)
      }
    }
  }
}
