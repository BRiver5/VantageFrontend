/**
 * Рендер боевой карты на Canvas 2D. Слои: картинки → рельеф и сетка →
 * зоны → предметы → стены и двери → жетоны → свет и туман → наведение и
 * эффекты. Перерисовка по requestAnimationFrame, только пока что-то
 * меняется или идёт анимация.
 *
 * Свет и тени — на клиенте: многоугольник видимости от каждого источника,
 * стены с blocks.light его режут. Для игрока вне обзора его жетонов
 * темнота; в радиусе тёмного зрения темнота становится серо-синей. Без
 * честного тумана (fog.honest) это только вид: данные приходят все.
 */
import { loadPresets, presetOf, VfxEngine } from './vfx'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent as RPointerEvent } from 'react'
import { blockingSegments, circle, pxPerFt, visibility } from './geometry'
import type { BattleMap, MapToken, Pt } from './types'

import { ELEMENT, REL, SIDE } from './render/constants'
import type { FloatText, MapCanvasHandle, MapOverlays, MapViewer } from './render/types'

export type { MapCanvasHandle, MapOverlays, MapViewer } from './render/types'

type Props = {
  map: BattleMap
  viewer: MapViewer
  overlays?: MapOverlays
  /** картинка жетона: портрет героя, существо, ассет */
  artOf: (t: MapToken) => string | null
  onPointer?: (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent) => boolean | void
  onToken?: (t: MapToken, e: RPointerEvent) => void
  onDoor?: (wallId: string) => void
  className?: string
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ map, viewer, overlays, artOf, onPointer, onToken, onDoor, className }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dark = useRef<HTMLCanvasElement | null>(null)
  // fitted — карта и размер холста, под которые вписана; touched — человек двигал камеру сам
  const cam = useRef({ x: 0, y: 0, k: 1, fitted: '', touched: false })
  const images = useRef(new Map<string, HTMLImageElement>())
  const dirty = useRef(true)
  const anim = useRef(new Map<string, { path: Pt[]; t0: number }>())
  const pings = useRef<{ p: Pt; t0: number; color: string }[]>([])
  const fx = useRef<VfxEngine>(null as unknown as VfxEngine)
  fx.current ??= new VfxEngine()
  useEffect(() => () => fx.current.dispose(), [])
  const floats = useRef<FloatText[]>([])
  const props = useRef({ map, viewer, overlays, artOf })
  props.current = { map, viewer, overlays, artOf }
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; pan: boolean } | null>(null)
  const pinch = useRef(new Map<number, Pt>())

  useEffect(() => {
    dirty.current = true
  }, [map, viewer, overlays])

  const img = useCallback((url: string | null | undefined) => {
    if (!url) return null
    let im = images.current.get(url)
    if (!im) {
      im = new Image()
      im.onload = () => (dirty.current = true)
      im.src = url
      images.current.set(url, im)
    }
    return im.complete && im.naturalWidth ? im : null
  }, [])

  /** где жетон сейчас: с учётом анимации шага и чужого перетаскивания */
  const posOf = useCallback((t: MapToken, now: number): Pt => {
    const dr = props.current.overlays?.drags?.[t.id]
    if (dr) return dr
    const a = anim.current.get(t.id)
    if (a) {
      const per = 120
      const i = (now - a.t0) / per
      if (i >= a.path.length - 1) {
        anim.current.delete(t.id)
        return { x: t.x, y: t.y }
      }
      const k = Math.floor(i)
      const f = i - k
      const p0 = a.path[k]
      const p1 = a.path[k + 1]
      return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f - Math.sin(f * Math.PI) * 4 }
    }
    return { x: t.x, y: t.y }
  }, [])

  useImperativeHandle(ref, () => ({
    toMap: (cx, cy) => {
      const c = canvas.current!
      const r = c.getBoundingClientRect()
      const v = cam.current
      return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }
    },
    centerOn: (p) => {
      const c = canvas.current!
      cam.current.x = c.clientWidth / 2 - p.x * cam.current.k
      cam.current.y = c.clientHeight / 2 - p.y * cam.current.k
      dirty.current = true
    },
    ping: (p, color = '#f5d06a') => {
      pings.current.push({ p, t0: performance.now(), color })
      dirty.current = true
    },
    walk: (tokenId, path) => {
      if (path.length > 1) anim.current.set(tokenId, { path, t0: performance.now() })
      dirty.current = true
    },
    effect: (presetId, p, size) => {
      void loadPresets([presetId]).then(() => {
        fx.current.play(presetOf(presetId), { at: p, size: size ?? 30 })
        dirty.current = true
      })
    },
    vfx: (v, at) => {
      const m = props.current.map
      const tk = v.caster_token_id ? m.tokens.find((t) => t.id === v.caster_token_id) : null
      const caster = tk ? { x: tk.x, y: tk.y } : at(v.actor_combatant_id)
      const pal = v.presentation?.palette?.length ? v.presentation.palette : (ELEMENT[v.presentation?.element ?? v.damage_type ?? 'arcane'] ?? ELEMENT.arcane)
      const pr = v.presentation
      if (pr?.cast || pr?.area || pr?.impact || pr?.travel) {
        void fx.current.run({ ...v, presentation: { ...pr, palette: pal } }, at, caster, (p, text, color) => {
          floats.current.push({ x: p.x, y: p.y - 30, text, color, life: 0 })
        })
        dirty.current = true
        return
      }
      const burst = (p: Pt, n: number, spread: number) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          const s = Math.random() * spread
          fx.current.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 500 + Math.random() * 600, size: 2 + Math.random() * 4, rot: 0, spin: 0, gravity: 0, ramp: [pal[Math.floor(Math.random() * pal.length)]], alpha: [1, 0], blend: 'lighter', sprite: 'spark' })
        }
      }
      // путь снаряда или луча
      const path = v.path?.map(([x, y]) => ({ x, y })) ?? []
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i]
        const b = path[i + 1]
        for (let s = 0; s < 1; s += 0.04) burst({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, 2, 20)
      }
      // область
      const poly = v.polygon?.map(([x, y]) => ({ x, y })) ?? []
      if (poly.length) {
        const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
        const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
        for (const p of poly) burst({ x: cx + (p.x - cx) * Math.random(), y: cy + (p.y - cy) * Math.random() }, 6, 40)
      }
      // попадания и числа
      for (const t of v.targets ?? []) {
        const p = at(t.combatant_id)
        if (!p) continue
        burst(p, t.hit || !t.saved ? 26 : 10, 90)
        const color = t.healed ? '#6fe39a' : v.presentation?.damage_number?.color ?? pal[2]
        const text = t.healed ? `+${t.healed}` : t.damage > 0 ? `−${t.damage}` : t.saved ? 'спас' : 'мимо'
        floats.current.push({ x: p.x, y: p.y - 30, text, color, life: 0 })
      }
      dirty.current = true
    },
  }))

  // рисование
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const now = performance.now()
      const dt = now - last
      last = now
      const c = canvas.current
      if (!c) return
      const zoneFx = props.current.map.zones.some((z) => z.enabled && z.vfx_preset)
      const busy = zoneFx || fx.current.busy || (props.current.overlays?.reachItems?.length ?? 0) > 0 || anim.current.size > 0 || pings.current.length > 0 || floats.current.length > 0 || Object.keys(props.current.overlays?.drags ?? {}).length > 0
      const flick = props.current.map.lights.some((l) => l.flicker && l.enabled)
      if (!dirty.current && !busy && !flick) return
      dirty.current = false
      const { map: m, viewer: vw, overlays: ov = {}, artOf: art } = props.current
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = c.clientWidth
      const H = c.clientHeight
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr)
        c.height = Math.round(H * dpr)
      }
      const g = m.grid
      const mapW = g.cols * g.cell_px + g.offset_x
      const mapH = g.rows * g.cell_px + g.offset_y
      // вписать карту при первом показе
      const fitKey = `${m.id}:${Math.round(W / 40)}x${Math.round(H / 40)}`
      if (W > 0 && (cam.current.fitted.split(':')[0] !== m.id || (!cam.current.touched && cam.current.fitted !== fitKey))) {
        const k = Math.min(W / mapW, H / mapH) * 0.95
        cam.current = { k, x: (W - mapW * k) / 2, y: (H - mapH * k) / 2, fitted: fitKey, touched: cam.current.fitted.split(':')[0] === m.id && cam.current.touched }
      }
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0d0a07'
      ctx.fillRect(0, 0, W, H)
      const v = cam.current
      fx.current.unit = g.cell_px / 70
      fx.current.ppf = pxPerFt(g)
      fx.current.update(dt)
      const sh = fx.current.shake()
      ctx.save()
      ctx.translate(v.x + sh.x, v.y + sh.y)
      ctx.scale(v.k, v.k)

      // слои
      const tokens = m.tokens.filter((t) => vw.isDm || !t.hidden)
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
      // объекты
      for (const o of [...m.objects].filter((o) => vw.isDm || !o.hidden).sort((a, b) => a.z - b.z)) {
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
      // сложная местность и вода — штриховка
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
      // сетка
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

      // зоны
      for (const z of m.zones.filter((z) => z.enabled && (vw.isDm || z.visible_to_players))) {
        const ppf = pxPerFt(g)
        const pts = z.shape.kind === 'circle' && z.shape.center ? circle(z.shape.center, (z.shape.radius_ft ?? 10) * ppf) : z.shape.points ?? []
        ctx.save()
        ctx.fillStyle = z.source?.kind === 'spell' ? 'rgba(170, 120, 255, 0.18)' : 'rgba(255, 200, 90, 0.12)'
        ctx.strokeStyle = z.source?.kind === 'spell' ? 'rgba(190, 150, 255, 0.7)' : 'rgba(255, 210, 120, 0.5)'
        ctx.setLineDash(ov.editor && ov.selected === z.id ? [] : [6 / v.k, 4 / v.k])
        ctx.lineWidth = (ov.editor && ov.selected === z.id ? 3 : 1.5) / v.k
        if (ov.editor && ov.selected === z.id) ctx.strokeStyle = '#78c8ff'
        if (z.shape.kind === 'cells') {
          for (const key of z.shape.cells ?? []) {
            const [cc, rr] = key.split(',').map(Number)
            ctx.fillRect(g.offset_x + cc * g.cell_px, g.offset_y + rr * g.cell_px, g.cell_px, g.cell_px)
          }
        } else if (pts.length) {
          ctx.beginPath()
          pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
        // постоянный эффект зоны
        if (z.vfx_preset) {
          const pre = presetOf(z.vfx_preset)
          if (!pre) void loadPresets([z.vfx_preset])
          const cellsPts = z.shape.kind === 'cells' ? (z.shape.cells ?? []).map((key) => { const [cc, rr] = key.split(',').map(Number); return { x: g.offset_x + (cc + 0.5) * g.cell_px, y: g.offset_y + (rr + 0.5) * g.cell_px } }) : []
          const all = pts.length ? pts : cellsPts
          if (all.length) {
            const cx = all.reduce((s, p) => s + p.x, 0) / all.length
            const cy = all.reduce((s, p) => s + p.y, 0) / all.length
            const size = Math.max(g.cell_px / 2, ...all.map((p) => Math.hypot(p.x - cx, p.y - cy)))
            fx.current.zone(z.id, pre, pts.length > 2 ? { at: { x: cx, y: cy }, size, polygon: pts } : { at: { x: cx, y: cy }, size }, dt)
          }
        }
      }
      fx.current.drawDecals(ctx)

      // досягаемые клетки
      if (ov.reach) {
        for (const [key, cost] of ov.reach) {
          const [cc, rr] = key.split(',').map(Number)
          ctx.fillStyle = cost === 0 ? 'rgba(245, 208, 106, 0.18)' : 'rgba(111, 208, 142, 0.16)'
          ctx.fillRect(g.offset_x + cc * g.cell_px + 1, g.offset_y + rr * g.cell_px + 1, g.cell_px - 2, g.cell_px - 2)
        }
      }
      if (ov.path && ov.path.length > 1) {
        ctx.save()
        ctx.strokeStyle = 'rgba(245, 208, 106, 0.9)'
        ctx.lineWidth = 3 / v.k
        ctx.setLineDash([8 / v.k, 6 / v.k])
        ctx.beginPath()
        ov.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.stroke()
        ctx.restore()
      }

      // предметы на полу
      for (const it of m.items.filter((i) => !i.carried_by && !i.container_object_id && (vw.isDm || !i.hidden))) {
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
      // предметы в руках призванных — у их жетонов
      for (const it of m.items.filter((i) => i.carried_by)) {
        const t = m.tokens.find((x) => x.id === it.carried_by)
        if (!t || (!vw.isDm && t.hidden)) continue
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

      // стены: мастеру и в конструкторе все, игроку — двери и окна
      for (const w of m.walls) {
        const isDoor = w.kind === 'door' || (w.kind === 'secret' && vw.isDm)
        if (!ov.editor && !vw.isDm && !isDoor && w.kind !== 'window') continue
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
      // конструктор: источники света значками
      if (ov.editor) {
        const ppf = g.cell_px / g.feet_per_cell
        for (const l of m.lights) {
          ctx.save()
          ctx.globalAlpha = l.enabled ? 1 : 0.4
          ctx.strokeStyle = l.color || '#ffd27a'
          ctx.setLineDash([4 / v.k, 6 / v.k])
          ctx.lineWidth = 1.2 / v.k
          ctx.beginPath()
          ctx.arc(l.x, l.y, l.bright_ft * ppf, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha *= 0.5
          ctx.beginPath()
          ctx.arc(l.x, l.y, (l.bright_ft + l.dim_ft) * ppf, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = 1
          ctx.fillStyle = l.color || '#ffd27a'
          ctx.strokeStyle = ov.selected === l.id ? '#78c8ff' : '#2a1d0e'
          ctx.lineWidth = (ov.selected === l.id ? 3 : 1.5) / v.k
          ctx.beginPath()
          ctx.arc(l.x, l.y, 7 / v.k, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.restore()
        }
      }
      if (ov.draft && ov.draft.length) {
        ctx.save()
        ctx.strokeStyle = '#fff2c4'
        ctx.lineWidth = 3 / v.k
        ctx.setLineDash([6 / v.k, 4 / v.k])
        ctx.beginPath()
        ov.draft.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        if (ov.closeDraft) {
          ctx.closePath()
          ctx.fillStyle = 'rgba(255, 210, 120, 0.12)'
          ctx.fill()
        }
        ctx.stroke()
        ctx.restore()
      }

      // жетоны
      const pos = new Map<string, Pt>()
      for (const t of tokens) pos.set(t.id, posOf(t, now))
      for (const t of [...tokens].sort((a, b) => a.size - b.size)) {
        const p = pos.get(t.id)!
        const r = (t.size * g.cell_px) / 2 - 2
        const rel = ov.relations?.[t.id]
        const picked = ov.picked?.includes(t.id)
        ctx.save()
        ctx.globalAlpha = t.hidden ? 0.45 : 1
        // тень-подставка (выше — дальше от пола)
        const lift = Math.min(18, (t.elevation_ft ?? 0) / 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.beginPath()
        ctx.ellipse(p.x, p.y + r * 0.85, r * 0.9, r * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()
        const cy = p.y - lift
        if (rel || picked || ov.selected === t.id) {
          ctx.shadowColor = rel ? REL[rel] : picked ? '#ff6b4a' : '#f5d06a'
          ctx.shadowBlur = 18
        }
        ctx.beginPath()
        ctx.arc(p.x, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = '#1a120c'
        ctx.fill()
        ctx.shadowBlur = 0
        const im = img(art(t))
        if (im) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(p.x, cy, r - 2, 0, Math.PI * 2)
          ctx.clip()
          const s = Math.max((r * 2) / im.naturalWidth, (r * 2) / im.naturalHeight)
          ctx.drawImage(im, p.x - (im.naturalWidth * s) / 2, cy - (im.naturalHeight * s) * 0.38, im.naturalWidth * s, im.naturalHeight * s)
          ctx.restore()
        } else {
          ctx.fillStyle = '#f1d9a2'
          ctx.font = `700 ${Math.max(10, r)}px Cormorant Unicase, serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText((t.label || '?').charAt(0).toUpperCase(), p.x, cy + 1)
        }
        ctx.lineWidth = Math.max(2, r * 0.12)
        ctx.strokeStyle = rel ? REL[rel] : picked ? '#ff6b4a' : SIDE[t.side ?? 'neutral'] ?? SIDE.neutral
        ctx.beginPath()
        ctx.arc(p.x, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2)
        ctx.stroke()
        if (ov.selected === t.id) {
          ctx.strokeStyle = '#fff2c4'
          ctx.lineWidth = 2 / v.k
          ctx.setLineDash([5 / v.k, 4 / v.k])
          ctx.beginPath()
          ctx.arc(p.x, cy, r + 5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
        // подпись и высота
        ctx.font = `600 ${Math.max(9, g.cell_px * 0.18)}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
        ctx.fillStyle = '#f1e3c4'
        ctx.strokeText(t.label, p.x, cy + r + 2)
        ctx.fillText(t.label, p.x, cy + r + 2)
        if (t.elevation_ft) {
          const tag = `${t.elevation_ft > 0 ? '▲' : '▼'}${Math.abs(t.elevation_ft)}`
          ctx.fillStyle = '#9fd0ff'
          ctx.strokeText(tag, p.x + r, cy - r - 2)
          ctx.fillText(tag, p.x + r, cy - r - 2)
        }
        // шанс над целью
        const ch = ov.chances?.[t.id]
        if (ch != null) {
          ctx.fillStyle = 'rgba(12, 8, 5, 0.85)'
          ctx.beginPath()
          ctx.arc(p.x, cy - r - 14, 15, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = ch >= 0.65 ? '#6fd08e' : ch <= 0.35 ? '#ff7d63' : '#e4c46e'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(p.x, cy - r - 14, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ch)
          ctx.stroke()
          ctx.fillStyle = '#fff2c4'
          ctx.font = '700 10px Inter, sans-serif'
          ctx.textBaseline = 'middle'
          ctx.fillText(`${Math.round(ch * 100)}`, p.x, cy - r - 14)
        }
        ctx.restore()
      }

      // свет и обзор: темнота отдельным слоем
      const ambientDark = m.ambient?.level === 'dark' ? 0.92 : m.ambient?.level === 'dim' ? 0.5 : 0
      const myEyes = vw.isDm && !vw.asPlayer ? [] : vw.eyes.map((id) => m.tokens.find((t) => t.id === id)).filter((t): t is MapToken => !!t)
      const needFog = !vw.isDm || vw.asPlayer ? myEyes.length > 0 && m.fog?.mode !== 'off' : false
      if (ambientDark > 0 || needFog) {
        if (!dark.current) dark.current = document.createElement('canvas')
        const d = dark.current
        d.width = c.width
        d.height = c.height
        const dx = d.getContext('2d')!
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

      // чужие шаблоны
      for (const gh of ov.ghosts ?? []) {
        if (!gh.polygon.length) continue
        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.fillStyle = `${gh.color}22`
        ctx.strokeStyle = gh.color
        ctx.setLineDash([5 / v.k, 5 / v.k])
        ctx.lineWidth = 1.5 / v.k
        ctx.beginPath()
        gh.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
      // наведение
      if (ov.aim && ov.aim.polygon.length) {
        ctx.save()
        ctx.fillStyle = ov.aim.ok ? `${ov.aim.color}33` : 'rgba(200, 60, 40, 0.18)'
        ctx.strokeStyle = ov.aim.ok ? ov.aim.color : '#e5484d'
        ctx.lineWidth = 2.5 / v.k
        ctx.beginPath()
        ov.aim.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        if (ov.aim.origin) {
          ctx.fillStyle = ov.aim.color
          ctx.beginPath()
          ctx.arc(ov.aim.origin.x, ov.aim.origin.y, 4 / v.k, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      // пинги
      pings.current = pings.current.filter((pg) => now - pg.t0 < 1400)
      for (const pg of pings.current) {
        const f = (now - pg.t0) / 1400
        ctx.save()
        ctx.strokeStyle = pg.color
        ctx.globalAlpha = 1 - f
        ctx.lineWidth = 3 / v.k
        for (const k of [0, 0.35]) {
          const ff = Math.max(0, f - k)
          ctx.beginPath()
          ctx.arc(pg.p.x, pg.p.y, 6 + ff * g.cell_px * 1.6, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      }
      // частицы и свет эффектов
      fx.current.draw(ctx)
      floats.current = floats.current.filter((f) => (f.life += dt) < 1600)
      for (const f of floats.current) {
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
      ctx.restore()
      fx.current.drawFlash(ctx, W, H)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [img, posOf])

  // ввод: свой обработчик решает, иначе — пан камеры; колесо — масштаб; два пальца — щипок
  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    const v = cam.current
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k }
  }
  const tokenAt = (p: Pt): MapToken | null => {
    const { map: m, viewer: vw } = props.current
    const hits = m.tokens.filter((t) => (vw.isDm || !t.hidden) && Math.hypot(t.x - p.x, t.y - p.y) <= (t.size * m.grid.cell_px) / 2)
    return hits.sort((a, b) => a.size - b.size)[0] ?? null
  }
  const doorAt = (p: Pt): string | null => {
    const { map: m } = props.current
    for (const w of m.walls) {
      if (w.kind !== 'door') continue
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
      if (Math.hypot(mid.x - p.x, mid.y - p.y) < m.grid.cell_px * 0.4) return w.id
    }
    return null
  }

  return (
    <canvas
      ref={canvas}
      className={`mp-canvas${className ? ` ${className}` : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => {
        const v = cam.current
        const r = canvas.current!.getBoundingClientRect()
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        const k2 = Math.max(0.15, Math.min(6, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
        v.x = mx - ((mx - v.x) / v.k) * k2
        v.y = my - ((my - v.y) / v.k) * k2
        v.k = k2
        v.touched = true
        dirty.current = true
      }}
      onPointerDown={(e) => {
        canvas.current?.setPointerCapture(e.pointerId)
        pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const p = toMap(e)
        const used = pinch.current.size === 1 && onPointer?.('down', p, e)
        drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false, pan: !used && e.button !== 2 }
      }}
      onPointerMove={(e) => {
        const prev = pinch.current.get(e.pointerId)
        if (prev) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pinch.current.size === 2 && prev) {
          // щипок: масштаб по расстоянию между пальцами
          const [a, b] = [...pinch.current.values()]
          const other = [...pinch.current.entries()].find(([id]) => id !== e.pointerId)![1]
          const d0 = Math.hypot(prev.x - other.x, prev.y - other.y)
          const d1 = Math.hypot(a.x - b.x, a.y - b.y)
          if (d0 > 0) {
            const v = cam.current
            const r = canvas.current!.getBoundingClientRect()
            const mx = (a.x + b.x) / 2 - r.left
            const my = (a.y + b.y) / 2 - r.top
            const k2 = Math.max(0.15, Math.min(6, (v.k * d1) / d0))
            v.x = mx - ((mx - v.x) / v.k) * k2
            v.y = my - ((my - v.y) / v.k) * k2
            v.k = k2
            v.touched = true
            dirty.current = true
          }
          return
        }
        const d = drag.current
        const p = toMap(e)
        if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true
        if (d?.pan && d.moved) {
          cam.current.x = d.cx + e.clientX - d.x
          cam.current.y = d.cy + e.clientY - d.y
          cam.current.touched = true
          dirty.current = true
          return
        }
        onPointer?.('move', p, e)
      }}
      onPointerUp={(e) => {
        pinch.current.delete(e.pointerId)
        const d = drag.current
        drag.current = null
        const p = toMap(e)
        if (d?.pan && !d.moved) {
          const door = doorAt(p)
          if (door && onDoor) return onDoor(door)
          const t = tokenAt(p)
          if (t && onToken) return onToken(t, e)
        }
        if (!d?.pan) onPointer?.('up', p, e)
        else if (!d.moved) onPointer?.('up', p, e)
      }}
      onPointerCancel={(e) => {
        pinch.current.delete(e.pointerId)
        drag.current = null
      }}
    />
  )
})
