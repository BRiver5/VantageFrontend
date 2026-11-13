/**
 * Рисование на карте стола. Инструменты: выбор (сдвиг, порядок, скрыть),
 * прямоугольник и эллипс (тянуть; Shift — квадрат и круг), многоугольник
 * (клики ставят точки, двойной клик или Enter заканчивает, правый клик
 * убирает последнюю точку), от руки (со сглаживанием), текст (клик — место,
 * текст вводится в панели). Esc — сбросить черновик.
 *
 * Рисунок уходит на сервер, когда закончен; событие map.drawings разносит
 * его всем. Права: мастер всегда, игрок — при «Игроки могут рисовать», свой
 * рисунок игрок может стереть всегда.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import type { Pt } from '../types'
import type { MapLayers } from '../layers/useMapLayers'
import type { DrawingKind, DrawingStyle, MapDrawing } from '../layers/types'
import { clearDrawings, createDrawing, deleteDrawing, patchDrawing } from '../layers/api'
import { drawingAt, moveDrawing, polygonAdd, polygonFinish, polygonUndo, rectFrom, smoothStroke, textBox, zFor } from './geometry'
import { loadStyle, saveStyle } from './style'

export type DrawTool = 'select' | DrawingKind

export interface DrawToolApi {
  active: boolean
  setActive: (v: boolean) => void
  tool: DrawTool
  setTool: (t: DrawTool) => void
  style: DrawingStyle
  setStyle: (patch: Partial<DrawingStyle>) => void
  /** может создавать и править */
  canDraw: boolean
  isDm: boolean
  selected: MapDrawing | null
  /** точка, куда встанет текст */
  textAt: Pt | null
  placeText: (text: string) => void
  cancelText: () => void
  /** ввод с карты: true — событие забрано */
  pointer: (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent) => boolean
  overlay: { drawingDraft: { drawing: MapDrawing; open: boolean; cursor?: Pt | null } | null; layerSelected: string | null }
  remove: (id: string) => void
  toggleHidden: (d: MapDrawing) => void
  reorder: (d: MapDrawing, dir: 'front' | 'back') => void
  clear: (scope: 'mine' | 'all') => void
  mineCount: number
}

const draftOf = (kind: DrawingKind, style: DrawingStyle, over: Partial<MapDrawing>): MapDrawing => ({ id: 'draft', map_id: '', author_id: '', kind, x: 0, y: 0, w: 0, h: 0, points: [], text: '', z: 0, hidden: false, ...style, ...over })

export function useDrawTool(opts: { roomId: string; mapId: string | null; layers: MapLayers; isDm: boolean; me: string | undefined; playersCanDraw: boolean; zoom: () => number; onError: (t: string) => void }): DrawToolApi {
  const { roomId, mapId, layers, isDm, me, playersCanDraw, zoom, onError } = opts
  const canDraw = isDm || playersCanDraw
  const [active, setActiveState] = useState(false)
  const [tool, setToolState] = useState<DrawTool>('freehand')
  const [style, setStyleState] = useState<DrawingStyle>(loadStyle)
  const [draft, setDraft] = useState<MapDrawing | null>(null)
  const [poly, setPoly] = useState<Pt[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [textAt, setTextAt] = useState<Pt | null>(null)
  const start = useRef<Pt | null>(null)
  const raw = useRef<Pt[]>([])
  const lastUp = useRef({ t: 0, p: { x: 0, y: 0 } })
  const moving = useRef<{ id: string; from: Pt; base: MapDrawing; moved: boolean } | null>(null)
  const [moved, setMoved] = useState<MapDrawing | null>(null)

  const selected = layers.drawings.find((d) => d.id === selId) ?? null
  const mine = (d: MapDrawing) => d.author_id === me
  const editable = (d: MapDrawing) => isDm || (canDraw && mine(d))

  const reset = useCallback(() => {
    setDraft(null)
    setPoly([])
    setCursor(null)
    setTextAt(null)
    start.current = null
    raw.current = []
  }, [])
  const setActive = useCallback(
    (v: boolean) => {
      setActiveState(v)
      reset()
      if (!v) setSelId(null)
    },
    [reset],
  )
  const setTool = useCallback(
    (t: DrawTool) => {
      setToolState(t)
      reset()
      if (t !== 'select') setSelId(null)
    },
    [reset],
  )
  const setStyle = useCallback((patch: Partial<DrawingStyle>) => {
    setStyleState((s) => {
      const next = { ...s, ...patch }
      saveStyle(next)
      return next
    })
  }, [])

  // выбранный рисунок меняет стиль: правка уходит и на сервер
  const styleSel = useRef(style)
  useEffect(() => {
    const prev = styleSel.current
    styleSel.current = style
    if (!selected || !editable(selected) || !mapId) return
    const diff = Object.fromEntries(Object.entries(style).filter(([k, v]) => prev[k as keyof DrawingStyle] !== v && selected[k as keyof DrawingStyle] !== v))
    if (Object.keys(diff).length === 0) return
    layers.put('drawings', { upsert: [{ ...selected, ...diff }] })
    void patchDrawing(roomId, mapId, selected.id, diff).catch((e) => onError(errText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style])

  const submit = useCallback(
    async (d: MapDrawing) => {
      if (!mapId) return
      const { id: _id, map_id: _m, author_id: _a, z: _z, ...body } = d
      try {
        const saved = await createDrawing(roomId, mapId, body)
        if (saved) layers.put('drawings', { upsert: [saved] })
      } catch (e) {
        onError(errText(e))
      }
    },
    [roomId, mapId, layers, onError],
  )

  const finishPolygon = useCallback(
    (points: Pt[]) => {
      const done = polygonFinish(points, 2 / zoom())
      if (done) void submit(draftOf('polygon', style, { points: done }))
      else if (points.length) onError('Многоугольнику нужно хотя бы три точки')
      setPoly([])
      setCursor(null)
    },
    [submit, style, zoom, onError],
  )

  // клавиши черновика
  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === 'Escape') {
        if (poly.length || draft || textAt) {
          e.stopPropagation()
          reset()
        } else setSelId(null)
      } else if (e.key === 'Enter' && poly.length) finishPolygon(poly)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && (isDm || mine(selected))) remove(selected.id)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const remove = (id: string) => {
    if (!mapId) return
    layers.put('drawings', { remove: [id] })
    setSelId(null)
    void deleteDrawing(roomId, mapId, id).catch((e) => {
      onError(errText(e))
      layers.reload()
    })
  }
  const patchSel = (d: MapDrawing, body: Partial<MapDrawing>) => {
    if (!mapId) return
    layers.put('drawings', { upsert: [{ ...d, ...body }] })
    void patchDrawing(roomId, mapId, d.id, body).catch((e) => {
      onError(errText(e))
      layers.reload()
    })
  }

  const pointer = (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent): boolean => {
    if (!active) return false
    const k = zoom()
    if (tool === 'select') {
      if (kind === 'down') {
        if (e.button !== 0) return false
        const hit = drawingAt(layers.drawings, p, 6 / k)
        setSelId(hit?.id ?? null)
        if (hit) {
          if (!hit.hidden || isDm) setStyleState((s) => ({ ...s, ...pickStyle(hit) }))
          styleSel.current = { ...style, ...pickStyle(hit) }
        }
        if (hit && editable(hit)) {
          moving.current = { id: hit.id, from: p, base: hit, moved: false }
          return true
        }
        return false
      }
      const mv = moving.current
      if (kind === 'move' && mv) {
        if (!mv.moved && Math.hypot(p.x - mv.from.x, p.y - mv.from.y) < 3 / k) return true
        mv.moved = true
        setMoved({ ...mv.base, ...moveDrawing(mv.base, p.x - mv.from.x, p.y - mv.from.y) })
        return true
      }
      if (kind === 'up' && mv) {
        moving.current = null
        setMoved(null)
        if (mv.moved) patchSel(mv.base, moveDrawing(mv.base, p.x - mv.from.x, p.y - mv.from.y))
        return true
      }
      return false
    }
    if (!canDraw) return false
    if (tool === 'polygon') {
      if (kind === 'down') {
        if (e.button === 2) {
          setPoly((pts) => polygonUndo(pts))
          return true
        }
        return e.button === 0
      }
      if (kind === 'move') {
        if (poly.length) setCursor(p)
        return poly.length > 0
      }
      if (e.button !== 0) return true
      const now = performance.now()
      const dbl = now - lastUp.current.t < 320 && Math.hypot(p.x - lastUp.current.p.x, p.y - lastUp.current.p.y) < 8 / k
      lastUp.current = { t: now, p }
      const next = polygonAdd(poly, p, 2 / k)
      if (dbl) finishPolygon(next)
      else setPoly(next)
      return true
    }
    if (tool === 'text') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) setTextAt(p)
      return true
    }
    // прямоугольник, эллипс, от руки: тянуть
    if (kind === 'down') {
      if (e.button !== 0) return false
      start.current = p
      raw.current = [p]
      return true
    }
    const a = start.current
    if (!a) return false
    if (kind === 'move') {
      if (tool === 'freehand') {
        const last = raw.current[raw.current.length - 1]
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 1.5 / k) raw.current.push(p)
        setDraft(draftOf('freehand', style, { points: [...raw.current] }))
      } else setDraft(draftOf(tool, style, rectFrom(a, p, e.shiftKey)))
      return true
    }
    // up
    start.current = null
    setDraft(null)
    if (tool === 'freehand') {
      raw.current.push(p)
      const pts = smoothStroke(raw.current, 1.2 / k)
      raw.current = []
      if (pts.length >= 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) + pts.length > 3) void submit(draftOf('freehand', style, { points: pts }))
      return true
    }
    const box = rectFrom(a, p, e.shiftKey)
    if (box.w > 3 / k && box.h > 3 / k) void submit(draftOf(tool, style, box))
    return true
  }

  const placeText = (text: string) => {
    const t = text.trim()
    if (t && textAt) void submit(draftOf('text', style, { x: textAt.x, y: textAt.y, text: t, ...textBox(t, style.font_size) }))
    setTextAt(null)
  }

  const polyDraft = poly.length ? draftOf('polygon', style, { points: poly }) : null
  const shownDraft = polyDraft ? { drawing: polyDraft, open: true, cursor } : draft ? { drawing: draft, open: false } : moved ? { drawing: moved, open: false } : null

  return {
    active,
    setActive,
    tool,
    setTool,
    style,
    setStyle,
    canDraw,
    isDm,
    selected,
    textAt,
    placeText,
    cancelText: () => setTextAt(null),
    pointer,
    overlay: { drawingDraft: shownDraft, layerSelected: active ? selId : null },
    remove,
    toggleHidden: (d) => patchSel(d, { hidden: !d.hidden }),
    reorder: (d, dir) => patchSel(d, { z: zFor(layers.drawings, dir) }),
    clear: (scope) => {
      if (!mapId) return
      const ids = layers.drawings.filter((d) => scope === 'all' || mine(d)).map((d) => d.id)
      layers.put('drawings', { remove: ids })
      setSelId(null)
      void clearDrawings(roomId, mapId, scope).catch((e) => {
        onError(errText(e))
        layers.reload()
      })
    },
    mineCount: layers.drawings.filter(mine).length,
  }
}

const pickStyle = (d: MapDrawing): DrawingStyle => ({ stroke_color: d.stroke_color, stroke_width: d.stroke_width, stroke_opacity: d.stroke_opacity, fill: d.fill, fill_color: d.fill_color, fill_opacity: d.fill_opacity, font_size: d.font_size, text_color: d.text_color })

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')
