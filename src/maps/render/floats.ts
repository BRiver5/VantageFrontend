/** Всплывающие числа урона и подписи */
import type { MapGrid } from '../types'
import type { FloatText } from './types'

export function drawFloats(ctx: CanvasRenderingContext2D, floats: FloatText[], g: MapGrid) {
  for (const f of floats) {
    const k = f.life / 1600
    ctx.save()
    ctx.globalAlpha = 1 - k * k
    ctx.font = `800 ${Math.max(14, g.cell_px * 0.34)}px Cormorant Unicase, serif`
    ctx.textAlign = 'center'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.fillStyle = f.color
    ctx.strokeText(f.text, f.x, f.y - k * 40)
    ctx.fillText(f.text, f.x, f.y - k * 40)
    ctx.restore()
  }
}
