/** Подсказки поверх карты: досягаемость, путь, черновик, шаблоны наведения (пинги — render/pings.ts) */
import type { MapGrid } from '../types'
import type { MapOverlays, View } from './types'

/** досягаемые клетки */
export function drawReach(ctx: CanvasRenderingContext2D, g: MapGrid, reach: Map<string, number>) {
  for (const [key, cost] of reach) {
    const [cc, rr] = key.split(',').map(Number)
    ctx.fillStyle = cost === 0 ? 'rgba(245, 208, 106, 0.18)' : 'rgba(111, 208, 142, 0.16)'
    ctx.fillRect(g.offset_x + cc * g.cell_px + 1, g.offset_y + rr * g.cell_px + 1, g.cell_px - 2, g.cell_px - 2)
  }
}

/** путь под курсором */
export function drawPath(ctx: CanvasRenderingContext2D, path: NonNullable<MapOverlays['path']>, v: View) {
  ctx.save()
  ctx.strokeStyle = 'rgba(245, 208, 106, 0.9)'
  ctx.lineWidth = 3 / v.k
  ctx.setLineDash([8 / v.k, 6 / v.k])
  ctx.beginPath()
  path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.stroke()
  ctx.restore()
}

/** черновик стены или зоны в конструкторе */
export function drawDraft(ctx: CanvasRenderingContext2D, draft: NonNullable<MapOverlays['draft']>, closeDraft: boolean | undefined, v: View) {
  ctx.save()
  ctx.strokeStyle = '#fff2c4'
  ctx.lineWidth = 3 / v.k
  ctx.setLineDash([6 / v.k, 4 / v.k])
  ctx.beginPath()
  draft.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  if (closeDraft) {
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 210, 120, 0.12)'
    ctx.fill()
  }
  ctx.stroke()
  ctx.restore()
}

/** чужие шаблоны */
export function drawGhosts(ctx: CanvasRenderingContext2D, ghosts: NonNullable<MapOverlays['ghosts']>, v: View) {
  for (const gh of ghosts) {
    if (!gh.polygon.length) continue
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = `${gh.color}22`
    ctx.strokeStyle = gh.color
    ctx.setLineDash([5 / v.k, 5 / v.k])
    ctx.lineWidth = 1.5 / v.k
    ctx.beginPath()
    gh.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

/** наведение */
export function drawAim(ctx: CanvasRenderingContext2D, aim: NonNullable<MapOverlays['aim']>, v: View) {
  ctx.save()
  ctx.fillStyle = aim.ok ? `${aim.color}33` : 'rgba(200, 60, 40, 0.18)'
  ctx.strokeStyle = aim.ok ? aim.color : '#e5484d'
  ctx.lineWidth = 2.5 / v.k
  ctx.beginPath()
  aim.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (aim.origin) {
    ctx.fillStyle = aim.color
    ctx.beginPath()
    ctx.arc(aim.origin.x, aim.origin.y, 4 / v.k, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
