/**
 * Пинги: метка в точке (в координатах карты) и стрелка у края экрана, если
 * точка не видна (в координатах экрана). Размеры — в пикселях экрана, чтобы
 * метка читалась при любом масштабе.
 */
import { edgeArrow, pingLife } from '../pings'
import type { Ping, View } from './types'

const TAU = Math.PI * 2

/** Метки пингов. Вызывать внутри преобразования камеры */
export function drawPingMarkers(ctx: CanvasRenderingContext2D, pings: Ping[], now: number, v: View, calm: boolean) {
  const u = 1 / v.k
  for (const pg of pings) {
    const kind = pg.kind ?? 'basic'
    const life = pingLife(kind, calm)
    const t = now - pg.t0
    const f = Math.min(1, t / life)
    // в конце плавно гаснет
    const fade = f > 0.8 ? (1 - f) / 0.2 : 1
    const { x, y } = pg.p
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (calm) {
      calmMarker(ctx, x, y, u, pg.color, fade, t)
      ctx.restore()
      continue
    }
    if (kind === 'alert') {
      ripples(ctx, x, y, u, pg.color, fade, t, 900, 46)
      const s = 1 + 0.12 * Math.sin((t / 260) * TAU * 0.5)
      triangle(ctx, x, y - 4 * u, 17 * u * s, pg.color, fade)
    } else if (kind === 'pan') {
      ripples(ctx, x, y, u, pg.color, fade, t, 1100, 40)
      const bob = Math.sin((t / 600) * TAU) * 4 * u
      chevrons(ctx, x, y - 16 * u + bob, u, pg.color, fade)
    } else {
      ripples(ctx, x, y, u, pg.color, fade, t, 700, 34)
      ctx.globalAlpha = fade
      ctx.fillStyle = pg.color
      ctx.beginPath()
      ctx.arc(x, y, 4 * u, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** Стрелки у края для пингов вне экрана. Вызывать в координатах экрана (без камеры) */
export function drawPingEdges(ctx: CanvasRenderingContext2D, pings: Ping[], now: number, v: View, w: number, h: number, calm: boolean) {
  for (const pg of pings) {
    const kind = pg.kind ?? 'basic'
    const sx = pg.p.x * v.k + v.x
    const sy = pg.p.y * v.k + v.y
    const a = edgeArrow({ x: sx, y: sy }, w, h)
    if (!a) continue
    const t = now - pg.t0
    const f = Math.min(1, t / pingLife(kind, calm))
    const fade = f > 0.8 ? (1 - f) / 0.2 : 1
    // пульс: в щадящем режиме медленный и неглубокий
    const pulse = calm ? 1 : 1 + 0.18 * Math.sin((t / 450) * TAU)
    ctx.save()
    ctx.translate(a.x, a.y)
    ctx.rotate(a.angle)
    ctx.scale(pulse, pulse)
    ctx.globalAlpha = fade * (calm ? 0.85 : 1)
    ctx.fillStyle = pg.color
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(-10, -11)
    ctx.lineTo(-5, 0)
    ctx.lineTo(-10, 11)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    ctx.restore()
  }
}

/** расходящиеся кольца: period — период, size — радиус, пиксели экрана */
function ripples(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, fade: number, t: number, period: number, size: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = 3 * u
  for (const off of [0, 0.5]) {
    const ph = ((t / period + off) % 1 + 1) % 1
    ctx.globalAlpha = fade * (1 - ph)
    ctx.beginPath()
    ctx.arc(x, y, (6 + ph * size) * u, 0, TAU)
    ctx.stroke()
  }
}

function triangle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, fade: number) {
  ctx.globalAlpha = fade
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.95, y + r * 0.7)
  ctx.lineTo(x - r * 0.95, y + r * 0.7)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(20, 0, 0, 0.85)'
  ctx.lineWidth = r * 0.14
  ctx.stroke()
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillRect(x - r * 0.07, y - r * 0.45, r * 0.14, r * 0.6)
  ctx.beginPath()
  ctx.arc(x, y + r * 0.37, r * 0.09, 0, TAU)
  ctx.fill()
}

/** шевроны «сюда», остриё вниз к точке */
function chevrons(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, fade: number) {
  ctx.globalAlpha = fade
  ctx.lineWidth = 5 * u
  for (const [dy, a] of [[-12, 0.55], [0, 1]] as const) {
    ctx.globalAlpha = fade * a
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.lineWidth = 8 * u
    path(ctx, x, y + dy * u, u)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 5 * u
    path(ctx, x, y + dy * u, u)
    ctx.stroke()
  }
}

function path(ctx: CanvasRenderingContext2D, x: number, y: number, u: number) {
  ctx.beginPath()
  ctx.moveTo(x - 12 * u, y - 7 * u)
  ctx.lineTo(x, y + 5 * u)
  ctx.lineTo(x + 12 * u, y - 7 * u)
}

/** Щадящий вид: ровный круг и стрелка сверху, яркость меняется медленно и неглубоко */
function calmMarker(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, fade: number, t: number) {
  const breathe = 0.75 + 0.15 * Math.sin((t / 2400) * TAU)
  ctx.globalAlpha = fade * breathe
  ctx.strokeStyle = color
  ctx.lineWidth = 3 * u
  ctx.beginPath()
  ctx.arc(x, y, 22 * u, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = fade * breathe * 0.25
  ctx.fillStyle = color
  ctx.fill()
  // стрелка вниз над кругом
  ctx.globalAlpha = fade * breathe
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.lineWidth = 2 * u
  ctx.beginPath()
  ctx.moveTo(x, y - 26 * u)
  ctx.lineTo(x - 9 * u, y - 40 * u)
  ctx.lineTo(x - 3.5 * u, y - 40 * u)
  ctx.lineTo(x - 3.5 * u, y - 52 * u)
  ctx.lineTo(x + 3.5 * u, y - 52 * u)
  ctx.lineTo(x + 3.5 * u, y - 40 * u)
  ctx.lineTo(x + 9 * u, y - 40 * u)
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
}
