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
import { pxPerFt } from './geometry'
import type { BattleMap, MapToken, Pt } from './types'

import { ELEMENT } from './render/constants'
import { drawGrid, drawLayers, drawObjects, drawTerrain } from './render/background'
import { drawDarkness } from './render/fog'
import { drawFloats } from './render/floats'
import { drawCarriedItems, drawFloorItems } from './render/items'
import { drawLightMarkers } from './render/lights'
import { drawAim, drawDraft, drawGhosts, drawPath, drawPings, drawReach } from './render/overlays'
import { drawTokens } from './render/tokens'
import { drawWalls } from './render/walls'
import { drawZones } from './render/zones'
import type { FloatText, MapCanvasHandle, MapOverlays, MapViewer, Ping } from './render/types'

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
  const pings = useRef<Ping[]>([])
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
      drawLayers(ctx, m, tokens, img)
      // объекты
      drawObjects(ctx, m, vw.isDm, ov, v, img)
      // сложная местность и вода — штриховка
      drawTerrain(ctx, m, ov, v)
      // сетка
      drawGrid(ctx, g, ov, v)

      // зоны
      drawZones(ctx, m, vw.isDm, ov, v, fx.current, dt)
      fx.current.drawDecals(ctx)

      // досягаемые клетки
      if (ov.reach) drawReach(ctx, g, ov.reach)
      if (ov.path && ov.path.length > 1) drawPath(ctx, ov.path, v)

      // предметы на полу
      drawFloorItems(ctx, m, vw.isDm, ov, v, now, img)
      // предметы в руках призванных — у их жетонов
      drawCarriedItems(ctx, m, vw.isDm, v, now, posOf)

      // стены: мастеру и в конструкторе все, игроку — двери и окна
      drawWalls(ctx, m, vw.isDm, ov, v)
      // конструктор: источники света значками
      if (ov.editor) drawLightMarkers(ctx, m, ov, v)
      if (ov.draft && ov.draft.length) drawDraft(ctx, ov.draft, ov.closeDraft, v)

      // жетоны
      const pos = new Map<string, Pt>()
      for (const t of tokens) pos.set(t.id, posOf(t, now))
      drawTokens(ctx, tokens, pos, g, ov, v, img, art)

      // свет и обзор: темнота отдельным слоем (переоткрывает ctx.save камеры — с той же тряской)
      drawDarkness(ctx, c, dark, m, vw, { x: v.x + sh.x, y: v.y + sh.y, k: v.k }, dpr, pos, now)

      // чужие шаблоны
      drawGhosts(ctx, ov.ghosts ?? [], v)
      // наведение
      if (ov.aim && ov.aim.polygon.length) drawAim(ctx, ov.aim, v)

      // пинги
      pings.current = pings.current.filter((pg) => now - pg.t0 < 1400)
      drawPings(ctx, pings.current, now, g, v)
      // частицы и свет эффектов
      fx.current.draw(ctx)
      floats.current = floats.current.filter((f) => (f.life += dt) < 1600)
      drawFloats(ctx, floats.current, g)
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
