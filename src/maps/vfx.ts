/**
 * Эффекты карты по пресетам сервера (GET /vfx/presets). Пресет — набор
 * эмиттеров: форма выброса, спрайт, рампы цвета и прозрачности, скорость,
 * гравитация. Плюс свет, тряска, вспышка и след на полу. Координаты —
 * пиксели карты, скорости — px/с.
 *
 * Сценарий одного map.vfx: cast на заклинателе → travel по пути →
 * area по фигуре → impact на целях → числа. Зоны с vfx_preset дымят
 * непрерывно (rate), пока лежат на карте.
 */
import { request } from '../api'
import type { MapVfx, Pt } from './types'

export interface VfxEmitter {
  sprite: string
  shape: 'point' | 'circle' | 'cone' | 'line' | 'ring' | 'area' | 'path'
  burst: number
  rate: number
  lifetime_ms: [number, number]
  speed: [number, number]
  scale: [number, number]
  spin: number
  gravity: number
  color_ramp: string[]
  alpha_ramp: number[]
  blend: 'add' | 'normal' | 'screen' | 'multiply'
  delay_ms: number
}
export interface VfxPreset {
  id: string
  name: string
  form: string
  element: string
  duration_ms: number
  travel_speed?: number | null
  emitters: VfxEmitter[]
  light?: { color: string; radius_ft: number; intensity: number; flicker: boolean } | null
  shake: number
  flash?: string | null
  decal?: string | null
  sound_tags?: string[]
}

/* ---------- каталог пресетов ---------- */

const cache = new Map<string, VfxPreset | null>()
const waiting = new Map<string, Promise<void>>()

export function presetOf(id: string | null | undefined): VfxPreset | null {
  return id ? (cache.get(id) ?? null) : null
}
/** Подгрузить пресеты пачкой; повторные id не просим */
export function loadPresets(ids: (string | null | undefined)[]): Promise<void> {
  const need = [...new Set(ids.filter((x): x is string => !!x && !cache.has(x) && !waiting.has(x)))]
  const pending = [...new Set(ids.filter((x): x is string => !!x && waiting.has(x)))].map((x) => waiting.get(x)!)
  if (need.length === 0) return Promise.all(pending).then(() => undefined)
  const q = new URLSearchParams()
  need.forEach((x) => q.append('ids', x))
  const p = request<{ items: VfxPreset[] }>(`/vfx/presets?${q}`)
    .then((res) => {
      for (const x of need) cache.set(x, null)
      for (const it of res?.items ?? []) cache.set(it.id, it)
    })
    .catch(() => {
      for (const x of need) cache.set(x, null)
    })
    .finally(() => need.forEach((x) => waiting.delete(x)))
  need.forEach((x) => waiting.set(x, p))
  return Promise.all([p, ...pending]).then(() => undefined)
}
/** Весь список — для выбора в конструкторе */
let all: Promise<VfxPreset[]> | null = null
export function allPresets(): Promise<VfxPreset[]> {
  all ??= request<{ items: VfxPreset[] }>('/vfx/presets').then(
    (r) => {
      for (const it of r?.items ?? []) cache.set(it.id, it)
      return r?.items ?? []
    },
    () => ((all = null), []),
  )
  return all
}

/* ---------- частицы ---------- */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  rot: number
  spin: number
  gravity: number
  ramp: string[]
  alpha: number[]
  blend: GlobalCompositeOperation
  sprite: string
}
interface Glow {
  x: number
  y: number
  r: number
  color: string
  life: number
  max: number
  flicker: boolean
}
/** жест атаки: взмах, выпад, удар — рисуется линией, без частиц */
interface Stroke {
  kind: 'slash' | 'thrust' | 'smash'
  x0: number
  y0: number
  x1: number
  y1: number
  color: string
  /** вбок: +1 или −1 — сторона дуги взмаха */
  side: number
  life: number
  max: number
}
interface Decal {
  x: number
  y: number
  r: number
  kind: string
  life: number
}
interface Shape {
  /** точка выброса */
  at: Pt
  /** куда смотрит (конус, линия) */
  angle?: number
  /** радиус круга, длина конуса и линии */
  size?: number
  /** многоугольник области */
  polygon?: Pt[]
  /** путь снаряда */
  path?: Pt[]
}

const BLEND: Record<string, GlobalCompositeOperation> = { add: 'lighter', normal: 'source-over', screen: 'screen', multiply: 'multiply' }
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const MAX_PARTS = 4000

function pointIn(poly: Pt[]): Pt {
  // случайная точка в многоугольнике: отбор в рамке
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  for (let i = 0; i < 12; i++) {
    const q = { x: rnd(minX, maxX), y: rnd(minY, maxY) }
    let ins = false
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const A = poly[a]
      const B = poly[b]
      if (A.y > q.y !== B.y > q.y && q.x < ((B.x - A.x) * (q.y - A.y)) / (B.y - A.y) + A.x) ins = !ins
    }
    if (ins) return q
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function mix(ramp: string[], t: number): string {
  if (ramp.length === 0) return '#ffffff'
  if (ramp.length === 1) return ramp[0]
  const f = Math.min(0.999, Math.max(0, t)) * (ramp.length - 1)
  const i = Math.floor(f)
  const a = hex(ramp[i])
  const b = hex(ramp[i + 1])
  const k = f - i
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}
const hexCache = new Map<string, [number, number, number]>()
function hex(c: string): [number, number, number] {
  let v = hexCache.get(c)
  if (!v) {
    const s = c.replace('#', '')
    const n = parseInt(s.length === 3 ? s.replace(/(.)/g, '$1$1') : s.slice(0, 6), 16) || 0
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    hexCache.set(c, v)
  }
  return v
}
function alphaAt(ramp: number[], t: number) {
  if (ramp.length === 0) return 1 - t
  if (ramp.length === 1) return ramp[0]
  const f = Math.min(0.999, Math.max(0, t)) * (ramp.length - 1)
  const i = Math.floor(f)
  return ramp[i] + (ramp[i + 1] - ramp[i]) * (f - i)
}

export class VfxEngine {
  parts: Particle[] = []
  glows: Glow[] = []
  decals: Decal[] = []
  strokes: Stroke[] = []
  shakeLeft = 0
  shakePower = 0
  flash: { color: string; life: number } | null = null
  /** зоны: id → когда в последний раз выпускали частицы */
  private zoneAcc = new Map<string, number>()
  private timers: ReturnType<typeof setTimeout>[] = []
  /** пикселей карты в футе — для радиуса света */
  ppf = 14
  /** насколько крупно рисовать: частицы из пресета рассчитаны на клетку ~70px */
  unit = 1

  get busy() {
    return this.parts.length > 0 || this.glows.length > 0 || this.decals.length > 0 || this.strokes.length > 0 || this.timers.length > 0 || this.shakeLeft > 0 || !!this.flash
  }

  dispose() {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  private later(ms: number, fn: () => void) {
    if (ms <= 0) return fn()
    const t = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t)
      fn()
    }, ms)
    this.timers.push(t)
  }

  /** жест рукопашной от a к b (до края цели); miss — серый и мимо */
  strike(kind: Stroke['kind'], a: Pt, b: Pt, color: string, side: 1 | -1 = 1) {
    if (this.strokes.length > 40) return
    this.strokes.push({ kind, x0: a.x, y0: a.y, x1: b.x, y1: b.y, color, side, life: 0, max: kind === 'smash' ? 360 : 300 })
  }

  /**
   * Атака без map.vfx (attackFx.planAttackFx): жест или полёт, потом удар
   * на каждой цели и число. calm — без жеста и полёта, только удар.
   */
  attack(
    plan: { gesture: string; travel: string | null; impact: string | null; melee: boolean },
    from: Pt | null,
    targets: { at: Pt; miss: Pt | null; text: string; color: string }[],
    palette: string[],
    calm: boolean,
    onNumber: (p: Pt, text: string, color: string) => void,
  ) {
    void loadPresets([plan.travel, plan.impact]).then(() => {
      const tr = presetOf(plan.travel)
      const im = presetOf(plan.impact)
      targets.forEach((tg, i) => {
        const side: 1 | -1 = i % 2 ? -1 : 1
        let t = 0
        if (from && !calm) {
          const end = tg.miss ?? tg.at
          if (plan.melee) {
            this.strike(plan.gesture === 'thrust' || plan.gesture === 'smash' ? plan.gesture : 'slash', from, end, tg.miss ? '#9aa0a8' : (palette[1] ?? '#ffffff'), side)
            t = 160
          } else if (plan.travel) {
            t = this.travel(tr, [from, end], tg.miss ? ['#d6d9de', '#9aa0a8'] : palette)
          }
        }
        this.later(t, () => {
          if (!tg.miss) this.play(im, { at: tg.at, size: 22 * this.unit }, palette)
          onNumber(tg.at, tg.text, tg.color)
        })
      })
    })
  }

  /** выпустить n частиц эмиттера по форме */
  private emit(e: VfxEmitter, s: Shape, n: number) {
    n = Math.min(n, MAX_PARTS - this.parts.length)
    const blend = BLEND[e.blend] ?? 'lighter'
    for (let i = 0; i < n; i++) {
      let p = s.at
      let dir = Math.random() * Math.PI * 2
      const base = ((s.angle ?? 0) * Math.PI) / 180
      switch (e.shape) {
        case 'circle': {
          const r = (s.size ?? 0) * Math.sqrt(Math.random())
          p = { x: s.at.x + Math.cos(dir) * r, y: s.at.y + Math.sin(dir) * r }
          if (!s.size) break
          break
        }
        case 'ring': {
          const r = s.size ?? 30
          p = { x: s.at.x + Math.cos(dir) * r, y: s.at.y + Math.sin(dir) * r }
          break
        }
        case 'cone':
          dir = base + rnd(-0.46, 0.46)
          break
        case 'line': {
          const d = Math.random() * (s.size ?? 100)
          p = { x: s.at.x + Math.cos(base) * d, y: s.at.y + Math.sin(base) * d }
          dir = base + rnd(-0.3, 0.3)
          break
        }
        case 'area':
          if (s.polygon?.length) p = pointIn(s.polygon)
          break
        case 'path':
          if (s.path && s.path.length > 1) {
            const k = Math.floor(Math.random() * (s.path.length - 1))
            const a = s.path[k]
            const b = s.path[k + 1]
            const f = Math.random()
            p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
          }
          break
      }
      const sp = rnd(e.speed[0], e.speed[1]) * this.unit
      this.parts.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(dir) * sp,
        vy: Math.sin(dir) * sp,
        life: 0,
        max: rnd(e.lifetime_ms[0], e.lifetime_ms[1]),
        size: rnd(e.scale[0], e.scale[1]) * 9 * this.unit,
        rot: Math.random() * Math.PI * 2,
        spin: e.spin * (Math.random() < 0.5 ? -1 : 1),
        gravity: e.gravity * this.unit,
        ramp: e.color_ramp,
        alpha: e.alpha_ramp,
        blend,
        sprite: e.sprite,
      })
    }
  }

  /** разовый пресет: все эмиттеры burst, свет, тряска, вспышка, след */
  play(preset: VfxPreset | null, s: Shape, fallback?: string[]) {
    if (!preset) {
      // пресета нет: простой всплеск цветом стихии
      const ramp = fallback ?? ['#ffffff', '#d6d1ff', '#8f82ff']
      this.emit({ sprite: 'spark', shape: s.polygon ? 'area' : 'circle', burst: 60, rate: 0, lifetime_ms: [400, 900], speed: [30, 160], scale: [0.3, 0.7], spin: 0, gravity: 0, color_ramp: ramp, alpha_ramp: [1, 0], blend: 'add', delay_ms: 0 }, s, 60)
      return
    }
    for (const e of preset.emitters) this.later(e.delay_ms, () => this.emit(e, s, e.burst || Math.round(e.rate * (preset.duration_ms || 600) / 1000)))
    if (preset.light) this.glows.push({ x: s.at.x, y: s.at.y, r: preset.light.radius_ft * this.ppf, color: preset.light.color, life: 0, max: Math.max(500, preset.duration_ms || 800), flicker: preset.light.flicker })
    if (preset.shake) {
      this.shakeLeft = Math.max(this.shakeLeft, 380)
      this.shakePower = Math.max(this.shakePower, preset.shake * 14)
    }
    if (preset.flash) this.flash = { color: preset.flash, life: 0 }
    if (preset.decal) this.decals.push({ x: s.at.x, y: s.at.y, r: s.size || 40 * this.unit, kind: preset.decal, life: 0 })
  }

  /** снаряд: летит по пути со скоростью пресета, след — его эмиттеры */
  travel(preset: VfxPreset | null, path: Pt[], fallback?: string[]): number {
    if (path.length < 2) return 0
    const len = path.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0)
    const speed = (preset?.travel_speed || 900) * this.unit
    const ms = Math.min(1600, (len / speed) * 1000)
    const steps = Math.max(4, Math.round(ms / 30))
    for (let i = 0; i <= steps; i++) {
      this.later((ms * i) / steps, () => {
        const at = along(path, i / steps)
        if (preset) for (const e of preset.emitters) this.emit(e, { at, angle: 0, size: 6 * this.unit }, Math.max(2, Math.round((e.burst || e.rate * 0.1) / steps)))
        else this.play(null, { at, size: 6 }, fallback)
      })
    }
    return ms
  }

  /** зона: непрерывный выпуск по rate эмиттеров, пока зону рисуют */
  zone(id: string, preset: VfxPreset | null, s: Shape, dt: number) {
    if (!preset) return
    const acc = (this.zoneAcc.get(id) ?? 0) + dt
    this.zoneAcc.set(id, acc % 1000)
    for (const e of preset.emitters) {
      const rate = e.rate || e.burst / 2
      const n = Math.floor((rate * acc) / 1000) - Math.floor((rate * (acc - dt)) / 1000)
      if (n > 0) this.emit({ ...e, shape: s.polygon ? 'area' : e.shape }, s, Math.min(n, 40))
    }
  }

  /** сценарий map.vfx: cast → travel → area → impact → числа */
  async run(v: MapVfx, at: (combatantId: string) => Pt | null, caster: Pt | null, onNumber: (p: Pt, text: string, color: string) => void) {
    const pr = v.presentation as (MapVfx['presentation'] & { cast?: Stage; travel?: Stage; area?: Stage; impact?: Stage; palette?: string[] }) | undefined
    const pal = pr?.palette
    await loadPresets([pr?.cast?.vfx, pr?.travel?.vfx, pr?.area?.vfx, pr?.impact?.vfx])
    const origin = v.origin ? { x: v.origin[0], y: v.origin[1] } : caster
    const poly = v.polygon?.map(([x, y]) => ({ x, y })) ?? []
    let t = 0
    if (caster) this.play(presetOf(pr?.cast?.vfx), { at: caster, size: 18 * this.unit }, pal)
    t += pr?.cast ? 220 : 0
    const path = v.path?.length ? v.path.map(([x, y]) => ({ x, y })) : caster && origin && Math.hypot(origin.x - caster.x, origin.y - caster.y) > 30 && pr?.travel ? [caster, origin] : []
    if (path.length > 1) {
      const tr = presetOf(pr?.travel?.vfx)
      this.later(t, () => this.travel(tr, path, pal))
      const len = path.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0)
      t += Math.min(1600, (len / ((tr?.travel_speed || 900) * this.unit)) * 1000)
    }
    if (poly.length && origin) {
      const ar = presetOf(pr?.area?.vfx)
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
      const size = Math.max(...poly.map((p) => Math.hypot(p.x - cx, p.y - cy)))
      this.later(t + (pr?.area?.delay_ms ?? 0), () => this.play(ar, { at: ar?.form === 'cone' || ar?.form === 'line' ? origin : { x: cx, y: cy }, angle: v.angle_deg ?? 0, size, polygon: poly }, pal))
      t += 260
    }
    const im = presetOf(pr?.impact?.vfx)
    const dmgColor = v.presentation?.damage_number?.color ?? pal?.[1] ?? '#ffd27a'
    for (const tg of v.targets ?? []) {
      const p = at(tg.combatant_id)
      if (!p) continue
      this.later(t + (pr?.impact?.delay_ms ?? 0), () => {
        if (tg.hit !== false || !tg.saved) this.play(im, { at: p, size: 22 * this.unit }, pal)
        const text = tg.healed ? `+${tg.healed}` : tg.damage > 0 ? `−${tg.damage}` : tg.saved ? 'спас' : 'мимо'
        onNumber(p, text, tg.healed ? '#6fe39a' : dmgColor)
      })
    }
  }

  update(dt: number) {
    const s = dt / 1000
    this.parts = this.parts.filter((q) => (q.life += dt) < q.max)
    for (const q of this.parts) {
      q.x += q.vx * s
      q.y += q.vy * s
      q.vy += q.gravity * s
      q.vx *= 0.985
      q.vy *= 0.985
      q.rot += q.spin * s
    }
    this.glows = this.glows.filter((g) => (g.life += dt) < g.max)
    this.decals = this.decals.filter((d) => (d.life += dt) < 9000)
    if (this.strokes.length) this.strokes = this.strokes.filter((k) => (k.life += dt) < k.max)
    if (this.shakeLeft > 0) this.shakeLeft = Math.max(0, this.shakeLeft - dt)
    if (this.flash && (this.flash.life += dt) > 260) this.flash = null
  }

  /** сдвиг камеры от тряски, в экранных px */
  shake(): Pt {
    if (this.shakeLeft <= 0) return { x: 0, y: 0 }
    const k = (this.shakeLeft / 380) * this.shakePower
    return { x: rnd(-k, k), y: rnd(-k, k) }
  }

  /** следы на полу — под жетонами */
  drawDecals(ctx: CanvasRenderingContext2D) {
    for (const d of this.decals) {
      const a = d.life < 300 ? d.life / 300 : 1 - Math.max(0, d.life - 6000) / 3000
      const col = { scorch: '20,12,8', frost: '200,230,255', acid_pool: '120,200,60', poison_pool: '80,160,70', rot: '70,50,90', glow: '255,230,150', crack: '40,30,20' }[d.kind] ?? '20,12,8'
      const gr = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r)
      gr.addColorStop(0, `rgba(${col},${0.55 * a})`)
      gr.addColorStop(1, `rgba(${col},0)`)
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** жесты: дуга взмаха, выпад, удар с кольцом */
  private drawStrokes(ctx: CanvasRenderingContext2D) {
    for (const k of this.strokes) {
      const f = k.life / k.max
      const dx = k.x1 - k.x0
      const dy = k.y1 - k.y0
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      ctx.globalAlpha = Math.max(0, 1 - f) * 0.9
      ctx.strokeStyle = k.color
      ctx.lineCap = 'round'
      if (k.kind === 'slash') {
        // дуга у цели: проходит поперёк линии удара
        const cx = k.x1 - ux * len * 0.15
        const cy = k.y1 - uy * len * 0.15
        const r = Math.max(14, 26 * this.unit)
        const base = Math.atan2(dy, dx) + (Math.PI / 2) * k.side
        const sweep = Math.PI * 0.9 * Math.min(1, f * 2.2)
        ctx.lineWidth = Math.max(2, 5 * this.unit * (1 - f))
        ctx.beginPath()
        ctx.arc(cx, cy, r, base, base - sweep * k.side, k.side > 0)
        ctx.stroke()
      } else if (k.kind === 'thrust') {
        const reach = Math.min(len, 1.6 * len * Math.min(1, f * 2.5))
        const sx = k.x1 - ux * Math.min(len, 34 * this.unit)
        const sy = k.y1 - uy * Math.min(len, 34 * this.unit)
        const ex = sx + ux * Math.min(reach, 40 * this.unit)
        const ey = sy + uy * Math.min(reach, 40 * this.unit)
        ctx.lineWidth = Math.max(2, 4 * this.unit)
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      } else {
        ctx.lineWidth = Math.max(2, 4 * this.unit * (1 - f))
        ctx.beginPath()
        ctx.arc(k.x1, k.y1, (8 + 30 * f) * this.unit, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  /** частицы и свет — поверх всего */
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    if (this.strokes.length) this.drawStrokes(ctx)
    for (const g of this.glows) {
      const k = 1 - g.life / g.max
      const a = (g.flicker ? 0.75 + Math.random() * 0.25 : 1) * k * 0.55
      const [r, gg, b] = hex(g.color)
      const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r)
      gr.addColorStop(0, `rgba(${r},${gg},${b},${a})`)
      gr.addColorStop(1, `rgba(${r},${gg},${b},0)`)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const q of this.parts) {
      const t = q.life / q.max
      ctx.globalCompositeOperation = q.blend
      ctx.globalAlpha = Math.max(0, Math.min(1, alphaAt(q.alpha, t)))
      const col = mix(q.ramp, t)
      ctx.fillStyle = col
      ctx.strokeStyle = col
      const sz = q.size * (q.sprite === 'smoke' ? 1 + t * 1.5 : 1)
      drawSprite(ctx, q.sprite, q.x, q.y, sz, q.rot)
    }
    ctx.restore()
  }

  /** вспышка поверх экрана (в экранных координатах) */
  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.flash) return
    ctx.save()
    ctx.globalAlpha = 0.35 * (1 - this.flash.life / 260)
    ctx.fillStyle = this.flash.color
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
}

interface Stage {
  vfx: string
  at?: string
  delay_ms?: number
}

function along(path: Pt[], f: number): Pt {
  const lens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y))
  let d = lens.reduce((a, b) => a + b, 0) * f
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 0
      return { x: path[i].x + (path[i + 1].x - path[i].x) * k, y: path[i].y + (path[i + 1].y - path[i].y) * k }
    }
    d -= lens[i]
  }
  return path[path.length - 1]
}

/** Спрайты рисуем сами: без картинок, дёшево */
function drawSprite(ctx: CanvasRenderingContext2D, sprite: string, x: number, y: number, s: number, rot: number) {
  switch (sprite) {
    case 'smoke':
    case 'glow':
    case 'wisp':
    case 'dust': {
      const r = s * (sprite === 'dust' ? 0.6 : 1.4)
      ctx.globalAlpha *= sprite === 'smoke' ? 0.35 : 0.6
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'ring': {
      ctx.lineWidth = Math.max(1, s * 0.18)
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.stroke()
      return
    }
    case 'bolt': {
      ctx.lineWidth = Math.max(1, s * 0.2)
      ctx.beginPath()
      ctx.moveTo(x, y)
      let px = x
      let py = y
      for (let i = 0; i < 3; i++) {
        px += Math.cos(rot) * s + rnd(-s, s) * 0.6
        py += Math.sin(rot) * s + rnd(-s, s) * 0.6
        ctx.lineTo(px, py)
      }
      ctx.stroke()
      return
    }
    case 'shard':
    case 'flake':
    case 'star':
    case 'rune':
    case 'leaf':
    case 'feather':
    case 'note':
    case 'skull': {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      if (sprite === 'shard') {
        ctx.moveTo(0, -s)
        ctx.lineTo(s * 0.35, 0)
        ctx.lineTo(0, s)
        ctx.lineTo(-s * 0.35, 0)
      } else if (sprite === 'flake' || sprite === 'star') {
        const n = sprite === 'flake' ? 6 : 5
        for (let i = 0; i < n * 2; i++) {
          const r = i % 2 ? s * 0.4 : s
          const a = (i / (n * 2)) * Math.PI * 2
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
      } else if (sprite === 'leaf' || sprite === 'feather') {
        ctx.ellipse(0, 0, s, s * 0.35, 0, 0, Math.PI * 2)
      } else {
        ctx.rect(-s * 0.5, -s * 0.5, s, s)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      return
    }
    case 'droplet':
    case 'bubble': {
      ctx.beginPath()
      ctx.arc(x, y, s * 0.6, 0, Math.PI * 2)
      if (sprite === 'bubble') {
        ctx.lineWidth = Math.max(1, s * 0.15)
        ctx.stroke()
      } else ctx.fill()
      return
    }
    default: {
      // spark, ember и прочее — светящаяся точка
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.8, s * 0.45), 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
