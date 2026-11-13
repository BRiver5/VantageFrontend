/**
 * Свет и обзор: темнота отдельным слоем на запасном холсте, затем поверх карты.
 *
 * Вызывается внутри ctx.save() с камерой: если темнота есть, закрывает этот
 * save (рисует слой в экранных координатах) и открывает новый с той же
 * камерой — вызывающий потом закрывает его своим ctx.restore().
 *
 * Слой темноты игрока с туманом: неисследованное — чёрное, исследованное
 * (fog.explored от сервера) — приглушённое, в обзоре своих жетонов — по
 * свету сцены. Темнота сцены (ambient.darkness) затемняет и уводит в синеву,
 * источники тьмы (negative) гасят свет. Цветные и анимированные источники
 * подкрашивают сцену под слоем темноты.
 */
import { blockingSegments, pointInPolygon, pxPerFt, visibility } from '../geometry'
import { isPingCalm } from '../pingSettings'
import type { BattleMap, MapGrid, MapLight, MapToken, Pt } from '../types'
import { animationOf, darknessAt, exploredRects, hueShift, lightActive, lightFrame, noteServerTime, sceneShade, seedOf, serverNow, shadeColor, type LightFrame } from './lighting'
import type { MapViewer, View } from './types'

/** сколько темноты остаётся над исследованным, но не видимым сейчас */
export const EXPLORED_SHADE = 0.72

/**
 * Где источник света. Прикреплённый едет за жетоном: нарисованное положение,
 * иначе положение из данных. Жетона в данных нет (игроку не прислали скрытый
 * или невидимый жетон, либо жетон удалён) — свет не рисуем: сервер такой
 * источник тоже не учитывает, а своё место источника устарело и выдало бы,
 * где жетон стоял раньше.
 */
export function lightOrigin(m: BattleMap, l: MapLight, pos: Map<string, Pt>): Pt | null {
  if (!l.attached_to) return { x: l.x, y: l.y }
  const p = pos.get(l.attached_to)
  if (p) return p
  const t = m.tokens.find((x) => x.id === l.attached_to)
  return t ? { x: t.x, y: t.y } : null
}

/** обзор одного своего жетона */
export interface Sight {
  t: MapToken
  p: Pt
  pts: Pt[]
}

/** Обзоры своих жетонов, если игроку нужен туман; иначе null (мастер, туман выключен, жетонов нет) */
export function eyeSights(m: BattleMap, vw: MapViewer, posOf: (t: MapToken) => Pt): Sight[] | null {
  if ((vw.isDm && !vw.asPlayer) || m.fog?.mode === 'off' || !m.fog) return null
  const eyes = vw.eyes.map((id) => m.tokens.find((t) => t.id === id)).filter((t): t is MapToken => !!t)
  if (!eyes.length) return null
  const segs = blockingSegments(m.walls, 'sight')
  return eyes.map((t) => {
    const p = posOf(t)
    return { t, p, pts: visibility(p, 3000, segs) }
  })
}

/** Точка в обзоре хоть одного своего жетона: чужие жетоны и предметы вне обзора не рисуем */
export const inSight = (sights: readonly Sight[], p: Pt) => sights.some((s) => pointInPolygon(p, s.pts))

interface Lit {
  l: MapLight
  at: Pt
  rb: number
  rd: number
  fr: LightFrame
  pts: Pt[]
}

const explored = new WeakMap<readonly string[], { key: string; path: Path2D }>()
function exploredPath(cells: readonly string[], g: MapGrid): Path2D {
  const key = `${g.cell_px}:${g.offset_x}:${g.offset_y}`
  const hit = explored.get(cells)
  if (hit && hit.key === key) return hit.path
  const path = new Path2D()
  for (const r of exploredRects(cells, g)) path.rect(r.x, r.y, r.w, r.h)
  explored.set(cells, { key, path })
  return path
}

function polyPath(x: CanvasRenderingContext2D, pts: Pt[]) {
  x.beginPath()
  pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)))
  x.closePath()
}

/** обрезать по многоугольнику света и по сектору, если источник направленный */
function clipLight(x: CanvasRenderingContext2D, s: Lit) {
  polyPath(x, s.pts)
  x.clip()
  if (s.l.angle < 360) {
    const rot = (s.l.rotation * Math.PI) / 180
    const half = (s.l.angle * Math.PI) / 360
    x.beginPath()
    x.moveTo(s.at.x, s.at.y)
    x.arc(s.at.x, s.at.y, (s.rb + s.rd) * 1.05, rot - half, rot + half)
    x.closePath()
    x.clip()
  }
}

/** Подсветка цветом и узоры анимаций — на карте, под слоем темноты */
function drawGlows(ctx: CanvasRenderingContext2D, list: Lit[]) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const s of list) {
    const kind = animationOf(s.l)
    const color = hueShift(s.l.color || '#ffd27a', s.fr.hue)
    const R = s.rb + s.rd
    ctx.save()
    clipLight(ctx, s)
    ctx.globalAlpha = Math.max(0, Math.min(1, (s.l.color_intensity ?? 0.5) * 0.6 * s.fr.alpha))
    const base = ctx.createRadialGradient(s.at.x, s.at.y, 0, s.at.x, s.at.y, R)
    base.addColorStop(0, color)
    base.addColorStop(Math.min(0.95, s.rb / Math.max(1, R)), color)
    base.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = base
    ctx.fillRect(s.at.x - R, s.at.y - R, R * 2, R * 2)
    if (kind === 'sunburst') {
      // лучи вращаются от центра
      const n = 12
      ctx.fillStyle = base
      for (let i = 0; i < n; i++) {
        const a0 = s.fr.spin + (i * Math.PI * 2) / n
        ctx.beginPath()
        ctx.moveTo(s.at.x, s.at.y)
        ctx.arc(s.at.x, s.at.y, R, a0, a0 + Math.PI / (n * 2))
        ctx.closePath()
        ctx.fill()
      }
    } else if (kind === 'fog') {
      // клубы кружат вокруг источника
      for (let i = 0; i < 5; i++) {
        const a = s.fr.spin * (i % 2 ? 1 : -1.3) + (i * Math.PI * 2) / 5
        const dist = R * 0.42 * (0.7 + 0.3 * Math.sin(s.fr.spin * 2 + i))
        const cx = s.at.x + Math.cos(a) * dist
        const cy = s.at.y + Math.sin(a) * dist
        const br = R * 0.45
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, br)
        gr.addColorStop(0, color)
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha *= 0.85
        ctx.fillStyle = gr
        ctx.fillRect(cx - br, cy - br, br * 2, br * 2)
      }
    }
    ctx.restore()
  }
  ctx.restore()
}

export function drawDarkness(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, dark: { current: HTMLCanvasElement | null }, m: BattleMap, vw: MapViewer, v: View, dpr: number, pos: Map<string, Pt>, now: number, sights: Sight[] | null = null) {
  const g = m.grid
  noteServerTime(m, m.server_time)
  const d = darknessAt(m.ambient, serverNow())
  const ambientDark = sceneShade(m.ambient, d)
  const dmFree = vw.isDm && !vw.asPlayer
  const needFog = !!sights
  const calm = isPingCalm()
  const ppf = pxPerFt(g)
  const lightSegs = blockingSegments(m.walls, 'light')
  const lit: Lit[] = []
  for (const l of m.lights) {
    if (!lightActive(l, d)) continue
    const at = lightOrigin(m, l, pos)
    if (!at) continue
    const fr = lightFrame(animationOf(l), now, l.animation_speed, l.animation_intensity, seedOf(l.id), calm)
    const rb = l.bright_ft * ppf * fr.radius
    const rd = l.dim_ft * ppf * fr.radius
    if (rb + rd <= 0) continue
    lit.push({ l, at, rb, rd, fr, pts: visibility(at, rb + rd, lightSegs) })
  }
  const glows = lit.filter((s) => !s.l.negative && (s.l.color || animationOf(s.l) !== 'none'))
  const darks = lit.filter((s) => s.l.negative)
  const lights = lit.filter((s) => !s.l.negative)
  if (glows.length) drawGlows(ctx, glows)
  if (ambientDark <= 0 && !needFog && !darks.length) return

  if (!dark.current) dark.current = document.createElement('canvas')
  const dk = dark.current
  // размер меняем только при изменении: присваивание width/height пересоздаёт буфер
  if (dk.width !== c.width || dk.height !== c.height) {
    dk.width = c.width
    dk.height = c.height
  }
  const dx = dk.getContext('2d')!
  dx.setTransform(1, 0, 0, 1, 0, 0)
  dx.clearRect(0, 0, dk.width, dk.height)
  dx.setTransform(dpr, 0, 0, dpr, 0, 0)
  dx.translate(v.x, v.y)
  dx.scale(v.k, v.k)
  const [cr, cg, cb] = shadeColor(d)
  const shadeTop = dmFree ? Math.min(0.45, ambientDark) : ambientDark
  dx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${needFog ? 1 : shadeTop})`
  dx.fillRect(-10000, -10000, 30000, 30000)
  const cut = (s: Lit, alpha: number) => {
    dx.save()
    dx.globalCompositeOperation = 'destination-out'
    clipLight(dx, s)
    const R = s.rb + s.rd
    const a = alpha * s.fr.alpha
    const gr = dx.createRadialGradient(s.at.x, s.at.y, 0, s.at.x, s.at.y, R)
    gr.addColorStop(0, `rgba(0,0,0,${a})`)
    gr.addColorStop(s.rb / Math.max(1, R), `rgba(0,0,0,${a})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    dx.fillStyle = gr
    dx.fillRect(s.at.x - R, s.at.y - R, R * 2, R * 2)
    dx.restore()
  }
  if (!sights) {
    if (shadeTop > 0) for (const s of lights) cut(s, 1)
  } else {
    // исследованное — приглушённо: карта видна, жетонов и предметов там нет
    const cells = m.fog?.explored
    if (cells?.length) {
      dx.save()
      dx.globalCompositeOperation = 'destination-out'
      dx.fillStyle = `rgba(0,0,0,${1 - EXPLORED_SHADE})`
      dx.fill(exploredPath(cells, g))
      dx.restore()
    }
    // в обзоре — заново темно, дальше свет вырезает
    dx.save()
    dx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`
    for (const s of sights) {
      polyPath(dx, s.pts)
      dx.fill()
    }
    dx.restore()
    for (const { t, p, pts } of sights) {
      // окружение
      if (ambientDark < 0.9) {
        dx.save()
        polyPath(dx, pts)
        dx.clip()
        dx.globalCompositeOperation = 'destination-out'
        dx.fillStyle = `rgba(0,0,0,${1 - ambientDark})`
        dx.fillRect(-10000, -10000, 30000, 30000)
        dx.restore()
      }
      for (const s of lights) {
        dx.save()
        polyPath(dx, pts)
        dx.clip()
        cut(s, 1)
        dx.restore()
      }
      // тёмное зрение: в радиусе темнота как сумерки, серо-синие тона
      const dv = (t.vision_mode === 'darkvision' || t.vision_mode === 'normal') && t.senses?.darkvision ? t.senses.darkvision * ppf : 0
      if (dv > 0) {
        dx.save()
        polyPath(dx, pts)
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
  // источники тьмы: гасят свет и тёмное зрение; мастеру — полупрозрачно
  for (const s of darks) {
    dx.save()
    clipLight(dx, s)
    const R = s.rb + s.rd
    const a = dmFree ? 0.55 : 0.97
    const gr = dx.createRadialGradient(s.at.x, s.at.y, 0, s.at.x, s.at.y, R)
    gr.addColorStop(0, `rgba(0,0,0,${a})`)
    gr.addColorStop(s.rb / Math.max(1, R), `rgba(0,0,0,${a})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    dx.fillStyle = gr
    dx.fillRect(s.at.x - R, s.at.y - R, R * 2, R * 2)
    dx.restore()
  }
  ctx.restore()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(dk, 0, 0)
  // серо-синий оттенок тёмного зрения: поверх тёмных мест цвет уходит
  if (sights && sights.some((s) => s.t.senses?.darkvision) && ambientDark > 0.4) {
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
