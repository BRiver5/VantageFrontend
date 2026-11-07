/**
 * Карта на столе и в бою. Свой жетон: выбрал — подсветились досягаемые
 * клетки (сервер считает стоимость), клик по клетке или перетаскивание —
 * ход, другие видят перетаскивание (map.drag). Двери — кликом. Пинг —
 * правой кнопкой или долгим нажатием. При наведении заклинания фигура едет
 * за мышью или джойстиком на телефоне; кто внутри и с каким шансом — от
 * сервера (cast/preview).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { parsePortrait } from '../characters/portrait'
import { useRoom, useRoomEvents } from '../rooms/RoomProvider'
import { creatureArt } from '../rooms/table/parts'
import { doorAction, movePreview, moveToken } from './api'
import { angleTo, areaPolygon, cellCenter, cellOf, dist, pxPerFt } from './geometry'
import { MapCanvas, pathPoints, type MapCanvasHandle } from './MapCanvas'
import type { AimInfo, AimRequest, MapToken, MapVfx, Pt, SpellTargeting } from './types'

/** Что сейчас наводится */
export interface AimSpec {
  targeting: SpellTargeting
  /** жетон заклинателя */
  casterCombatantId: string
  color: string
  spell: string
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

export function MapField({
  targeting,
  picked,
  chances,
  onTarget,
  onOpen,
  aim,
  aimInfo,
  onAim,
}: {
  /** выбор целей кликом по жетонам (бой) */
  targeting?: boolean
  picked?: string[]
  /** combatant_id → шанс */
  chances?: Record<string, number>
  onTarget?: (combatantId: string) => void
  /** клик по жетону вне наведения: открыть карточку */
  onOpen?: (t: MapToken) => void
  aim?: AimSpec | null
  aimInfo?: AimInfo | null
  onAim?: (req: AimRequest | null) => void
}) {
  const { data, roomId, isDm, sendEphemeral } = useRoom()
  const map = data?.activeMap ?? null
  const canvas = useRef<MapCanvasHandle>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [reach, setReach] = useState<Map<string, number> | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const [drags, setDrags] = useState<Record<string, Pt>>({})
  const [ghosts, setGhosts] = useState<Record<string, { polygon: Pt[]; color: string; at: number }>>({})
  const [aimPt, setAimPt] = useState<Pt | null>(null)
  const [locked, setLocked] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const dragging = useRef<{ id: string; from: Pt } | null>(null)
  const lastDrag = useRef(0)
  const lastAim = useRef(0)
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const meUser = data?.me.user_id
  const mine = data?.me.room_character_id ?? null
  const combat = data?.combat

  /** мои жетоны: свой герой и призванные, которыми я управляю */
  const myTokens = useMemo(() => {
    if (!map) return [] as MapToken[]
    const ruled = new Set((combat?.combatants ?? []).filter((c) => c.controller_id && c.controller_id === meUser).map((c) => c.id))
    return map.tokens.filter((t) => (mine && t.character_id === mine) || (t.combatant_id && ruled.has(t.combatant_id)))
  }, [map, combat, meUser, mine])
  const canMove = useCallback((t: MapToken) => isDm || myTokens.some((x) => x.id === t.id), [isDm, myTokens])

  const flash = (text: string) => {
    setNote(text)
    setTimeout(() => setNote((n) => (n === text ? null : n)), 2600)
  }

  // картинка жетона: своя, героя (кадр портрета), существа
  const artOf = useCallback(
    (t: MapToken): string | null => {
      if (t.image_url) return t.image_url
      if (t.character_id) {
        const card = data?.characters.find((c) => c.id === t.character_id)
        return card?.avatar_url ? parsePortrait(card.avatar_url).src : null
      }
      if (t.creature_id) {
        const cr = data?.creatures.find((c) => c.id === t.creature_id)
        return cr ? creatureArt(cr) : null
      }
      return null
    },
    [data?.characters, data?.creatures],
  )

  // события карты: шаги, чужое перетаскивание, пинги, эффекты, чужое наведение
  useRoomEvents((msg) => {
    if (!map) return
    const p = msg.payload as Record<string, unknown>
    if (msg.type === 'map.token_moved') {
      const path = (p.path as [number, number][] | undefined) ?? []
      if (path.length > 1) canvas.current?.walk(String(p.token_id), pathPoints(map.grid, path))
      setDrags((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== p.token_id)))
      return
    }
    const fromOther = (p.user_id as string | undefined) !== meUser
    if (msg.type === 'map.drag' && fromOther && p.map_id === map.id) {
      const id = String(p.token_id)
      setDrags((d) => ({ ...d, [id]: { x: Number(p.x), y: Number(p.y) } }))
      setTimeout(() => setDrags((d) => (d[id]?.x === Number(p.x) ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)) : d)), 1500)
      return
    }
    if (msg.type === 'map.ping' && fromOther && p.map_id === map.id) {
      canvas.current?.ping({ x: Number(p.x), y: Number(p.y) }, (p.color as string) || '#f5d06a')
      return
    }
    if (msg.type === 'map.aim' && fromOther && p.map_id === map.id) {
      const caster = map.tokens.find((t) => t.id === p.token_id)
      const origin = (p.origin as [number, number] | undefined) ?? (caster ? [caster.x, caster.y] : [0, 0])
      const ppf = pxPerFt(map.grid)
      const poly = areaPolygon(String(p.shape ?? 'sphere'), { x: origin[0], y: origin[1] }, Number(p.size_ft ?? 5) * ppf, Number(p.angle_deg ?? 0), Number(p.width_ft ?? 5) * ppf)
      const uid = String(p.user_id)
      setGhosts((g) => ({ ...g, [uid]: { polygon: poly, color: '#b48cff', at: Date.now() } }))
      setTimeout(() => setGhosts((g) => (g[uid] && Date.now() - g[uid].at > 1400 ? Object.fromEntries(Object.entries(g).filter(([k]) => k !== uid)) : g)), 1600)
      return
    }
    if (msg.type === 'map.vfx') {
      const v = p as unknown as MapVfx
      canvas.current?.vfx(v, (cid) => {
        const t = map.tokens.find((x) => x.combatant_id === cid)
        return t ? { x: t.x, y: t.y } : null
      })
    }
  })

  const caster = aim && map ? map.tokens.find((t) => t.combatant_id === aim.casterCombatantId) ?? null : null

  /** из положения мыши — запрос наведения и своя фигура до ответа сервера */
  const aimFrom = useCallback(
    (p: Pt): { req: AimRequest; polygon: Pt[]; origin: Pt } | null => {
      if (!aim || !map || !caster) return null
      const g = map.grid
      const ppf = pxPerFt(g)
      const tg = aim.targeting
      const from = { x: caster.x, y: caster.y }
      const angle = Math.round(angleTo(from, p) / (tg.joystick?.step_deg || 1)) * (tg.joystick?.step_deg || 1)
      const size = (tg.size_ft ?? 5) * ppf
      const width = (tg.width_ft ?? 5) * ppf
      if (tg.mode === 'area_from_self') {
        const r0 = (caster.size * g.cell_px) / 2
        const edge = tg.shape === 'emanation' || tg.shape === 'sphere' ? from : { x: from.x + Math.cos((angle * Math.PI) / 180) * r0, y: from.y + Math.sin((angle * Math.PI) / 180) * r0 }
        return { req: { angle_deg: angle }, polygon: areaPolygon(tg.shape ?? 'cone', edge, size, angle, width, r0), origin: edge }
      }
      if (tg.mode === 'area_at_point' || tg.mode === 'point') {
        const range = (tg.range_ft ?? 60) * ppf
        const d = Math.min(dist(from, p), range)
        const a = (angleTo(from, p) * Math.PI) / 180
        const at = { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d }
        return { req: { x: Math.round(at.x), y: Math.round(at.y) }, polygon: areaPolygon(tg.shape ?? 'sphere', at, size, angle, width), origin: at }
      }
      // луч до первой цели (атака заклинанием, лук)
      const range = (tg.range_ft ?? 60) * ppf
      return { req: { angle_deg: angle }, polygon: areaPolygon('line', from, range, angle, g.cell_px * 0.3), origin: from }
    },
    [aim, map, caster],
  )

  const pushAim = useCallback(
    (p: Pt) => {
      const a = aimFrom(p)
      if (!a || !map || !caster || !aim) return
      setAimPt(p)
      const now = performance.now()
      if (now - lastAim.current > 70) {
        lastAim.current = now
        onAim?.(a.req)
        sendEphemeral({ type: 'map.aim', map_id: map.id, token_id: caster.id, spell_name: aim.spell, shape: aim.targeting.shape ?? 'line', origin: [a.origin.x, a.origin.y], angle_deg: a.req.angle_deg ?? angleTo(caster, a.origin), size_ft: aim.targeting.size_ft ?? 5, width_ft: aim.targeting.width_ft ?? 5 })
      }
    },
    [aimFrom, map, caster, aim, onAim, sendEphemeral],
  )
  useEffect(() => {
    if (!aim) {
      setAimPt(null)
      setLocked(false)
    }
  }, [aim])

  const select = async (t: MapToken) => {
    if (!map) return
    setSelected(t.id)
    setReach(null)
    try {
      const pv = await movePreview(roomId, map.id, t.id)
      setReach(new Map(pv.cells.map((c) => [`${c.cell[0]},${c.cell[1]}`, c.cost])))
    } catch (e) {
      flash(errText(e))
    }
  }
  const go = async (t: MapToken, to: Pt) => {
    if (!map) return
    try {
      await moveToken(roomId, map.id, t.id, { to })
      setReach(null)
      setSelected(null)
    } catch (e) {
      flash(errText(e))
    }
  }

  if (!map) return null

  const tokenAt = (p: Pt) => map.tokens.filter((t) => (isDm || !t.hidden) && Math.hypot(t.x - p.x, t.y - p.y) <= (t.size * map.grid.cell_px) / 2).sort((a, b) => a.size - b.size)[0]
  const onPointer = (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent): boolean | void => {
    if (aim) {
      if (kind === 'down') return true
      if (kind === 'move' && !locked) pushAim(p)
      if (kind === 'up') {
        pushAim(p)
        setLocked((v) => !v)
      }
      return true
    }
    if (kind === 'down') {
      clearTimeout(press.current)
      if (e.button === 2) {
        sendEphemeral({ type: 'map.ping', map_id: map.id, x: Math.round(p.x), y: Math.round(p.y) })
        canvas.current?.ping(p)
        return true
      }
      const t = tokenAt(p)
      if (t && canMove(t) && !targeting) {
        dragging.current = { id: t.id, from: { x: t.x, y: t.y } }
        return true
      }
      // долгое нажатие — пинг
      press.current = setTimeout(() => {
        sendEphemeral({ type: 'map.ping', map_id: map.id, x: Math.round(p.x), y: Math.round(p.y) })
        canvas.current?.ping(p)
      }, 650)
      return false
    }
    if (kind === 'move') {
      clearTimeout(press.current)
      const dg = dragging.current
      if (dg) {
        setDrags((d) => ({ ...d, [dg.id]: p }))
        const now = performance.now()
        if (now - lastDrag.current > 66) {
          lastDrag.current = now
          const t = map.tokens.find((x) => x.id === dg.id)
          sendEphemeral({ type: 'map.drag', map_id: map.id, token_id: dg.id, x: Math.round(p.x), y: Math.round(p.y), elevation_ft: t?.elevation_ft ?? 0, ...(t?.hidden ? { hidden: true } : {}) })
        }
        return
      }
      if (selected && reach) setHover(p)
      return
    }
    // up
    clearTimeout(press.current)
    const dg = dragging.current
    dragging.current = null
    if (dg) {
      const t = map.tokens.find((x) => x.id === dg.id)
      setDrags((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== dg.id)))
      if (!t) return
      if (dist(dg.from, p) < map.grid.cell_px * 0.4) {
        // это был клик: выбрать или открыть
        if (selected === t.id) {
          setSelected(null)
          setReach(null)
        } else void select(t)
        return
      }
      const [c, r] = cellOf(map.grid, p)
      void go(t, cellCenter(map.grid, c, r))
      return
    }
    if (selected && reach) {
      const t = map.tokens.find((x) => x.id === selected)
      const [c, r] = cellOf(map.grid, p)
      if (t && reach.has(`${c},${r}`)) void go(t, cellCenter(map.grid, c, r))
      else {
        setSelected(null)
        setReach(null)
      }
    }
  }

  const sel = selected ? map.tokens.find((t) => t.id === selected) : null
  const hoverCell = hover && reach ? cellOf(map.grid, hover) : null
  const pathLine = sel && hoverCell && reach?.has(`${hoverCell[0]},${hoverCell[1]}`) ? [{ x: sel.x, y: sel.y }, cellCenter(map.grid, hoverCell[0], hoverCell[1])] : null
  const hoverCost = hoverCell ? reach?.get(`${hoverCell[0]},${hoverCell[1]}`) : undefined

  // наведение: фигура от сервера, а до ответа — своя
  const local = aimPt ? aimFrom(aimPt) : null
  const serverPoly = aimInfo?.polygon?.map(([x, y]) => ({ x, y }))
  const aimOverlay = aim && (serverPoly?.length || local)
    ? { polygon: serverPoly?.length ? serverPoly : local!.polygon, color: aim.color, origin: aimInfo?.origin ? { x: aimInfo.origin[0], y: aimInfo.origin[1] } : local?.origin, ok: aimInfo ? aimInfo.in_range : true }
    : null
  const relations = Object.fromEntries((aimInfo?.tokens ?? []).map((t) => [t.token_id, t.relation]))
  const byCombatant = (cid: string) => map.tokens.find((t) => t.combatant_id === cid)?.id
  const tokenChances = Object.fromEntries(Object.entries(chances ?? {}).map(([cid, ch]) => [byCombatant(cid), ch]).filter(([k]) => !!k))
  const pickedTokens = (picked ?? []).map(byCombatant).filter((x): x is string => !!x)

  return (
    <div className={`mp-field${aim ? ' is-aiming' : ''}${locked ? ' is-locked' : ''}`}>
      <MapCanvas
        ref={canvas}
        map={map}
        viewer={{ isDm, eyes: myTokens.map((t) => t.id) }}
        artOf={artOf}
        overlays={{
          reach,
          path: pathLine,
          selected,
          drags,
          aim: aimOverlay,
          relations,
          chances: tokenChances,
          picked: pickedTokens,
          ghosts: Object.values(ghosts),
        }}
        onPointer={onPointer}
        onToken={(t) => {
          if (targeting && t.combatant_id) return onTarget?.(t.combatant_id)
          if (canMove(t)) return
          onOpen?.(t)
        }}
        onDoor={(wallId) => {
          const w = map.walls.find((x) => x.id === wallId)
          const me = myTokens[0]
          void doorAction(roomId, map.id, wallId, w?.door?.open ? 'close' : 'open', me?.id).catch((e) => flash(errText(e)))
        }}
      />
      {hoverCost != null && sel && <span className="mp-cost">{hoverCost} фт.</span>}
      {aim && (
        <div className="mp-aimbar">
          <b>{aim.spell}</b>
          <i>{locked ? 'фигура закреплена — нажмите на карту, чтобы двигать' : 'ведите по карте, нажатие закрепит'}</i>
          {(aimInfo?.warnings ?? []).map((w) => (
            <em key={w}>{w}</em>
          ))}
        </div>
      )}
      {aim && caster && <Joystick onAim={(angle, mag) => {
        const range = (aim.targeting.range_ft ?? 60) * pxPerFt(map.grid)
        const reachPx = aim.targeting.mode === 'area_at_point' || aim.targeting.mode === 'point' ? mag * range : range
        const a = (angle * Math.PI) / 180
        setLocked(true)
        pushAim({ x: caster.x + Math.cos(a) * Math.max(1, reachPx), y: caster.y + Math.sin(a) * Math.max(1, reachPx) })
      }} />}
      {note && (
        <p className="mp-note" role="alert">
          {note}
        </p>
      )}
      {!isDm && map.fog?.mode !== 'off' && !map.fog?.honest && myTokens.length === 0 && <p className="mp-note is-soft">Вашего героя нет на карте</p>}
    </div>
  )
}

/** Виртуальный джойстик: угол и отклонение 0..1 */
function Joystick({ onAim }: { onAim: (angle: number, magnitude: number) => void }) {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<Pt>({ x: 0, y: 0 })
  const active = useRef(false)
  const move = (e: RPointerEvent) => {
    const el = base.current
    if (!el || !active.current) return
    const r = el.getBoundingClientRect()
    const R = r.width / 2
    const dx = e.clientX - (r.left + R)
    const dy = e.clientY - (r.top + R)
    const m = Math.min(1, Math.hypot(dx, dy) / R)
    const a = Math.atan2(dy, dx)
    setKnob({ x: Math.cos(a) * m * R, y: Math.sin(a) * m * R })
    const deg = ((a * 180) / Math.PI + 360) % 360
    if (m > 0.12 && navigator.vibrate && Math.abs(m - 1) < 0.02) navigator.vibrate(5)
    onAim(deg, m)
  }
  return (
    <div
      ref={base}
      className="mp-joy"
      onPointerDown={(e) => {
        active.current = true
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={move}
      onPointerUp={() => {
        active.current = false
        setKnob({ x: 0, y: 0 })
      }}
      aria-label="Джойстик наведения"
      role="slider"
      aria-valuetext="направление"
    >
      <span className="mp-joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}
