/**
 * Свет и обзор: темнота отдельным слоем на запасном холсте, затем поверх карты.
 *
 * Вызывается внутри ctx.save() с камерой: если темнота есть, закрывает этот
 * save (рисует слой в экранных координатах) и открывает новый с той же
 * камерой — вызывающий потом закрывает его своим ctx.restore().
 */
import { blockingSegments, pxPerFt, visibility } from '../geometry'
import type { BattleMap, MapToken, Pt } from '../types'
import type { MapViewer, View } from './types'

export function drawDarkness(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, dark: { current: HTMLCanvasElement | null }, m: BattleMap, vw: MapViewer, v: View, dpr: number, pos: Map<string, Pt>, now: number) {
  const g = m.grid
  const ambientDark = m.ambient?.level === 'dark' ? 0.92 : m.ambient?.level === 'dim' ? 0.5 : 0
  const myEyes = vw.isDm && !vw.asPlayer ? [] : vw.eyes.map((id) => m.tokens.find((t) => t.id === id)).filter((t): t is MapToken => !!t)
  const needFog = !vw.isDm || vw.asPlayer ? myEyes.length > 0 && m.fog?.mode !== 'off' : false
  if (ambientDark > 0 || needFog) {
    if (!dark.current) dark.current = document.createElement('canvas')
    const d = dark.current
    // размер меняем только при изменении: присваивание width/height пересоздаёт буфер
    if (d.width !== c.width || d.height !== c.height) {
      d.width = c.width
      d.height = c.height
    }
    const dx = d.getContext('2d')!
    dx.setTransform(1, 0, 0, 1, 0, 0)
    dx.clearRect(0, 0, d.width, d.height)
    dx.setTransform(dpr, 0, 0, dpr, 0, 0)
    dx.translate(v.x, v.y)
    dx.scale(v.k, v.k)
    const shadeTop = vw.isDm && !vw.asPlayer ? Math.min(0.45, ambientDark) : ambientDark
    dx.fillStyle = `rgba(4, 3, 8, ${needFog ? 1 : shadeTop})`
    dx.fillRect(-10000, -10000, 30000, 30000)
    const ppf = pxPerFt(g)
    const lightSegs = blockingSegments(m.walls, 'light')
    const sightSegs = blockingSegments(m.walls, 'sight')
    const lit = (pts: Pt[], p: Pt, rb: number, rd: number, alpha: number) => {
      dx.save()
      dx.globalCompositeOperation = 'destination-out'
      dx.beginPath()
      pts.forEach((q, i) => (i ? dx.lineTo(q.x, q.y) : dx.moveTo(q.x, q.y)))
      dx.closePath()
      dx.clip()
      const gr = dx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rb + rd)
      gr.addColorStop(0, `rgba(0,0,0,${alpha})`)
      gr.addColorStop(rb / Math.max(1, rb + rd), `rgba(0,0,0,${alpha})`)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      dx.fillStyle = gr
      dx.fillRect(p.x - rb - rd, p.y - rb - rd, (rb + rd) * 2, (rb + rd) * 2)
      dx.restore()
    }
    // источники света
    const lightPolys: { pts: Pt[]; p: Pt; r: number }[] = []
    for (const l of m.lights.filter((l) => l.enabled)) {
      const at = l.attached_to ? pos.get(l.attached_to) ?? { x: l.x, y: l.y } : { x: l.x, y: l.y }
      const f = l.flicker ? 1 + Math.sin(now / 90 + l.x) * 0.04 + Math.sin(now / 37) * 0.03 : 1
      const rb = l.bright_ft * ppf * f
      const rd = l.dim_ft * ppf * f
      const pts = visibility(at, rb + rd, lightSegs)
      lightPolys.push({ pts, p: at, r: rb + rd })
      if (!needFog) lit(pts, at, rb, rd, 1)
    }
    if (needFog) {
      // видно: в многоугольнике обзора своих жетонов и либо при свете, либо при окружении не тьма
      for (const t of myEyes) {
        const p = pos.get(t.id) ?? { x: t.x, y: t.y }
        const sight = visibility(p, 3000, sightSegs)
        dx.save()
        dx.beginPath()
        sight.forEach((q, i) => (i ? dx.lineTo(q.x, q.y) : dx.moveTo(q.x, q.y)))
        dx.closePath()
        dx.clip()
        // окружение
        if (ambientDark < 0.9) {
          dx.globalCompositeOperation = 'destination-out'
          dx.fillStyle = `rgba(0,0,0,${1 - ambientDark})`
          dx.fillRect(-10000, -10000, 30000, 30000)
        }
        dx.restore()
        for (const lp of lightPolys) {
          dx.save()
          dx.beginPath()
          sight.forEach((q, i) => (i ? dx.lineTo(q.x, q.y) : dx.moveTo(q.x, q.y)))
          dx.closePath()
          dx.clip()
          lit(lp.pts, lp.p, lp.r * 0.5, lp.r * 0.5, 1)
          dx.restore()
        }
        // тёмное зрение: в радиусе темнота как сумерки, серо-синие тона
        const dv = (t.vision_mode === 'darkvision' || t.vision_mode === 'normal') && t.senses?.darkvision ? t.senses.darkvision * ppf : 0
        if (dv > 0) {
          dx.save()
          dx.beginPath()
          sight.forEach((q, i) => (i ? dx.lineTo(q.x, q.y) : dx.moveTo(q.x, q.y)))
          dx.closePath()
          dx.clip()
          dx.globalCompositeOperation = 'destination-out'
          const gr = dx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dv)
          gr.addColorStop(0, 'rgba(0,0,0,0.72)')
          gr.addColorStop(0.85, 'rgba(0,0,0,0.6)')
          gr.addColorStop(1, 'rgba(0,0,0,0)')
          dx.fillStyle = gr
          dx.fillRect(p.x - dv, p.y - dv, dv * 2, dv * 2)
          dx.restore()
        }
      }
    }
    ctx.restore()
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(d, 0, 0)
    // серо-синий оттенок тёмного зрения: поверх тёмных мест цвет уходит
    if (needFog && myEyes.some((t) => t.senses?.darkvision) && ambientDark > 0.4) {
      ctx.globalCompositeOperation = 'color'
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#3a4a66'
      ctx.fillRect(0, 0, c.width, c.height)
    }
    ctx.restore()
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.translate(v.x, v.y)
    ctx.scale(v.k, v.k)
  }
}
