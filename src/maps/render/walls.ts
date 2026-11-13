/** Стены, двери и окна */
import type { BattleMap } from '../types'
import type { MapOverlays, View } from './types'

/** стены: мастеру и в конструкторе все, игроку — двери и окна */
export function drawWalls(ctx: CanvasRenderingContext2D, m: BattleMap, isDm: boolean, ov: MapOverlays, v: View) {
  for (const w of m.walls) {
    const isDoor = w.kind === 'door' || (w.kind === 'secret' && isDm)
    if (!ov.editor && !isDm && !isDoor && w.kind !== 'window') continue
    if (w.kind === 'invisible' && !ov.editor) continue
    ctx.save()
    ctx.lineCap = 'round'
    if (isDoor) {
      ctx.strokeStyle = w.door?.open ? 'rgba(160, 110, 50, 0.6)' : w.door?.locked ? '#8a2a1a' : '#a8743f'
      ctx.lineWidth = 7 / v.k
      if (w.door?.open) ctx.setLineDash([4 / v.k, 6 / v.k])
    } else if (w.kind === 'window') {
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.8)'
      ctx.lineWidth = 3 / v.k
    } else {
      ctx.strokeStyle = ov.editor ? '#f5d06a' : 'rgba(245, 208, 106, 0.35)'
      ctx.lineWidth = (ov.editor ? 4 : 2) / v.k
    }
    if (ov.editor && ov.selected === w.id) {
      ctx.save()
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.55)'
      ctx.lineWidth = 12 / v.k
      ctx.beginPath()
      ctx.moveTo(w.a.x, w.a.y)
      ctx.lineTo(w.b.x, w.b.y)
      ctx.stroke()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.moveTo(w.a.x, w.a.y)
    ctx.lineTo(w.b.x, w.b.y)
    ctx.stroke()
    if (ov.editor) {
      ctx.fillStyle = '#fff2c4'
      for (const p of [w.a, w.b]) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3.5 / v.k, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}
