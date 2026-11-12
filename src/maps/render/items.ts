/** Предметы: на полу и в руках призванных */
import type { BattleMap, MapToken, Pt } from '../types'
import type { ImgFn, MapOverlays, View } from './types'

/** предметы на полу */
export function drawFloorItems(ctx: CanvasRenderingContext2D, m: BattleMap, isDm: boolean, ov: MapOverlays, v: View, now: number, img: ImgFn) {
  const g = m.grid
  for (const it of m.items.filter((i) => !i.carried_by && !i.container_object_id && (isDm || !i.hidden))) {
    ctx.save()
    ctx.translate(it.x, it.y)
    ctx.globalAlpha = it.hidden ? 0.5 : 1
    const s = g.cell_px * 0.18
    if (ov.reachItems?.includes(it.id)) {
      const ph = (now % 1400) / 1400
      ctx.strokeStyle = `rgba(245, 208, 106, ${0.9 - ph * 0.9})`
      ctx.lineWidth = 2 / v.k
      ctx.beginPath()
      ctx.arc(0, 0, s * (1.4 + ph * 1.6), 0, Math.PI * 2)
      ctx.stroke()
    }
    const im = img(it.image_url)
    if (im) {
      ctx.imageSmoothingEnabled = im.naturalWidth > 64
      ctx.drawImage(im, -s * 1.6, -s * 1.6, s * 3.2, s * 3.2)
    } else {
      ctx.fillStyle = 'rgba(241, 217, 162, 0.9)'
      ctx.strokeStyle = '#5a3608'
      ctx.lineWidth = 1.5 / v.k
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-s, -s, s * 2, s * 2)
      ctx.strokeRect(-s, -s, s * 2, s * 2)
      ctx.rotate(-Math.PI / 4)
    }
    if (ov.editor && ov.selected === it.id) {
      ctx.strokeStyle = '#78c8ff'
      ctx.lineWidth = 2.5 / v.k
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.9, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** предметы в руках призванных — у их жетонов */
export function drawCarriedItems(ctx: CanvasRenderingContext2D, m: BattleMap, isDm: boolean, v: View, now: number, posOf: (t: MapToken, now: number) => Pt) {
  const g = m.grid
  for (const it of m.items.filter((i) => i.carried_by)) {
    const t = m.tokens.find((x) => x.id === it.carried_by)
    if (!t || (!isDm && t.hidden)) continue
    const p = posOf(t, now)
    ctx.save()
    ctx.fillStyle = 'rgba(241, 217, 162, 0.95)'
    ctx.strokeStyle = '#5a3608'
    ctx.lineWidth = 1.2 / v.k
    const s = g.cell_px * 0.12
    ctx.translate(p.x + g.cell_px * 0.3, p.y + g.cell_px * 0.42)
    ctx.rotate(Math.PI / 4 + Math.sin(now / 300) * 0.2)
    ctx.fillRect(-s, -s, s * 2, s * 2)
    ctx.strokeRect(-s, -s, s * 2, s * 2)
    ctx.restore()
  }
}
