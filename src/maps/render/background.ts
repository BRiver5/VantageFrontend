/** Подложка карты: картинки слоёв, объекты, рельеф и сетка */
import type { BattleMap, MapGrid, MapToken } from '../types'
import type { ImgFn, MapOverlays, View } from './types'

/** слои-картинки по z; крыша прячется, когда под ней жетон */
export function drawLayers(ctx: CanvasRenderingContext2D, m: BattleMap, tokens: MapToken[], img: ImgFn) {
  const g = m.grid
  for (const l of [...m.layers].sort((a, b) => a.z - b.z)) {
    if (l.kind === 'roof' && l.hide_when_occupied && tokens.some((t) => t.x > l.x && t.x < l.x + l.w && t.y > l.y && t.y < l.y + l.h)) continue
    const im = img(l.image_url)
    if (!im) continue
    ctx.save()
    ctx.globalAlpha = l.opacity ?? 1
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2)
    ctx.rotate(((l.rotation ?? 0) * Math.PI) / 180)
    ctx.imageSmoothingEnabled = im.naturalWidth > 64
    ctx.drawImage(im, -l.w / 2, -l.h / 2, l.w, l.h)
    ctx.restore()
  }
  if (m.layers.length === 0) {
    ctx.fillStyle = '#2a2017'
    ctx.fillRect(g.offset_x, g.offset_y, g.cols * g.cell_px, g.rows * g.cell_px)
  }
}

/** объекты */
export function drawObjects(ctx: CanvasRenderingContext2D, m: BattleMap, isDm: boolean, ov: MapOverlays, v: View, img: ImgFn) {
  const g = m.grid
  for (const o of [...m.objects].filter((o) => isDm || !o.hidden).sort((a, b) => a.z - b.z)) {
    const im = img(o.image_url)
    ctx.save()
    ctx.translate(o.x, o.y)
    ctx.rotate(((o.rotation ?? 0) * Math.PI) / 180)
    ctx.globalAlpha = o.hidden ? 0.5 : 1
    if (im) {
      ctx.imageSmoothingEnabled = im.naturalWidth > 64
      ctx.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h)
    } else {
      ctx.fillStyle = 'rgba(120, 90, 60, 0.6)'
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h)
    }
    if (ov.editor && ov.selected === o.id) {
      ctx.strokeStyle = '#78c8ff'
      ctx.lineWidth = 2.5 / v.k
      ctx.setLineDash([6 / v.k, 4 / v.k])
      ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h)
    }
    if (ov.heights && o.height_ft) {
      ctx.rotate((-(o.rotation ?? 0) * Math.PI) / 180)
      ctx.font = `700 ${Math.max(10, g.cell_px * 0.2)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx.lineWidth = 3 / v.k
      ctx.strokeText(`${o.height_ft} фт`, 0, 4)
      ctx.fillText(`${o.height_ft} фт`, 0, 4)
    }
    ctx.restore()
  }
}

/** сложная местность и вода — штриховка; с высотами — ещё высоты пола и лазы */
export function drawTerrain(ctx: CanvasRenderingContext2D, m: BattleMap, ov: MapOverlays, v: View) {
  const g = m.grid
  ctx.save()
  for (const key of m.terrain?.difficult ?? []) {
    const [cc, rr] = key.split(',').map(Number)
    ctx.fillStyle = 'rgba(160, 120, 60, 0.18)'
    ctx.fillRect(g.offset_x + cc * g.cell_px, g.offset_y + rr * g.cell_px, g.cell_px, g.cell_px)
  }
  if (ov.heights) {
    ctx.font = `700 ${Math.max(10, g.cell_px * 0.24)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [key, h] of Object.entries(m.terrain?.elevation ?? {})) {
      if (!h) continue
      const [cc, rr] = key.split(',').map(Number)
      const x = g.offset_x + cc * g.cell_px
      const y = g.offset_y + rr * g.cell_px
      const a = Math.min(0.55, 0.12 + Math.abs(h) / 60)
      ctx.fillStyle = h > 0 ? `rgba(255, 170, 60, ${a})` : `rgba(70, 120, 255, ${a})`
      ctx.fillRect(x, y, g.cell_px, g.cell_px)
      ctx.fillStyle = '#fff'
      ctx.fillText(String(h), x + g.cell_px / 2, y + g.cell_px / 2)
    }
    for (const key of m.terrain?.climbable ?? []) {
      const [cc, rr] = key.split(',').map(Number)
      ctx.strokeStyle = 'rgba(140, 255, 160, 0.7)'
      ctx.lineWidth = 2 / v.k
      ctx.strokeRect(g.offset_x + cc * g.cell_px + 3, g.offset_y + rr * g.cell_px + 3, g.cell_px - 6, g.cell_px - 6)
    }
    ctx.textBaseline = 'alphabetic'
  }
  for (const key of m.terrain?.water ?? []) {
    const [cc, rr] = key.split(',').map(Number)
    ctx.fillStyle = 'rgba(60, 120, 200, 0.22)'
    ctx.fillRect(g.offset_x + cc * g.cell_px, g.offset_y + rr * g.cell_px, g.cell_px, g.cell_px)
  }
  ctx.restore()
}

/** сетка */
export function drawGrid(ctx: CanvasRenderingContext2D, g: MapGrid, ov: MapOverlays, v: View) {
  ctx.strokeStyle = ov.editor ? 'rgba(255, 240, 210, 0.22)' : 'rgba(255, 240, 210, 0.08)'
  ctx.lineWidth = 1 / v.k
  ctx.beginPath()
  for (let i = 0; i <= g.cols; i++) {
    ctx.moveTo(g.offset_x + i * g.cell_px, g.offset_y)
    ctx.lineTo(g.offset_x + i * g.cell_px, g.offset_y + g.rows * g.cell_px)
  }
  for (let j = 0; j <= g.rows; j++) {
    ctx.moveTo(g.offset_x, g.offset_y + j * g.cell_px)
    ctx.lineTo(g.offset_x + g.cols * g.cell_px, g.offset_y + j * g.cell_px)
  }
  ctx.stroke()
}
