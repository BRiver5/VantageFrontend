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
import { SceneLight } from './SceneLight'
import { activateMap, doorAction, editMap, fireTrigger, interactObject, movePreview, myUnits, patchMap, pickUp, type MyUnit } from './api'
import { getAttribution, sfxFor, type AssetCredit } from './assets'
import type { BattleMap, MapObject } from './types'
import { MapUnits } from './MapUnits'
import { angleTo, areaPolygon, cellCenter, cellOf, dist, pathPoints, pxPerFt } from './geometry'
import { MapCanvas, type MapCanvasHandle } from './MapCanvas'
import { parsePing, pingColor, pingKindFor, userColor, type PingKind } from './pings'
import { PAUSE_HINT, isPausedStatus } from '../rooms/pause'
import { RulerHud } from './ruler/RulerHud'
import { useRuler } from './ruler/useRuler'
import { tokenAt as hitToken } from './render/hit'
import { TokenHud } from './hud/TokenHud'
import { useMapHud } from './hud/useMapHud'
import { onTokenFocus } from './focus'
import { maskTokenLabels, tokenHealth, turnTokenId } from './partyOverlays'
import { isAnimated, tokenLooks } from './tokenLooks'
import { useAttackFx } from './useAttackFx'
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
  const [objMenu, setObjMenu] = useState<MapObject | null>(null)
  const [moveMode, setMoveMode] = useState<'walk' | 'fly'>('walk')
  const [flyHeight, setFlyHeight] = useState(10)
  const dragging = useRef<{ id: string; from: Pt } | null>(null)
  const lastDrag = useRef(0)
  const lastAim = useRef(0)
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const meUser = data?.me.user_id
  const mine = data?.me.room_character_id ?? null
  const combat = data?.combat
  // пауза: игроку ход, двери и объекты закрыты (сервер всё равно ответит 423)
  const frozen = !isDm && isPausedStatus(data?.room.status)
  useEffect(() => {
    if (!frozen) return
    dragging.current = null
    setSelected(null)
    setReach(null)
  }, [frozen])

  // мои существа по серверу: герой и призванные; обновляем после событий карты и боя
  const [units, setUnits] = useState<MyUnit[]>([])
  const [unitsTick, setUnitsTick] = useState(0)
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([])
  const [fired, setFired] = useState<{ id: number; text: string }[]>([])
  const mapId = map?.id
  useEffect(() => {
    if (!mapId || isDm) return
    const t = setTimeout(() => {
      myUnits(roomId).then(
        (r) => setUnits(r.map_id === mapId ? r.units : []),
        () => setUnits([]),
      )
    }, 150)
    return () => clearTimeout(t)
  }, [roomId, mapId, isDm, unitsTick, combat?.revision])

  // Сервер ставит жетоны участникам боя только при «На стол». Начали бой или
  // добавили врагов после этого — мастер повторяет activate: недостающие жетоны
  // появятся, уже стоящие на карте свяжутся с участниками
  const relinked = useRef('')
  useEffect(() => {
    if (!isDm || !map || !combat || combat.status === 'ended') return
    const linked = new Set(map.tokens.map((t) => t.combatant_id).filter(Boolean))
    const missing = combat.combatants.filter((c) => !c.defeated && !linked.has(c.id)).map((c) => c.id)
    if (!missing.length) return
    const key = `${map.id}:${combat.id}:${missing.sort().join(',')}`
    if (relinked.current === key) return
    relinked.current = key
    void activateMap(roomId, map.id).catch(() => undefined)
  }, [isDm, map, combat, roomId])

  /** мои жетоны: свой герой и призванные, которыми я управляю */
  const myTokens = useMemo(() => {
    if (!map) return [] as MapToken[]
    if (units.length) return map.tokens.filter((t) => units.some((u) => u.token_id === t.id))
    const ruled = new Set((combat?.combatants ?? []).filter((c) => c.controller_id && c.controller_id === meUser).map((c) => c.id))
    return map.tokens.filter((t) => (mine && t.character_id === mine) || (t.combatant_id && ruled.has(t.combatant_id)))
  }, [map, combat, meUser, mine, units])
  const canMove = useCallback((t: MapToken) => isDm || myTokens.some((x) => x.id === t.id), [isDm, myTokens])

  // p1/hud: панель жетона (правый клик, долгое нажатие) и цели (T, Shift + клик, Shift + рамка)
  const hud = useMapHud({
    map,
    isDm,
    tokenAt: (p) => (map ? (hitToken(map, isDm, new Map(), p) ?? undefined) : undefined),
    onOpenCard: onOpen,
    onTakeOver: () => {
      clearTimeout(press.current)
      const dg = dragging.current
      dragging.current = null
      if (dg) setDrags((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== dg.id)))
    },
    // Shift + клик по пустому без протягивания: у мастера — пинг «сюда» (рамка целей — при протягивании)
    onEmptyShiftClick: (p) => {
      if (isDm) sendPing(p, 'pan')
    },
  })
  // игроку — имена существ, которые ему открыты; здоровье под жетонами; кольцо хода
  const characters = data?.characters
  const creatures = data?.creatures
  const shownMap = useMemo(() => (map ? maskTokenLabels(map, creatures ?? [], isDm) : null), [map, creatures, isDm])
  const health = useMemo(() => (map ? tokenHealth(map, { characters: characters ?? [], creatures: creatures ?? [], combat: combat ?? null }, isDm) : {}), [map, characters, creatures, combat, isDm])
  const turnToken = map ? turnTokenId(map, combat ?? null) : null
  // состояния на жетонах (невидим, горит, отравлен…) и анимация атак без map.vfx
  const looks = useMemo(() => (map ? tokenLooks(map, { characters: characters ?? [], creatures: creatures ?? [], combat: combat ?? null }) : {}), [map, characters, creatures, combat])
  const looksLive = useMemo(() => Object.values(looks).some(isAnimated), [looks])
  useAttackFx(canvas, map)

  // «Показать на карте» из панели отряда: камера на жетон, свой — выбрать
  const focusRef = useRef<(id: string) => void>(() => undefined)
  useEffect(() => onTokenFocus((id) => focusRef.current(id)), [])

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
      setUnitsTick((n) => n + 1)
      return
    }
    if (msg.type === 'map.updated' || msg.type === 'map.door') {
      setUnitsTick((n) => n + 1)
      return
    }
    const live = !msg.ts || Date.now() - Date.parse(msg.ts) < 15000
    if (msg.type === 'map.item') {
      setUnitsTick((n) => n + 1)
      if (!live) return
      const tk = map.tokens.find((t) => t.id === (p.token_id ?? p.to_token_id))
      const at = p.x != null ? { x: Number(p.x), y: Number(p.y) } : tk ? { x: tk.x, y: tk.y } : null
      if (at) canvas.current?.effect(p.action === 'dropped' ? 'impact.bludgeoning' : 'buff.arcane', at, map.grid.cell_px * 0.4)
      if (p.action === 'handed' && p.name) flash(`Передано: ${p.name}`)
      return
    }
    if (msg.type === 'map.message' && live) {
      const id = msg.seq ?? Date.now()
      setMessages((l) => [...l.slice(-2), { id, text: String(p.text ?? '') }])
      setTimeout(() => setMessages((l) => l.filter((x) => x.id !== id)), 7000)
      return
    }
    if (msg.type === 'map.trigger_fired' && live) {
      const id = msg.seq ?? Date.now()
      const n = Array.isArray(p.log) ? p.log.length : 0
      setFired((l) => [...l.slice(-3), { id, text: `⚡ ${String(p.name ?? 'Триггер')}${n ? ` · ${n} шаг.` : ''}` }])
      setTimeout(() => setFired((l) => l.filter((x) => x.id !== id)), 6000)
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
      const pg = parsePing(p)
      if (!pg) return
      canvas.current?.ping(pg.at, pingColor(pg.kind, pg.color ?? userColor(pg.userId)), pg.kind)
      if (pg.kind === 'pan') canvas.current?.panTo(pg.at, pg.zoom)
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
      // звуки этапов: первый ассет по тегам, если он есть в библиотеке
      const pr = v.presentation
      ;[pr?.cast, pr?.area ?? pr?.impact].forEach((st, i) => {
        if (!st?.sfx_tags?.length) return
        void sfxFor(st.sfx_tags).then((a) => {
          if (!a) return
          setTimeout(() => {
            const au = new Audio(a.urls.ogg || a.urls.original)
            au.volume = 0.7
            void au.play().catch(() => undefined)
          }, i ? 450 + (st.delay_ms ?? 0) : 0)
        })
      })
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
      const pv = await movePreview(roomId, map.id, t.id, moveMode)
      setReach(new Map(pv.cells.map((c) => [`${c.cell[0]},${c.cell[1]}`, c.cost])))
    } catch (e) {
      flash(errText(e))
    }
  }
  // линейка и маршрут перетаскивания: точки, высота, цена и атаки по возможности
  const fieldRef = useRef<HTMLDivElement>(null)
  const ruler = useRuler({
    map,
    roomId,
    field: fieldRef,
    moveMode,
    flyHeight,
    onError: flash,
    onMoved: () => {
      setReach(null)
      setSelected(null)
    },
  })
  focusRef.current = (id) => {
    const t = map?.tokens.find((x) => x.id === id)
    if (!t || (!isDm && t.hidden)) return
    canvas.current?.centerOn({ x: t.x, y: t.y })
    canvas.current?.ping({ x: t.x, y: t.y })
    if (canMove(t) && !aim && !targeting) void select(t)
  }

  if (!map) return null

  /** пинг: себе сразу, другим через сокет; «сюда» несёт масштаб мастера */
  const sendPing = (p: Pt, kind: PingKind = 'basic') => {
    const zoom = kind === 'pan' ? canvas.current?.zoom() : undefined
    sendEphemeral({ type: 'map.ping', map_id: map.id, x: Math.round(p.x), y: Math.round(p.y), kind, ...(zoom ? { zoom: Math.round(zoom * 1000) / 1000 } : {}) })
    canvas.current?.ping(p, pingColor(kind, userColor(meUser)), kind)
  }

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
    if (ruler.pointer(kind, p, e)) return true
    if (hud.handle(kind, p, e)) return true
    if (kind === 'down') {
      clearTimeout(press.current)
      // Alt+клик — «внимание», Shift+клик мастера — «сюда»
      const special = e.button === 0 ? pingKindFor(e, isDm) : null
      if (special) {
        sendPing(p, special)
        return true
      }
      if (e.button === 2) {
        sendPing(p)
        return true
      }
      const t = tokenAt(p)
      if (t && canMove(t) && !targeting && frozen) {
        flash(PAUSE_HINT)
        return true
      }
      if (t && canMove(t) && !targeting) {
        dragging.current = { id: t.id, from: { x: t.x, y: t.y } }
        ruler.dragBegin(t)
        return true
      }
      // долгое нажатие — пинг
      press.current = setTimeout(() => sendPing(p), 600)
      return false
    }
    if (kind === 'move') {
      clearTimeout(press.current)
      const dg = dragging.current
      if (dg) {
        setDrags((d) => ({ ...d, [dg.id]: p }))
        ruler.dragMove(p)
        const now = performance.now()
        if (now - lastDrag.current > 66) {
          lastDrag.current = now
          const t = map.tokens.find((x) => x.id === dg.id)
          sendEphemeral({ type: 'map.drag', map_id: map.id, token_id: dg.id, x: Math.round(p.x), y: Math.round(p.y), elevation_ft: ruler.dragElevation ?? t?.elevation_ft ?? 0, ...(t?.hidden ? { hidden: true } : {}) })
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
      if (!t) return ruler.dragCancel()
      if (dist(dg.from, p) < map.grid.cell_px * 0.4) {
        ruler.dragCancel()
        // это был клик: выбрать или открыть
        if (selected === t.id) {
          setSelected(null)
          setReach(null)
        } else void select(t)
        return
      }
      // по клеткам маршрута с точками; атака по возможности — сначала вопрос
      void ruler.dragDrop(t, p)
      return
    }
    // объект с действиями: «Обыскать», «Открыть»… — если не идём на эту клетку
    const [oc, orr] = cellOf(map.grid, p)
    const obj = [...map.objects].reverse().find((o) => (o.interactions?.length ?? 0) > 0 && Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.y - o.y) <= o.h / 2)
    if (obj && (obj.blocks_move || !(selected && reach?.has(`${oc},${orr}`)))) {
      setObjMenu(obj)
      return
    }
    // клик по предмету рядом со своим юнитом — поднять
    const item = map.items.find((i) => !i.carried_by && !i.container_object_id && Math.hypot(i.x - p.x, i.y - p.y) < map.grid.cell_px * 0.35)
    if (item) {
      const who = units.find((u) => u.token_id === selected && u.reach_items.includes(item.id)) ?? units.find((u) => u.reach_items.includes(item.id))
      if (who) {
        void pickUp(roomId, map.id, item.id, who.token_id).then(() => setUnitsTick((n) => n + 1), (e) => flash(errText(e)))
        return
      }
      if (units.length) {
        flash('Слишком далеко: подойдите на 5 футов')
        return
      }
    }
    if (selected && reach) {
      const t = map.tokens.find((x) => x.id === selected)
      const [c, r] = cellOf(map.grid, p)
      if (t && reach.has(`${c},${r}`)) void ruler.moveTo(t, [c, r])
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
  const hudToken = hud.hud ? map.tokens.find((t) => t.id === hud.hud!.tokenId && (isDm || !t.hidden)) : undefined

  return (
    <div ref={fieldRef} className={`mp-field${aim ? ' is-aiming' : ''}${locked ? ' is-locked' : ''}${ruler.active ? ' is-measuring' : ''}`} onPointerLeave={hud.leave}>
      <MapCanvas
        ref={canvas}
        map={shownMap ?? map}
        viewer={{ isDm, eyes: myTokens.map((t) => t.id) }}
        artOf={artOf}
        overlays={{
          reach,
          reachItems: (selected ? units.filter((u) => u.token_id === selected) : units).flatMap((u) => u.reach_items),
          path: pathLine,
          selected,
          drags,
          aim: aimOverlay,
          relations,
          chances: tokenChances,
          picked: pickedTokens,
          ghosts: Object.values(ghosts),
          ruler: ruler.overlay,
          targets: hud.targets,
          targetBox: hud.box,
          health,
          turn: turnToken,
          looks,
          looksLive,
        }}
        onPointer={onPointer}
        onToken={(t) => {
          if (hud.tookTap()) return
          if (targeting && t.combatant_id) return onTarget?.(t.combatant_id)
          if (canMove(t)) return
          onOpen?.(t)
        }}
        onDoor={(wallId) => {
          if (frozen) return flash(PAUSE_HINT)
          const w = map.walls.find((x) => x.id === wallId)
          const me = myTokens[0]
          void doorAction(roomId, map.id, wallId, w?.door?.open ? 'close' : 'open', me?.id).catch((e) => flash(errText(e)))
        }}
      />
      {hoverCost != null && sel && <span className="mp-cost">{hoverCost} фт.</span>}
      {!aim && <RulerHud active={ruler.active} started={ruler.started} total={ruler.total} offset={ruler.offset} route={ruler.route} pending={ruler.pending} onToggle={ruler.toggle} onConfirm={ruler.confirm} onDismiss={ruler.dismiss} />}
      {hud.hud && hudToken && <TokenHud key={hudToken.id} map={map} token={hudToken} anchor={hud.hud} targeted={hud.targets.includes(hudToken.id)} onClose={hud.closeHud} onOpenCard={onOpen} />}
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
      {!aim && !isDm && units.length > 0 && (
        <MapUnits
          roomId={roomId}
          map={map}
          units={units}
          selected={units.some((u) => u.token_id === selected) ? selected : null}
          onSelect={(id) => {
            const t = id ? map.tokens.find((x) => x.id === id) : null
            if (t) {
              void select(t)
              canvas.current?.ping({ x: t.x, y: t.y }, '#78c8ff')
            } else {
              setSelected(null)
              setReach(null)
            }
          }}
          onDone={() => setUnitsTick((n) => n + 1)}
          onError={flash}
          moveMode={moveMode}
          flyHeight={flyHeight}
          onMoveMode={(mode, h) => {
            setMoveMode(mode)
            setFlyHeight(h)
            const t = selected ? map.tokens.find((x) => x.id === selected) : null
            if (t) {
              setReach(null)
              void movePreview(roomId, map.id, t.id, mode).then((pv) => setReach(new Map(pv.cells.map((c) => [`${c.cell[0]},${c.cell[1]}`, c.cost]))), (e) => flash(errText(e)))
            }
          }}
        />
      )}
      {messages.length > 0 && (
        <div className="mp-messages" role="status">
          {messages.map((m) => (
            <p key={m.id}>{m.text}</p>
          ))}
        </div>
      )}
      <Credits map={map} />
      {objMenu && (
        <div className="mp-objmenu" role="dialog" aria-label={objMenu.name}>
          <b>{objMenu.name}</b>
          {(objMenu.interactions ?? []).map((ia) => (
            <button
              key={ia.id}
              type="button"
              onClick={() => {
                const who = units.find((u) => u.token_id === selected) ?? units[0]
                void interactObject(roomId, map.id, objMenu.id, ia.id, who?.token_id).then(
                  (r) => flash(r.dc != null ? (r.success ? `${ia.label}: успех (Сл ${r.dc})` : `${ia.label}: провал (Сл ${r.dc})`) : `${ia.label}: готово`),
                  (e) => flash(errText(e)),
                )
                setObjMenu(null)
              }}
            >
              {ia.label}
              {ia.economy === 'action' ? ' · действие' : ia.economy === 'bonus' ? ' · бонусное' : ''}
            </button>
          ))}
          <button type="button" className="mp-objmenu-x" onClick={() => setObjMenu(null)} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}
      {isDm && !aim && <DmMapTools map={map} roomId={roomId} onError={flash} onDone={flash} />}
      {isDm && !aim && <SceneLight map={map} roomId={roomId} onError={flash} onDone={flash} />}
      {isDm && fired.length > 0 && (
        <ul className="mp-fired" aria-label="Сработавшие триггеры">
          {fired.map((f) => (
            <li key={f.id}>{f.text}</li>
          ))}
        </ul>
      )}
      {frozen && <p className="mp-note is-soft mp-paused-hint">{PAUSE_HINT}</p>}
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

/** Мастер на столе: разбудить группу, запустить триггер, туман */
function DmMapTools({ map, roomId, onError, onDone }: { map: BattleMap; roomId: string; onError: (t: string) => void; onDone: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const groups = [...new Set(map.tokens.filter((t) => t.group && (t.dormant || t.hidden)).map((t) => t.group!))]
  const triggers = (map.triggers ?? []).filter((t) => t.enabled)
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => onDone(ok), (e) => onError(errText(e)))
  if (!groups.length && !triggers.length && map.fog.mode === 'off') return null
  return (
    <div className={`mp-dmtools${open ? ' is-open' : ''}`}>
      <button type="button" className="mp-dmtools-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Сценарий
      </button>
      {open && (
        <div className="mp-dmtools-pop">
          {groups.length > 0 && (
            <section>
              <b>Разбудить</b>
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() =>
                    run(
                      () => editMap(roomId, map.id, { revision: map.revision, tokens: { update: map.tokens.filter((t) => t.group === g).map((t) => ({ id: t.id, dormant: false, hidden: false })) } }),
                      `Группа «${g}» проснулась`,
                    )
                  }
                >
                  {g}
                </button>
              ))}
            </section>
          )}
          {triggers.length > 0 && (
            <section>
              <b>Запустить</b>
              {triggers.map((t) => (
                <button key={t.id} type="button" onClick={() => run(() => fireTrigger(roomId, map.id, t.id), `«${t.name}» запущен`)}>
                  {t.name}
                </button>
              ))}
            </section>
          )}
          {map.fog.mode !== 'off' && (
            <section>
              <b>Туман</b>
              <button type="button" onClick={() => run(() => patchMap(roomId, map.id, { fog: { ...map.fog, mode: 'off' }, revision: map.revision } as Partial<BattleMap>), 'Туман снят')}>
                снять
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

/** «Авторы»: ассеты карты под CC-BY требуют подписи */
function Credits({ map }: { map: BattleMap }) {
  const ids = useMemo(() => [...new Set([...map.layers, ...map.objects, ...map.tokens, ...map.items].map((x) => x.asset_id).filter((x): x is string => !!x))].sort(), [map.layers, map.objects, map.tokens, map.items])
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<AssetCredit[] | null>(null)
  const key = ids.join(',')
  useEffect(() => setList(null), [key])
  if (ids.length === 0) return null
  const named = (list ?? []).filter((c) => c.attribution || c.license.attribution)
  return (
    <div className={`mp-credits${open ? ' is-open' : ''}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!list) void getAttribution(ids.slice(0, 200)).then(setList, () => setList([]))
        }}
        aria-expanded={open}
        aria-label="Авторы ассетов карты"
        title="Авторы ассетов"
      >
        ©
      </button>
      {open && (
        <div className="mp-credits-pop">
          {!list && <p>Загружаем…</p>}
          {list && named.length === 0 && <p>Все ассеты карты — общественное достояние (CC0) или ваши.</p>}
          {named.length > 0 && (
            <ul>
              {[...new Set(named.map((c) => c.attribution || c.license.attribution))].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
