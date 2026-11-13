/**
 * Состояния на жетоне (tokenLooks): кольцо концентрации под ногами,
 * фильтр портрета (серый, камень, повержен), тон поверх портрета (яд,
 * огонь, страх), рябь невидимости и череп поверженного. still — без
 * движения (prefers-reduced-motion, щадящий режим): пульсы замирают.
 */
import type { TokenLook } from '../tokenLooks'

/** прозрачность жетона: невидимого видят полупрозрачным */
export const lookAlpha = (l: TokenLook | undefined) => (l?.invisible ? 0.42 : 1)

/** фильтр портрета: серый, камень, повержен */
export function lookFilter(l: TokenLook | undefined): string {
  if (!l) return 'none'
  if (l.dead) return 'grayscale(1) brightness(0.62)'
  if (l.stone) return 'grayscale(1) sepia(0.25) brightness(1.08) contrast(0.9)'
  if (l.grey) return 'grayscale(0.9) brightness(0.9)'
  return 'none'
}

/** дрожь испуганного: сдвиг по x в px */
export const lookJitter = (l: TokenLook | undefined, now: number, still: boolean) => (l?.frightened && !still ? Math.sin(now * 0.06) * 1.4 + Math.sin(now * 0.023) * 0.8 : 0)

const pulse = (now: number, period: number, still: boolean) => (still ? 0.5 : 0.5 + 0.5 * Math.sin((now / period) * Math.PI * 2))

/** под жетоном: мягкое кольцо концентрации */
export function drawLookUnder(ctx: CanvasRenderingContext2D, l: TokenLook, x: number, y: number, r: number, now: number, still: boolean) {
  if (!l.concentration) return
  const k = pulse(now, 2400, still)
  ctx.save()
  ctx.strokeStyle = `rgba(170, 200, 255, ${0.35 + 0.3 * k})`
  ctx.lineWidth = Math.max(2, r * 0.1)
  ctx.shadowColor = 'rgba(150, 190, 255, 0.9)'
  ctx.shadowBlur = 10 + 8 * k
  ctx.beginPath()
  ctx.arc(x, y, r + 4 + 2 * k, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** поверх портрета (внутри круга жетона): тон и мерцание */
export function drawLookTint(ctx: CanvasRenderingContext2D, l: TokenLook, x: number, y: number, r: number, now: number, still: boolean) {
  if (l.poisoned) {
    const k = pulse(now, 1600, still)
    ctx.fillStyle = `rgba(90, 200, 70, ${0.16 + 0.18 * k})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (l.frightened) {
    ctx.fillStyle = 'rgba(60, 20, 90, 0.28)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (l.stone) {
    ctx.fillStyle = 'rgba(150, 145, 135, 0.25)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (l.burning) {
    const k = still ? 0.5 : 0.5 + 0.3 * Math.sin(now * 0.021) + 0.2 * Math.sin(now * 0.047)
    const g = ctx.createRadialGradient(x, y + r * 0.5, r * 0.1, x, y, r)
    g.addColorStop(0, `rgba(255, 150, 40, ${0.15 + 0.2 * k})`)
    g.addColorStop(1, 'rgba(255, 70, 20, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** снаружи жетона: языки огня, рябь невидимости, череп */
export function drawLookOver(ctx: CanvasRenderingContext2D, l: TokenLook, x: number, y: number, r: number, now: number, still: boolean) {
  if (l.burning) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const t = still ? 0 : now / 1000
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + 0.175 * i) + Math.PI
      const bx = x + Math.cos(a) * r * 0.92
      const by = y + Math.sin(a) * r * 0.92
      const h = r * (0.35 + 0.18 * Math.sin(t * 7 + i * 1.9))
      const w = r * 0.16
      ctx.fillStyle = i % 2 ? 'rgba(255, 120, 30, 0.7)' : 'rgba(255, 200, 80, 0.7)'
      ctx.beginPath()
      ctx.moveTo(bx - w, by)
      ctx.quadraticCurveTo(bx - w * 0.3, by - h * 0.6, bx + Math.sin(t * 5 + i) * w * 0.6, by - h)
      ctx.quadraticCurveTo(bx + w * 0.3, by - h * 0.6, bx + w, by)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
  if (l.invisible) {
    const t = still ? 0 : now / 1000
    ctx.save()
    ctx.strokeStyle = 'rgba(200, 225, 255, 0.55)'
    ctx.lineWidth = 1.5
    for (let j = 0; j < 2; j++) {
      ctx.beginPath()
      for (let s = 0; s <= 48; s++) {
        const a = (s / 48) * Math.PI * 2
        const rr = r + 2 + j * 4 + Math.sin(a * 6 + t * (3 + j) + j) * 1.6
        const px = x + Math.cos(a) * rr
        const py = y + Math.sin(a) * rr
        if (s === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
  if (l.dead) {
    const s = Math.max(10, r * 0.55)
    ctx.save()
    ctx.font = `${s}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(12, 8, 5, 0.8)'
    ctx.beginPath()
    ctx.arc(x + r * 0.68, y - r * 0.68, s * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e8e2d6'
    ctx.fillText('☠', x + r * 0.68, y - r * 0.66)
    ctx.restore()
  }
}
