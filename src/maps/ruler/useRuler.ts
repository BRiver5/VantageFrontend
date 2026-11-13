/**
 * Линейка и маршрут перетаскивания жетона (как в Foundry).
 *
 * Линейка — только у себя: R или кнопка; клик ставит начало и точки, F —
 * точка под курсором, Alt+F — убрать последнюю, E/Q (и Ctrl+колесо) —
 * высота следующей точки на клетку, с Shift — на фут; правый клик или Esc —
 * сбросить. Расстояние — по правилам сетки карты с высотой (math.ts).
 *
 * Тащим свой жетон — те же F, Alt+F, E/Q. Цену, можно ли и кто ударит
 * атакой по возможности, считает сервер (move/preview с waypoints). Отпустили —
 * идём ровно по клеткам маршрута ({path}); если кто-то ударит — сначала
 * спрашиваем.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { useKeybinding } from '../../input/useKeybinding'
import { cellCenter, cellOf, pathPoints } from '../geometry'
import type { RulerOverlay } from '../render/ruler'
import type { BattleMap, MapToken, Pt } from '../types'
import { moveAlong, previewRoute, type MoveMode, type Provoke, type RoutePreview } from './api'
import { addWaypoint, elevationStep, feet, floorAt, measure, removeWaypoint, type Cell, type RulerPoint } from './math'

export interface PendingMove {
  tokenId: string
  path: [number, number][]
  mode: MoveMode
  elevation_ft?: number
  provokes: Provoke[]
}

interface DragRoute {
  tokenId: string
  waypoints: RulerPoint[]
  /** высота цели; null — как обычно (пол или полёт из настроек) */
  elevation: number | null
  cursor: Cell
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

/** Печатают в поле — клавиши линейки не трогаем */
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export function useRuler({
  map,
  roomId,
  field,
  moveMode,
  flyHeight,
  onError,
  onMoved,
}: {
  map: BattleMap | null
  roomId: string
  /** обёртка карты: на ней ловим Ctrl+колесо */
  field: RefObject<HTMLElement | null>
  moveMode: 'walk' | 'fly'
  flyHeight: number
  onError: (text: string) => void
  onMoved: () => void
}) {
  const [active, setActive] = useState(false)
  const [points, setPoints] = useState<RulerPoint[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [offset, setOffset] = useState(0)
  const [drag, setDrag] = useState<DragRoute | null>(null)
  const [route, setRoute] = useState<RoutePreview | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const seq = useRef(0)
  const grid = map?.grid

  const cursorPoint = useCallback(
    (p: Pt): RulerPoint | null => {
      if (!map) return null
      const cell = cellOf(map.grid, p)
      return { cell, elevation: floorAt(map, cell) + offset }
    },
    [map, offset],
  )

  const reset = useCallback(() => {
    setPoints([])
    setOffset(0)
  }, [])

  const toggle = useCallback(() => {
    setActive((v) => !v)
    reset()
  }, [reset])

  /* ---------- маршрут перетаскивания ---------- */

  const token = drag && map ? map.tokens.find((t) => t.id === drag.tokenId) ?? null : null

  /** запрос к серверу: точки + клетка под курсором, режим и высота */
  const bodyOf = useCallback(
    (d: DragRoute) => {
      const dest = d.cursor
      const floor = map ? floorAt(map, dest) : 0
      const fly = d.elevation != null ? d.elevation > floor + 0.01 : moveMode === 'fly'
      const elevation_ft = d.elevation != null ? d.elevation : moveMode === 'fly' ? flyHeight : undefined
      return {
        waypoints: [...d.waypoints.map((w) => w.cell), dest] as [number, number][],
        mode: (fly ? 'fly' : 'walk') as MoveMode,
        ...(fly && elevation_ft != null ? { elevation_ft } : {}),
      }
    },
    [map, moveMode, flyHeight],
  )

  // предпросмотр: после паузы в ~120 мс, устаревшие ответы отбрасываем
  useEffect(() => {
    if (!drag || !map) return
    const id = ++seq.current
    const t = setTimeout(() => {
      previewRoute(roomId, map.id, drag.tokenId, bodyOf(drag)).then(
        (r) => id === seq.current && setRoute(r.route ?? null),
        () => id === seq.current && setRoute(null),
      )
    }, 120)
    return () => clearTimeout(t)
  }, [drag, map, roomId, bodyOf])

  const dragBegin = useCallback(
    (t: MapToken) => {
      if (!map) return
      setPending(null)
      setRoute(null)
      setDrag({ tokenId: t.id, waypoints: [], elevation: null, cursor: cellOf(map.grid, t) })
    },
    [map],
  )

  const dragMove = useCallback(
    (p: Pt) => {
      if (!map) return
      const cell = cellOf(map.grid, p)
      setDrag((d) => (d && (d.cursor[0] !== cell[0] || d.cursor[1] !== cell[1]) ? { ...d, cursor: cell } : d))
    },
    [map],
  )

  const dragCancel = useCallback(() => {
    seq.current++
    setDrag(null)
    setRoute(null)
  }, [])

  const send = useCallback(
    async (m: { tokenId: string; path: [number, number][]; mode: MoveMode; elevation_ft?: number }) => {
      if (!map) return
      try {
        await moveAlong(roomId, map.id, m.tokenId, { path: m.path, mode: m.mode, ...(m.elevation_ft != null ? { elevation_ft: m.elevation_ft } : {}) })
        onMoved()
      } catch (e) {
        onError(errText(e))
      }
    },
    [map, roomId, onMoved, onError],
  )

  /** Отпустили жетон: свежий предпросмотр, затем ход по его клеткам или вопрос про атаку по возможности */
  const dragDrop = useCallback(
    async (t: MapToken, p: Pt) => {
      if (!map || !drag) return
      const d = { ...drag, cursor: cellOf(map.grid, p) }
      const body = bodyOf(d)
      seq.current++
      try {
        const r = (await previewRoute(roomId, map.id, t.id, body)).route
        if (!r) return
        if (!r.valid) {
          setRoute(null)
          onError(r.reason ?? 'Туда не пройти')
          return
        }
        const m = { tokenId: t.id, path: r.path, mode: body.mode, elevation_ft: body.elevation_ft }
        if (r.provokes.length) {
          setRoute(r)
          setPending({ ...m, provokes: r.provokes })
          return
        }
        setRoute(null)
        await send(m)
      } catch (e) {
        onError(errText(e))
      } finally {
        setDrag(null)
      }
    },
    [map, drag, bodyOf, roomId, onError, send],
  )

  const confirm = useCallback(() => {
    const m = pending
    setPending(null)
    setRoute(null)
    if (m) void send(m)
  }, [pending, send])

  const dismiss = useCallback(() => {
    setPending(null)
    setRoute(null)
  }, [])

  /* ---------- клавиши ---------- */

  const keysOn = active || !!drag
  const guard = (fn: () => void) => (e: KeyboardEvent) => {
    if (typing(e)) return
    e.preventDefault()
    fn()
  }

  const lift = (dir: 1 | -1, fine: boolean) => {
    if (!grid) return
    const step = elevationStep(grid, dir, fine)
    if (drag) {
      const base = drag.elevation ?? token?.elevation_ft ?? 0
      setDrag({ ...drag, elevation: Math.max(0, base + step) })
    } else setOffset((o) => o + step)
  }
  const placeWaypoint = () => {
    if (drag && map) {
      const cell = drag.cursor
      const elevation = drag.elevation ?? floorAt(map, cell)
      setDrag({ ...drag, waypoints: addWaypoint(drag.waypoints, { cell, elevation }) })
      return
    }
    const cp = cursor && cursorPoint(cursor)
    if (cp) setPoints((l) => addWaypoint(l, cp))
  }

  useKeybinding('ruler.toggle', guard(toggle), !!map && !drag)
  useKeybinding('ruler.waypoint', guard(placeWaypoint), keysOn)
  useKeybinding('ruler.unwaypoint', guard(() => (drag ? setDrag({ ...drag, waypoints: drag.waypoints.slice(0, -1) }) : setPoints((l) => removeWaypoint(l)))), keysOn)
  useKeybinding('ruler.up', guard(() => lift(1, false)), keysOn)
  useKeybinding('ruler.down', guard(() => lift(-1, false)), keysOn)
  useKeybinding('ruler.upFine', guard(() => lift(1, true)), keysOn)
  useKeybinding('ruler.downFine', guard(() => lift(-1, true)), keysOn)
  useKeybinding('ruler.cancel', guard(() => (points.length ? reset() : setActive(false))), active && !drag)

  // Ctrl+колесо — высота; родной слушатель, чтобы не масштабировать страницу
  const liftRef = useRef(lift)
  useLayoutEffect(() => {
    liftRef.current = lift
  })
  useEffect(() => {
    const el = field.current
    if (!el || !keysOn) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      liftRef.current(e.deltaY < 0 ? 1 : -1, e.shiftKey)
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [field, keysOn])

  /* ---------- мышь в режиме линейки ---------- */

  /** true — событие забрала линейка */
  const pointer = (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent): boolean => {
    if (!active || !map) return false
    if (kind === 'move') {
      setCursor(p)
      return true
    }
    if (kind === 'down') {
      if (e.button === 2) reset()
      return true
    }
    if (e.button === 2) return true
    const cp = cursorPoint(p)
    if (!cp) return true
    if (!points.length) {
      // начало: на жетоне — от его высоты
      const t = map.tokens.find((x) => {
        const [c, r] = cellOf(map.grid, x)
        return c === cp.cell[0] && r === cp.cell[1]
      })
      setPoints([t ? { ...cp, elevation: t.elevation_ft } : cp])
      setOffset(t ? t.elevation_ft - floorAt(map, cp.cell) : 0)
    } else setPoints((l) => addWaypoint(l, cp))
    setCursor(p)
    return true
  }

  /* ---------- что рисовать ---------- */

  const overlay = useMemo((): RulerOverlay | null => {
    if (!map) return null
    const g = map.grid
    const center = (c: Cell) => cellCenter(g, c[0], c[1])
    const heightText = (pt: RulerPoint) => (pt.elevation ? ` · высота ${feet(pt.elevation)}` : '')
    if (route && (drag || pending)) {
      const pts = pathPoints(g, route.path)
      const threats = route.provokes
        .map((pv) => map.tokens.find((t) => t.id === pv.token_id))
        .filter((t): t is MapToken => !!t)
        .map((t) => ({ x: t.x, y: t.y, r: (t.size * g.cell_px) / 2 }))
      const cost = route.cost != null ? `${feet(route.cost)} из ${feet(route.budget)}` : 'не пройти'
      const end = pts[pts.length - 1]
      const wps = (drag?.waypoints ?? []).map((w) => center(w.cell))
      return {
        path: pts,
        waypoints: wps,
        labels: end ? [{ at: end, text: `${cost}${route.elevation_ft ? ` · высота ${feet(route.elevation_ft)}` : ''}`, strong: true }] : [],
        tone: route.valid ? 'ok' : 'bad',
        threats,
        hits: route.provokes.map((pv) => center(pv.at_cell)),
      }
    }
    if (drag && token) {
      // пока нет ответа сервера: прямые отрезки через точки
      const pts = [{ x: token.x, y: token.y }, ...drag.waypoints.map((w) => center(w.cell)), center(drag.cursor)]
      return { path: pts, waypoints: pts.slice(1, -1), labels: [], tone: 'ok', threats: [], hits: [] }
    }
    if (!active || !points.length) return null
    const all = cursor ? addWaypoint(points, cursorPoint(cursor)!) : points
    const { segments, total } = measure(all, g)
    const labels = segments.map((s, i) => {
      const last = i === segments.length - 1
      return { at: center(s.to.cell), text: `${feet(s.ft)}${last && segments.length > 1 ? ` · всего ${feet(total)}` : ''}${heightText(s.to)}`, strong: last }
    })
    return { path: all.map((pt) => center(pt.cell)), waypoints: points.map((pt) => center(pt.cell)), labels, tone: 'measure', threats: [], hits: [] }
  }, [map, route, drag, pending, token, active, points, cursor, cursorPoint])

  const total = useMemo(() => {
    if (!active || !points.length || !map) return null
    const all = cursor ? addWaypoint(points, cursorPoint(cursor)!) : points
    return measure(all, map.grid).total
  }, [active, points, cursor, cursorPoint, map])

  return {
    active,
    toggle,
    pointer,
    dragBegin,
    dragMove,
    dragDrop,
    dragCancel,
    dragging: !!drag,
    /** высота цели при перетаскивании (для map.drag), null — не меняли */
    dragElevation: drag?.elevation ?? null,
    overlay,
    route: drag || pending ? route : null,
    total,
    offset,
    started: points.length > 0,
    pending,
    confirm,
    dismiss,
  }
}
