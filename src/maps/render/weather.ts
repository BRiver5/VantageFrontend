/**
 * Слой погоды поверх сцены (под темнотой и туманом войны). Частицы — в
 * WeatherField, маска крыш и зон «без погоды» — по карте, пересобирается
 * при её смене. Всё одного вида рисуется одним путём: один stroke или fill
 * на кадр, без выделений памяти. Вкладка в фоне — шаг не считается.
 */
import type { BattleMap } from '../types'
import { WEATHER, WeatherField, isWeatherOn, weatherCount, type WeatherRect } from '../weather'
import { buildWeatherMasks, isMasked, type WeatherMasks } from '../weatherMask'
import type { View } from './types'

let blobSprite: HTMLCanvasElement | null = null
/** мягкое пятно тумана: рисуется один раз */
function blob(): HTMLCanvasElement | null {
  if (blobSprite) return blobSprite
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (!g) return null
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.55, 'rgba(255,255,255,0.45)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  blobSprite = c
  return c
}

export class WeatherLayer {
  field = new WeatherField()
  private map: BattleMap | null = null
  private masks: WeatherMasks | null = null
  private rect: WeatherRect = { x: 0, y: 0, w: 0, h: 0 }

  /** идёт ли погода на этой карте — для решения «перерисовывать каждый кадр» */
  static active(m: BattleMap): boolean {
    return isWeatherOn(m.weather)
  }

  private masksFor(m: BattleMap): WeatherMasks {
    if (m !== this.map || !this.masks) {
      this.map = m
      this.masks = buildWeatherMasks(m)
    }
    return this.masks
  }

  /**
   * Шаг и рисование. ctx уже в координатах карты (камера применена);
   * W, H — размер холста в CSS-пикселях. calm — меньше и медленнее.
   */
  draw(ctx: CanvasRenderingContext2D, m: BattleMap, v: View, W: number, H: number, dt: number, calm: boolean) {
    const w = m.weather
    if (!isWeatherOn(w)) {
      this.field.n = 0
      return
    }
    const g = m.grid
    // видимое ∩ карта
    const x0 = Math.max(g.offset_x, -v.x / v.k)
    const y0 = Math.max(g.offset_y, -v.y / v.k)
    const x1 = Math.min(g.offset_x + g.cols * g.cell_px, (W - v.x) / v.k)
    const y1 = Math.min(g.offset_y + g.rows * g.cell_px, (H - v.y) / v.k)
    if (x1 <= x0 || y1 <= y0) return
    const r = this.rect
    r.x = x0
    r.y = y0
    r.w = x1 - x0
    r.h = y1 - y0
    const unit = g.cell_px / 70
    const spec = WEATHER[w.kind as keyof typeof WEATHER]
    const count = weatherCount(w.kind, w.intensity, r.w * r.h * v.k * v.k, calm)
    const f = this.field
    const hidden = typeof document !== 'undefined' && document.hidden
    f.step(hidden ? 0 : dt, w.kind, w, r, count, unit, calm ? 0.4 : 1)
    const masks = this.masksFor(m)
    const n = f.n
    if (!n) return
    ctx.save()
    switch (spec.look) {
      case 'streak': {
        // дождь: штрих вдоль скорости, два тона — два прохода
        for (let tone = 0; tone < 2; tone++) {
          ctx.beginPath()
          for (let i = 0; i < n; i++) {
            if (f.tone[i] !== tone) continue
            const x = f.x[i]
            const y = f.y[i]
            if (isMasked(masks, x, y)) continue
            const vy = f.vy + f.fall[i]
            const k = 0.028 * f.size[i]
            ctx.moveTo(x, y)
            ctx.lineTo(x - f.vx * k, y - vy * k)
          }
          ctx.strokeStyle = spec.colors[tone]
          ctx.lineWidth = Math.max(0.6, unit * 1.1)
          ctx.stroke()
        }
        break
      }
      case 'flake':
      case 'dust':
      case 'ember': {
        if (spec.look === 'ember') ctx.globalCompositeOperation = 'lighter'
        for (let tone = 0; tone < 2; tone++) {
          ctx.beginPath()
          for (let i = 0; i < n; i++) {
            if (f.tone[i] !== tone) continue
            const x = f.x[i]
            const y = f.y[i]
            if (isMasked(masks, x, y)) continue
            // искры мерцают: часть кадров меньше
            const s = spec.look === 'ember' && !calm ? f.size[i] * (0.6 + 0.4 * Math.abs(Math.sin(f.t * 5 + f.phase[i]))) : f.size[i]
            if (spec.look === 'dust') {
              ctx.rect(x - s / 2, y - s / 2, s, s * 0.7)
            } else {
              ctx.moveTo(x + s, y)
              ctx.arc(x, y, s, 0, Math.PI * 2)
            }
          }
          ctx.fillStyle = spec.colors[tone]
          ctx.fill()
        }
        break
      }
      case 'leaf': {
        for (let tone = 0; tone < 2; tone++) {
          ctx.beginPath()
          for (let i = 0; i < n; i++) {
            if (f.tone[i] !== tone) continue
            const x = f.x[i]
            const y = f.y[i]
            if (isMasked(masks, x, y)) continue
            const s = f.size[i]
            const rot = f.phase[i] + f.t * (calm ? 0.3 : 1.4) * (i % 2 ? 1 : -1)
            ctx.moveTo(x + Math.cos(rot) * s, y + Math.sin(rot) * s)
            ctx.ellipse(x, y, s, s * 0.45, rot, 0, Math.PI * 2)
          }
          ctx.fillStyle = spec.colors[tone]
          ctx.fill()
        }
        break
      }
      case 'blob': {
        const im = blob()
        if (!im) break
        ctx.globalAlpha = spec.alpha * (0.5 + 0.5 * Math.max(0, Math.min(1, w.intensity)))
        for (let i = 0; i < n; i++) {
          const x = f.x[i]
          const y = f.y[i]
          if (isMasked(masks, x, y)) continue
          const s = f.size[i] * 2
          ctx.drawImage(im, x - s / 2, y - s / 2, s, s)
        }
        break
      }
    }
    ctx.restore()
  }
}
