/**
 * Конструктор боевой карты (мастер, компьютер). Правки копятся локально со
 * стеком отмены; раз в пару секунд разница с сохранённым уходит одним
 * пакетом /edit с revision (рельеф — PATCH). При 409 карта перечитывается,
 * и несохранённые правки накладываются поверх свежей версии.
 *
 * Инструменты: выбор (V), стена (W), дверь (D), окно (N), свет (L),
 * жетон (T), ассет из библиотеки (O), рельеф (H), зона (Z), находка (I).
 * Стена и зона — ломаная по углам клеток (Shift — свободно), двойной
 * клик или Enter заканчивает, Esc отменяет черновик. Ассет можно
 * перетащить из библиотеки прямо на холст.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type DragEvent as RDragEvent } from 'react'
import { Boxes, DoorOpen, Eye, Gem, Hand, Hexagon, ImagePlus, Lightbulb, Mountain, PenLine, Redo2, RectangleHorizontal, Save, Trash2, Undo2, UserRound, X } from 'lucide-react'
import { ApiError, fetchPage, uploadMedia, type Creature } from '../api'
import { addCreatures } from '../rooms/roomsApi'
import { parsePortrait } from '../characters/portrait'
import { useRoom } from '../rooms/RoomProvider'
import { creatureArt, creatureName } from '../rooms/table/parts'
import { editMap, fireTrigger, getMap, patchMap } from './api'
import { assetImage, assetTitle, type Asset } from './assets'
import { ASSET_MIME, AssetLibrary, ItemProps, ObjectProps, SpawnsPanel, TriggersPanel, ZoneProps } from './EditorPanels'
import { cellCenter, cellOf, circle, dist, pointInPolygon, pxPerFt, snapToCorner } from './geometry'
import { MapCanvas, type MapCanvasHandle } from './MapCanvas'
import type { BattleMap, EditBatch, EditKind, MapItem, MapLight, MapObject, MapToken, MapWall, MapZone, Pt } from './types'

type Tool = 'select' | 'wall' | 'door' | 'window' | 'light' | 'token' | 'asset' | 'terrain' | 'zone' | 'item'
type Brush = 'up' | 'down' | 'difficult' | 'water' | 'climbable'
const KINDS: EditKind[] = ['walls', 'objects', 'lights', 'layers', 'tokens', 'items', 'zones', 'triggers', 'spawns']
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

/** Разница двух версий карты пакетом конструктора */
export function diffBatch(saved: BattleMap, cur: BattleMap): EditBatch | null {
  const batch: EditBatch = {}
  let any = false
  for (const k of KINDS) {
    const a = new Map(((saved[k] ?? []) as { id: string }[]).map((x) => [x.id, x]))
    const b = new Map(((cur[k] ?? []) as { id: string }[]).map((x) => [x.id, x]))
    const add = [...b.values()].filter((x) => !a.has(x.id))
    const remove = [...a.keys()].filter((id) => !b.has(id))
    const update = [...b.values()].filter((x) => a.has(x.id) && JSON.stringify(a.get(x.id)) !== JSON.stringify(x))
    if (add.length || remove.length || update.length) {
      any = true
      batch[k] = { ...(add.length ? { add } : {}), ...(update.length ? { update } : {}), ...(remove.length ? { remove } : {}) }
    }
  }
  return any ? batch : null
}

/** Наложить пакет на свежую версию (после 409) */
function applyBatch(fresh: BattleMap, batch: EditBatch): BattleMap {
  const out = { ...fresh } as unknown as Record<EditKind, { id: string }[]>
  for (const k of KINDS) {
    const b = batch[k]
    if (!b) continue
    const rm = new Set(b.remove ?? [])
    const up = new Map(((b.update ?? []) as { id: string }[]).map((x) => [x.id, x]))
    out[k] = [...(out[k] ?? []).filter((x) => !rm.has(x.id)).map((x) => up.get(x.id) ?? x), ...((b.add ?? []) as { id: string }[])]
  }
  return out as unknown as BattleMap
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const wallOf = (kind: MapWall['kind'], a: Pt, b: Pt): MapWall => ({
  id: uid('w'),
  a,
  b,
  kind,
  height_ft: 10,
  base_ft: 0,
  blocks: { move: kind !== 'window', sight: kind !== 'window', light: kind !== 'window', sound: true },
  ...(kind === 'door' ? { door: { open: false, locked: false, secret: false } } : {}),
})

const SIZE_CELLS: Record<string, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 }

/** Многоугольник зоны для попадания курсором */
export function zonePoly(z: MapZone, map: BattleMap): Pt[] {
  if (z.shape.kind === 'circle' && z.shape.center) return circle(z.shape.center, (z.shape.radius_ft ?? 10) * pxPerFt(map.grid), 24)
  return z.shape.points ?? []
}

export function MapEditor({ mapId, onClose }: { mapId: string; onClose: () => void }) {
  const { roomId, data } = useRoom()
  const [map, setMap] = useState<BattleMap | null>(null)
  const saved = useRef<BattleMap | null>(null)
  const undo = useRef<BattleMap[]>([])
  const redo = useRef<BattleMap[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [brush, setBrush] = useState<Brush>('up')
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<Pt[]>([])
  const [hover, setHover] = useState<Pt | null>(null)
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [stamp, setStamp] = useState<{ creature_id?: string; character_id?: string; label: string } | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [stampHidden, setStampHidden] = useState(false)
  const [eyes, setEyes] = useState<string | null>(null)
  const [side, setSide] = useState<'map' | 'script'>('map')
  const canvas = useRef<MapCanvasHandle>(null)
  const drag = useRef<{ id: string; kind: 'token' | 'light' | 'item' | 'object'; from: Pt; moved: boolean } | null>(null)
  const stroke = useRef<{ painted: Set<string>; add: boolean } | null>(null)

  useEffect(() => {
    getMap(roomId, mapId).then(
      (m) => {
        saved.current = m
        setMap(m)
      },
      (e) => setError(errText(e)),
    )
  }, [roomId, mapId])

  /** правка со стеком отмены */
  const change = useCallback((fn: (m: BattleMap) => BattleMap) => {
    setMap((m) => {
      if (!m) return m
      undo.current = [...undo.current.slice(-60), m]
      redo.current = []
      return fn(m)
    })
    setState('dirty')
  }, [])

  // автосохранение: пакет конструктора и рельеф
  const saving = useRef(false)
  const mapRef = useRef(map)
  useEffect(() => {
    mapRef.current = map
  }, [map])
  const save = useCallback(async () => {
    const base = saved.current
    const cur = mapRef.current
    if (!base || !cur || saving.current) return
    const batch = diffBatch(base, cur)
    const terrainChanged = JSON.stringify(base.terrain) !== JSON.stringify(cur.terrain)
    if (!batch && !terrainChanged) return setState('saved')
    saving.current = true
    setState('saving')
    try {
      let next = base
      if (batch) next = await editMap(roomId, mapId, { ...batch, revision: base.revision })
      if (terrainChanged) {
        const r = await patchMap(roomId, mapId, { terrain: cur.terrain, revision: next.revision } as Partial<BattleMap>)
        next = { ...next, terrain: cur.terrain, revision: r.revision }
      }
      saved.current = next
      // пока сохраняли, могли ещё править: их оставим, revision — свежий
      setMap((m) => (m === cur ? next : m && { ...m, revision: next.revision }))
      setState((s) => (s === 'saving' ? 'saved' : s))
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const fresh = await getMap(roomId, mapId)
        saved.current = fresh
        setMap((m) => (m ? { ...applyBatch(fresh, diffBatch(base, m) ?? {}), terrain: m.terrain } : fresh))
        setState('dirty')
      } else {
        setState('error')
        setError(errText(e))
      }
    } finally {
      saving.current = false
    }
  }, [roomId, mapId])
  useEffect(() => {
    if (state !== 'dirty') return
    const t = setTimeout(() => void save(), 1800)
    return () => clearTimeout(t)
  }, [state, map, save])

  /** свойства карты: сетка, свет, туман — PATCH */
  const patchProps = async (body: Partial<BattleMap>) => {
    if (!map) return
    try {
      const next = await patchMap(roomId, mapId, { ...body, revision: saved.current?.revision ?? map.revision })
      saved.current = { ...(saved.current ?? next), ...body, revision: next.revision } as BattleMap
      setMap((m) => (m ? { ...m, ...body, revision: next.revision } : m))
    } catch (e) {
      setError(errText(e))
    }
  }

  const flash = (t: string) => {
    setNote(t)
    setTimeout(() => setNote((n) => (n === t ? null : n)), 2600)
  }

  /** черновик ломаной: стена или зона */
  const finishDraft = useCallback(() => {
    if (tool === 'zone' && draft.length > 0) {
      const shape: MapZone['shape'] = draft.length >= 3 ? { kind: 'polygon', points: draft } : { kind: 'circle', center: draft[0], radius_ft: 10 }
      const z: MapZone = { id: uid('z'), name: 'Зона', shape, visible_to_players: true, enabled: true, frequency: 'every_time', affects: 'all', obscured: 'none', difficult_terrain: false, on_enter: [], on_start_turn: [], on_end_turn: [], on_leave: [], source: { kind: 'dm' } }
      change((m) => ({ ...m, zones: [...m.zones, z] }))
      setSel(z.id)
      setTool('select')
    } else if (draft.length >= 2) {
      const kind: MapWall['kind'] = tool === 'door' ? 'door' : tool === 'window' ? 'window' : 'wall'
      const segs = draft.slice(1).map((b, i) => wallOf(kind, draft[i], b))
      change((m) => ({ ...m, walls: [...m.walls, ...segs] }))
    }
    setDraft([])
  }, [draft, tool, change])

  const remove = useCallback(
    (id: string) => {
      change((m) => ({
        ...m,
        walls: m.walls.filter((w) => w.id !== id),
        lights: m.lights.filter((l) => l.id !== id),
        tokens: m.tokens.filter((t) => t.id !== id),
        objects: m.objects.filter((o) => o.id !== id),
        items: m.items.filter((i) => i.id !== id),
        zones: m.zones.filter((z) => z.id !== id),
        layers: m.layers.filter((l) => l.id !== id || l.kind === 'background'),
      }))
      setSel(null)
    },
    [change],
  )

  // горячие клавиши
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        const from = e.shiftKey ? redo.current : undo.current
        const to = e.shiftKey ? undo.current : redo.current
        const prev = from.pop()
        if (prev) {
          setMap((m) => {
            if (m) to.push(m)
            return prev
          })
          setState('dirty')
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'd' && sel) {
        // копия выбранного рядом
        e.preventDefault()
        change((m) => {
          const shift = m.grid.cell_px
          const o = m.objects.find((x) => x.id === sel)
          if (o) return { ...m, objects: [...m.objects, { ...o, id: uid('o'), x: o.x + shift, y: o.y + shift }] }
          const l = m.lights.find((x) => x.id === sel)
          if (l) return { ...m, lights: [...m.lights, { ...l, id: uid('l'), x: l.x + shift }] }
          const t = m.tokens.find((x) => x.id === sel && !x.character_id)
          if (t) return { ...m, tokens: [...m.tokens, { ...t, id: uid('t'), x: t.x + shift, combatant_id: null }] }
          return m
        })
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === 'escape') return draft.length ? setDraft([]) : setSel(null)
      if (k === 'enter') return finishDraft()
      if ((k === 'delete' || k === 'backspace') && sel) return remove(sel)
      const t = ({ v: 'select', w: 'wall', d: 'door', n: 'window', l: 'light', t: 'token', o: 'asset', h: 'terrain', z: 'zone', i: 'item' } as Record<string, Tool>)[k]
      if (t) {
        setTool(t)
        setDraft([])
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [draft, sel, finishDraft, remove, change])

  const artOf = useCallback(
    (t: MapToken): string | null => {
      if (t.image_url) return t.image_url
      if (t.character_id) {
        const c = data?.characters.find((x) => x.id === t.character_id)
        return c?.avatar_url ? parsePortrait(c.avatar_url).src : null
      }
      const cr = t.creature_id ? data?.creatures.find((x) => x.id === t.creature_id) : null
      return cr ? creatureArt(cr) : null
    },
    [data?.characters, data?.creatures],
  )

  const lastClick = useRef(0)
  const viewer = useMemo(() => ({ isDm: !eyes, eyes: eyes ? [eyes] : [], asPlayer: !!eyes }), [eyes])
  const overlays = useMemo(
    () => ({ editor: !eyes, heights: !eyes && (tool === 'terrain' || tool === 'asset'), selected: sel, draft: draft.length ? [...draft, ...(hover ? [hover] : [])] : null, closeDraft: tool === 'zone' }),
    [eyes, tool, sel, draft, hover],
  )
  const creatureRefs = useMemo(
    () =>
      (data?.creatures ?? [])
        .map((c) => ({ ref: ('catalog_ref' in c ? (c.catalog_ref as string | null) : null) ?? '', name: creatureName(c) }))
        .filter((c) => c.ref),
    [data?.creatures],
  )

  if (!map) {
    return (
      <div className="me-shell" role="dialog" aria-label="Конструктор карты">
        <p className="tb-hint">{error ?? 'Открываем карту…'}</p>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </div>
    )
  }
  const g = map.grid
  const snap = (p: Pt, free: boolean) => (free ? { x: Math.round(p.x), y: Math.round(p.y) } : snapToCorner(g, p))
  const snapCell = (p: Pt, w = 1, h = 1) => {
    // объект в клетках: чётный размер — к углу, нечётный — к центру
    const [c, r] = cellOf(g, p)
    const cc = cellCenter(g, c, r)
    return { x: cc.x + (w % 2 === 0 ? g.cell_px / 2 : 0), y: cc.y + (h % 2 === 0 ? g.cell_px / 2 : 0) }
  }
  const hitAt = (p: Pt): string | null => {
    const near = g.cell_px * 0.3
    const l = map.lights.find((x) => dist(x, p) < near)
    if (l) return l.id
    const t = map.tokens.find((x) => dist(x, p) <= (x.size * g.cell_px) / 2)
    if (t) return t.id
    const it = map.items.find((x) => !x.carried_by && dist(x, p) < near)
    if (it) return it.id
    const o = [...map.objects].reverse().find((x) => Math.abs(p.x - x.x) <= x.w / 2 && Math.abs(p.y - x.y) <= x.h / 2)
    if (o) return o.id
    const w = map.walls.map((x) => ({ x, d: segDist(p, x.a, x.b) })).filter((x) => x.d < near * 0.6).sort((a, b) => a.d - b.d)[0]
    if (w) return w.x.id
    const z = [...map.zones].reverse().find((x) => pointInPolygon(p, zonePoly(x, map)))
    return z?.id ?? null
  }

  /** поставить ассет: по виду — пол, фон, жетон или объект */
  const placeAsset = (a: Asset, p: Pt) => {
    const w = Math.max(0.5, a.footprint?.w_cells ?? 1)
    const h = Math.max(0.5, a.footprint?.h_cells ?? 1)
    const url = assetImage(a)
    if (a.kind === 'map_background') {
      const ratio = (a.height_px ?? 1) / (a.width_px ?? 1)
      const W = g.cols * g.cell_px
      change((m) => ({ ...m, layers: [...m.layers.filter((l) => l.kind !== 'background'), { id: uid('bg'), asset_id: a.id, image_url: url, x: g.offset_x, y: g.offset_y, w: W, h: Math.round(W * ratio), rotation: 0, z: 0, kind: 'background', opacity: 1 }] }))
      return
    }
    if (a.kind === 'terrain') {
      const [c, r] = cellOf(g, p)
      const x = g.offset_x + c * g.cell_px
      const y = g.offset_y + r * g.cell_px
      change((m) => ({ ...m, layers: [...m.layers.filter((l) => !(l.kind === 'floor' && l.x === x && l.y === y)), { id: uid('fl'), asset_id: a.id, image_url: url, x, y, w: g.cell_px, h: g.cell_px, rotation: 0, z: 1, kind: 'floor', opacity: 1 }] }))
      return
    }
    if (a.kind === 'token') {
      const at = snapCell(p, w, w)
      const t: MapToken = { id: uid('t'), asset_id: a.id, image_url: url, label: assetTitle(a), x: at.x, y: at.y, elevation_ft: 0, size: w, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: true, side: 'enemies' }
      change((m) => ({ ...m, tokens: [...m.tokens, t] }))
      setSel(t.id)
      return
    }
    const at = snapCell(p, w, h)
    const o: MapObject = {
      id: uid('o'),
      asset_id: a.id,
      image_url: url,
      name: assetTitle(a),
      x: at.x,
      y: at.y,
      w: w * g.cell_px,
      h: h * g.cell_px,
      rotation: 0,
      z: 2,
      height_ft: a.height_ft ?? 0,
      base_ft: 0,
      climbable: !!a.climbable,
      cover: a.cover ?? 'none',
      blocks_move: !!a.blocks_move,
      blocks_sight: !!a.blocks_sight,
      blocks_light: !!a.blocks_sight,
      walkable_top: !!a.walkable_top,
      container: false,
      interactions: [],
      hidden: false,
    }
    change((m) => ({ ...m, objects: [...m.objects, o] }))
    setSel(o.id)
  }

  /** кисть рельефа по клетке */
  const paint = (p: Pt) => {
    const [c, r] = cellOf(g, p)
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return
    const key = `${c},${r}`
    const st = stroke.current
    if (!st || st.painted.has(key)) return
    st.painted.add(key)
    setMap((m) => {
      if (!m) return m
      const tr = { elevation: { ...(m.terrain?.elevation ?? {}) }, difficult: [...(m.terrain?.difficult ?? [])], water: [...(m.terrain?.water ?? [])], climbable: [...(m.terrain?.climbable ?? [])] }
      if (brush === 'up' || brush === 'down') {
        const v = (tr.elevation[key] ?? 0) + (brush === 'up' ? 5 : -5)
        if (v === 0) delete tr.elevation[key]
        else tr.elevation[key] = v
      } else {
        const set = new Set(tr[brush])
        if (st.add) set.add(key)
        else set.delete(key)
        tr[brush] = [...set]
      }
      return { ...m, terrain: tr }
    })
    setState('dirty')
  }

  const onPointer = (kind: 'down' | 'move' | 'up', p: Pt, e: React.PointerEvent): boolean | void => {
    const free = e.shiftKey
    if (tool === 'wall' || tool === 'door' || tool === 'window' || tool === 'zone') {
      if (kind === 'move') {
        setHover(snap(p, free))
        return
      }
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) {
        const q = snap(p, free)
        const now = performance.now()
        const dbl = now - lastClick.current < 320
        lastClick.current = now
        if (dbl) return finishDraft()
        if (tool === 'door' || tool === 'window') {
          // дверь и окно — один отрезок
          if (draft.length === 1) {
            if (dist(draft[0], q) > 1) change((m) => ({ ...m, walls: [...m.walls, wallOf(tool, draft[0], q)] }))
            setDraft([])
          } else setDraft([q])
          return
        }
        setDraft((d) => (d.length && dist(d[d.length - 1], q) < 1 ? d : [...d, q]))
      }
      return
    }
    if (tool === 'terrain') {
      if (kind === 'down') {
        if (e.button !== 0) return false
        undo.current = [...undo.current.slice(-60), map]
        redo.current = []
        const [c, r] = cellOf(g, p)
        const key = `${c},${r}`
        stroke.current = { painted: new Set(), add: brush === 'up' || brush === 'down' ? true : !(map.terrain?.[brush] ?? []).includes(key) }
        paint(p)
        return true
      }
      if (kind === 'move' && stroke.current) paint(p)
      if (kind === 'up') stroke.current = null
      return
    }
    if (tool === 'light') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) {
        const l: MapLight = { id: uid('l'), x: Math.round(p.x), y: Math.round(p.y), elevation_ft: 5, bright_ft: 20, dim_ft: 20, color: '#ffd27a', angle: 360, rotation: 0, flicker: true, enabled: true }
        change((m) => ({ ...m, lights: [...m.lights, l] }))
        setSel(l.id)
        setTool('select')
      }
      return
    }
    if (tool === 'item') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) {
        const box = map.objects.find((o) => o.container && Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.y - o.y) <= o.h / 2)
        const it: MapItem = { id: uid('i'), name: 'Находка', x: Math.round(p.x), y: Math.round(p.y), hidden: false, ...(box ? { container_object_id: box.id } : {}) }
        change((m) => ({ ...m, items: [...m.items, it] }))
        setSel(it.id)
        setTool('select')
      }
      return
    }
    if (tool === 'asset') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) {
        if (asset) placeAsset(asset, p)
        else flash('Выберите ассет в библиотеке снизу')
      }
      return
    }
    if (tool === 'token') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0 && stamp) {
        const cr = stamp.creature_id ? data?.creatures.find((x) => x.id === stamp.creature_id) : null
        const size = cr && 'snapshot' in cr ? (SIZE_CELLS[String((cr.snapshot as { size?: string })?.size ?? 'medium').toLowerCase()] ?? 1) : 1
        const at = snapCell(p, size, size)
        // один жетон — одно существо (одно место в инициативе). Уже стоит — добавляем в комнату ещё одного такого же
        if (stamp.creature_id && map.tokens.some((x) => x.creature_id === stamp.creature_id)) {
          if (!cr || !('snapshot' in cr)) return
          const base = cr as { catalog_ref?: string | null; snapshot: unknown; image_url?: string | null }
          const n = map.tokens.filter((x) => x.label.startsWith(stamp.label)).length + 1
          void addCreatures(roomId, base.catalog_ref ? { catalog_ref: base.catalog_ref, count: 1, on_screen_only: true } : ({ snapshot: base.snapshot, image_url: base.image_url ?? null, count: 1, on_screen_only: true } as Parameters<typeof addCreatures>[1])).then(
            ([made]) => {
              if (!made) return
              const label = `${stamp.label} ${n}`
              change((m) => ({ ...m, tokens: [...m.tokens, { id: uid('t'), creature_id: made.id, label, x: at.x, y: at.y, elevation_ft: 0, size, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: stampHidden, side: 'enemies' }] }))
            },
            (err) => setError(errText(err)),
          )
          return
        }
        const t: MapToken = {
          id: uid('t'),
          ...(stamp.creature_id ? { creature_id: stamp.creature_id } : {}),
          ...(stamp.character_id ? { character_id: stamp.character_id } : {}),
          label: stamp.label,
          x: at.x,
          y: at.y,
          elevation_ft: 0,
          size,
          rotation: 0,
          vision_mode: 'normal',
          senses: {},
          flying: false,
          hidden: !!stamp.creature_id && stampHidden,
          side: stamp.character_id ? 'party' : 'enemies',
        }
        change((m) => ({ ...m, tokens: [...m.tokens, t] }))
      }
      return
    }
    // выбор и перетаскивание
    if (kind === 'down') {
      if (e.button !== 0) return false
      const id = hitAt(p)
      setSel(id)
      const what = !id
        ? null
        : map.tokens.some((t) => t.id === id)
          ? 'token'
          : map.lights.some((l) => l.id === id)
            ? 'light'
            : map.items.some((i) => i.id === id)
              ? 'item'
              : map.objects.some((o) => o.id === id)
                ? 'object'
                : null
      if (id && what) {
        drag.current = { id, kind: what, from: p, moved: false }
        return true
      }
      return false
    }
    const d = drag.current
    if (kind === 'move' && d) {
      if (!d.moved && dist(d.from, p) < 3) return
      if (!d.moved) {
        undo.current = [...undo.current.slice(-60), map]
        redo.current = []
      }
      d.moved = true
      const raw = { x: Math.round(p.x), y: Math.round(p.y) }
      setMap((m) => {
        if (!m) return m
        if (d.kind === 'token') {
          return { ...m, tokens: m.tokens.map((t) => (t.id === d.id ? { ...t, ...(free ? raw : snapCell(p, t.size, t.size)) } : t)) }
        }
        if (d.kind === 'object') {
          return { ...m, objects: m.objects.map((o) => (o.id === d.id ? { ...o, ...(free ? raw : snapCell(p, Math.round(o.w / g.cell_px), Math.round(o.h / g.cell_px))) } : o)) }
        }
        if (d.kind === 'item') return { ...m, items: m.items.map((i) => (i.id === d.id ? { ...i, ...raw } : i)) }
        return { ...m, lights: m.lights.map((l) => (l.id === d.id ? { ...l, ...raw } : l)) }
      })
      setState('dirty')
      return
    }
    if (kind === 'up') drag.current = null
  }

  const onDrop = (e: RDragEvent) => {
    const raw = e.dataTransfer.getData(ASSET_MIME)
    if (!raw || !canvas.current) return
    e.preventDefault()
    try {
      placeAsset(JSON.parse(raw) as Asset, canvas.current.toMap(e.clientX, e.clientY))
    } catch {
      /* чужое перетаскивание */
    }
  }

  const selWall = map.walls.find((w) => w.id === sel)
  const selLight = map.lights.find((l) => l.id === sel)
  const selToken = map.tokens.find((t) => t.id === sel)
  const selObj = map.objects.find((o) => o.id === sel)
  const selItem = map.items.find((i) => i.id === sel)
  const selZone = map.zones.find((z) => z.id === sel)
  const setWall = (patch: Partial<MapWall>) => change((m) => ({ ...m, walls: m.walls.map((w) => (w.id === sel ? { ...w, ...patch } : w)) }))
  const setLight = (patch: Partial<MapLight>) => change((m) => ({ ...m, lights: m.lights.map((l) => (l.id === sel ? { ...l, ...patch } : l)) }))
  const setToken = (patch: Partial<MapToken>) => change((m) => ({ ...m, tokens: m.tokens.map((t) => (t.id === sel ? { ...t, ...patch } : t)) }))
  const bg = map.layers.find((l) => l.kind === 'background')
  const heroTokens = map.tokens.filter((t) => t.character_id)

  const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
    { id: 'select', label: 'Выбор', key: 'V', icon: <Hand aria-hidden="true" /> },
    { id: 'wall', label: 'Стена', key: 'W', icon: <PenLine aria-hidden="true" /> },
    { id: 'door', label: 'Дверь', key: 'D', icon: <DoorOpen aria-hidden="true" /> },
    { id: 'window', label: 'Окно', key: 'N', icon: <RectangleHorizontal aria-hidden="true" /> },
    { id: 'asset', label: 'Ассеты', key: 'O', icon: <Boxes aria-hidden="true" /> },
    { id: 'terrain', label: 'Рельеф', key: 'H', icon: <Mountain aria-hidden="true" /> },
    { id: 'light', label: 'Свет', key: 'L', icon: <Lightbulb aria-hidden="true" /> },
    { id: 'zone', label: 'Зона', key: 'Z', icon: <Hexagon aria-hidden="true" /> },
    { id: 'token', label: 'Жетон', key: 'T', icon: <UserRound aria-hidden="true" /> },
    { id: 'item', label: 'Находка', key: 'I', icon: <Gem aria-hidden="true" /> },
  ]
  const tip =
    tool === 'wall'
      ? 'Клик — точка, двойной клик или Enter — закончить, Shift — без привязки'
      : tool === 'door' || tool === 'window'
        ? 'Два клика: начало и конец'
        : tool === 'zone'
          ? 'Клики — углы зоны, Enter — замкнуть; один клик и Enter — круг 10 фт.'
          : tool === 'terrain'
            ? 'Ведите по клеткам; числа — высота пола в футах'
            : tool === 'asset'
              ? asset
                ? `«${assetTitle(asset)}»: клик по карте — поставить. Или перетащите из библиотеки`
                : 'Выберите ассет снизу или перетащите на карту'
              : tool === 'item'
                ? 'Клик — положить находку; в контейнер — кликом по сундуку'
                : null

  return (
    <div className={`me-shell${tool === 'asset' ? ' has-lib' : ''}`} role="dialog" aria-label={`Конструктор: ${map.name}`}>
      <header className="me-head">
        <input className="me-name" defaultValue={map.name} aria-label="Название карты" onBlur={(e) => e.target.value.trim() && e.target.value !== map.name && void patchProps({ name: e.target.value.trim() })} />
        <span className={`me-state is-${state}`}>{{ saved: 'сохранено', dirty: 'есть правки', saving: 'сохраняем…', error: 'ошибка' }[state]}</span>
        <button type="button" className="tb-round" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))} aria-label="Отменить" title="Отменить (Ctrl+Z)">
          <Undo2 aria-hidden="true" />
        </button>
        <button type="button" className="tb-round" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))} aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)">
          <Redo2 aria-hidden="true" />
        </button>
        <button type="button" className="tb-round" disabled={state === 'saved' || state === 'saving'} onClick={() => void save()} aria-label="Сохранить" title="Сохранить сейчас">
          <Save aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tb-round"
          onClick={async () => {
            await save()
            onClose()
          }}
          aria-label="Закрыть конструктор"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <nav className="me-tools" aria-label="Инструменты">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tool === t.id ? 'is-on' : ''}
            aria-pressed={tool === t.id}
            onClick={() => {
              setTool(t.id)
              setDraft([])
            }}
            title={`${t.label} (${t.key})`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="me-canvas" onDragOver={(e) => e.dataTransfer.types.includes(ASSET_MIME) && e.preventDefault()} onDrop={onDrop}>
        <MapCanvas ref={canvas} map={map} viewer={viewer} artOf={artOf} overlays={overlays} onPointer={onPointer} className={tool === 'select' ? '' : 'is-drawing'} />
        {(error || note) && (
          <p className="mp-note" role="alert">
            {error ?? note}
          </p>
        )}
        {tip && <p className="me-tip">{tip}</p>}
        {tool === 'terrain' && (
          <div className="me-brush" role="radiogroup" aria-label="Кисть рельефа">
            {(
              [
                ['up', '+5 фт'],
                ['down', '−5 фт'],
                ['difficult', 'сложная'],
                ['water', 'вода'],
                ['climbable', 'можно лезть'],
              ] as [Brush, string][]
            ).map(([b, l]) => (
              <button key={b} type="button" role="radio" aria-checked={brush === b} className={brush === b ? 'is-on' : ''} onClick={() => setBrush(b)}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {tool === 'asset' && <AssetLibrary picked={asset} onPick={setAsset} />}

      <aside className="me-props" aria-label="Свойства">
        {selWall && (
          <section>
            <h3>{selWall.kind === 'door' ? 'Дверь' : selWall.kind === 'window' ? 'Окно' : 'Стена'}</h3>
            <label>
              Вид
              <select
                value={selWall.kind}
                onChange={(e) => {
                  const k = e.target.value as MapWall['kind']
                  const w = wallOf(k, selWall.a, selWall.b)
                  setWall({ kind: k, blocks: w.blocks, door: k === 'door' || k === 'secret' ? (selWall.door ?? { open: false, locked: false }) : null })
                }}
              >
                <option value="wall">стена</option>
                <option value="door">дверь</option>
                <option value="secret">тайная дверь</option>
                <option value="window">окно</option>
                <option value="invisible">невидимая</option>
                <option value="terrain">низкая (ограда)</option>
              </select>
            </label>
            <label>
              Высота, фт
              <input type="number" min={0} step={5} value={selWall.height_ft} onChange={(e) => setWall({ height_ft: Number(e.target.value) || 0 })} />
            </label>
            {(selWall.kind === 'door' || selWall.kind === 'secret') && (
              <>
                <label className="me-check">
                  <input type="checkbox" checked={!!selWall.door?.locked} onChange={(e) => setWall({ door: { ...(selWall.door ?? { open: false, locked: false }), locked: e.target.checked } })} /> заперта
                </label>
                {selWall.door?.locked && (
                  <label>
                    Сл взлома
                    <input type="number" min={5} max={30} value={selWall.door?.lock_dc ?? 15} onChange={(e) => setWall({ door: { ...(selWall.door ?? { open: false, locked: true }), lock_dc: Number(e.target.value) || 15 } })} />
                  </label>
                )}
              </>
            )}
            <button type="button" className="me-del" onClick={() => remove(selWall.id)}>
              <Trash2 aria-hidden="true" /> Удалить
            </button>
          </section>
        )}
        {selLight && (
          <section>
            <h3>Свет</h3>
            <label>
              Яркий, фт
              <input type="number" min={0} step={5} value={selLight.bright_ft} onChange={(e) => setLight({ bright_ft: Number(e.target.value) || 0 })} />
            </label>
            <label>
              Тусклый, ещё фт
              <input type="number" min={0} step={5} value={selLight.dim_ft} onChange={(e) => setLight({ dim_ft: Number(e.target.value) || 0 })} />
            </label>
            <label>
              Цвет
              <input type="color" value={selLight.color || '#ffd27a'} onChange={(e) => setLight({ color: e.target.value })} />
            </label>
            <label>
              Едет за жетоном
              <select value={selLight.attached_to ?? ''} onChange={(e) => setLight({ attached_to: e.target.value || null })}>
                <option value="">нет</option>
                {map.tokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="me-check">
              <input type="checkbox" checked={selLight.flicker} onChange={(e) => setLight({ flicker: e.target.checked })} /> мерцает
            </label>
            <label className="me-check">
              <input type="checkbox" checked={selLight.enabled} onChange={(e) => setLight({ enabled: e.target.checked })} /> горит
            </label>
            <button type="button" className="me-del" onClick={() => remove(selLight.id)}>
              <Trash2 aria-hidden="true" /> Удалить
            </button>
          </section>
        )}
        {selToken && (
          <section>
            <h3>{selToken.label || 'Жетон'}</h3>
            <label>
              Подпись
              <input value={selToken.label} onChange={(e) => setToken({ label: e.target.value })} />
            </label>
            <label>
              Размер, клеток
              <select value={selToken.size} onChange={(e) => setToken({ size: Number(e.target.value) })}>
                {[0.5, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Высота, фт
              <input type="number" step={5} value={selToken.elevation_ft} onChange={(e) => setToken({ elevation_ft: Number(e.target.value) || 0 })} />
            </label>
            <label>
              Сторона
              <select value={selToken.side ?? 'neutral'} onChange={(e) => setToken({ side: e.target.value as MapToken['side'] })}>
                <option value="party">отряд</option>
                <option value="enemies">враги</option>
                <option value="neutral">нейтралы</option>
              </select>
            </label>
            <label>
              Группа
              <input value={selToken.group ?? ''} placeholder="засада, стража…" onChange={(e) => setToken({ group: e.target.value || null })} />
            </label>
            <label className="me-check">
              <input type="checkbox" checked={selToken.hidden} onChange={(e) => setToken({ hidden: e.target.checked })} /> скрыт от игроков
            </label>
            <label className="me-check">
              <input type="checkbox" checked={!!selToken.dormant} onChange={(e) => setToken({ dormant: e.target.checked })} /> спит (проснётся по сценарию)
            </label>
            <label className="me-check">
              <input type="checkbox" checked={selToken.flying} onChange={(e) => setToken({ flying: e.target.checked })} /> летает
            </label>
            <button type="button" className="me-del" onClick={() => remove(selToken.id)}>
              <Trash2 aria-hidden="true" /> Убрать с карты
            </button>
          </section>
        )}
        {selObj && <ObjectProps key={selObj.id} obj={selObj} map={map} onChange={(patch) => change((m) => ({ ...m, objects: m.objects.map((o) => (o.id === selObj.id ? { ...o, ...patch } : o)) }))} onRemove={() => remove(selObj.id)} />}
        {selItem && <ItemProps item={selItem} map={map} onChange={(patch) => change((m) => ({ ...m, items: m.items.map((i) => (i.id === selItem.id ? { ...i, ...patch } : i)) }))} onRemove={() => remove(selItem.id)} />}
        {selZone && <ZoneProps key={selZone.id} zone={selZone} map={map} onChange={(patch) => change((m) => ({ ...m, zones: m.zones.map((z) => (z.id === selZone.id ? { ...z, ...patch } : z)) }))} onRemove={() => remove(selZone.id)} />}

        {tool === 'token' && (
          <section>
            <h3>Что ставить</h3>
            <BeastSearch
              onAdded={(c) => {
                setStamp({ creature_id: c.id, label: c.name })
                flash(`«${c.name}» добавлен в комнату — кликните по клетке`)
              }}
            />
            <div className="me-stamps">
              {(data?.characters ?? []).map((c) => (
                <button key={c.id} type="button" className={stamp?.character_id === c.id ? 'is-on' : ''} onClick={() => setStamp({ character_id: c.id, label: c.name })}>
                  {c.name}
                </button>
              ))}
              {(data?.creatures ?? []).map((c) => (
                <button key={c.id} type="button" className={`is-foe${stamp?.creature_id === c.id ? ' is-on' : ''}`} onClick={() => setStamp({ creature_id: c.id, label: creatureName(c) })}>
                  {creatureName(c)}
                </button>
              ))}
            </div>
            <label className="me-check">
              <input type="checkbox" checked={stampHidden} onChange={(e) => setStampHidden(e.target.checked)} /> ставить скрытыми (игроки не видят)
            </label>
            <p className="tb-hint">
              {stamp
                ? `«${stamp.label}»: кликните по клетке. Каждый следующий клик — ещё один такой же враг.`
                : 'Найдите врага в бестиарии выше или выберите существо комнаты. В бою враг на карте сам станет участником.'}
            </p>
          </section>
        )}

        {!sel && tool !== 'token' && (
          <>
            <nav className="me-tabs is-top">
              <button type="button" className={side === 'map' ? 'is-on' : ''} onClick={() => setSide('map')}>
                Карта
              </button>
              <button type="button" className={side === 'script' ? 'is-on' : ''} onClick={() => setSide('script')}>
                Сценарий
                {(map.triggers?.length ?? 0) + (map.spawns?.length ?? 0) > 0 && <i>{(map.triggers?.length ?? 0) + (map.spawns?.length ?? 0)}</i>}
              </button>
            </nav>
            {side === 'script' ? (
              <>
                <TriggersPanel
                  map={map}
                  onChange={(triggers) => change((m) => ({ ...m, triggers }))}
                  onFire={(id) => {
                    void save()
                      .then(() => fireTrigger(roomId, mapId, id))
                      .then(() => flash('Триггер запущен'), (e) => setError(errText(e)))
                  }}
                />
                <SpawnsPanel map={map} creatures={creatureRefs} onChange={(spawns) => change((m) => ({ ...m, spawns }))} />
              </>
            ) : (
              <>
                <section>
                  <h3>Фон</h3>
                  <label className="me-upload">
                    <ImagePlus aria-hidden="true" /> {bg ? 'Заменить картинку' : 'Загрузить картинку'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          const [{ url }, size] = await Promise.all([uploadMedia(f), imageSize(f)])
                          const layer = { id: bg?.id ?? uid('bg'), image_url: url, x: 0, y: 0, w: size.w, h: size.h, rotation: 0, z: 0, kind: 'background' as const, opacity: 1 }
                          change((m) => ({ ...m, layers: [...m.layers.filter((l) => l.id !== layer.id), layer] }))
                          await patchProps({ grid: { ...g, cols: Math.ceil(size.w / g.cell_px), rows: Math.ceil(size.h / g.cell_px) } })
                        } catch (err) {
                          setError(errText(err))
                        } finally {
                          e.target.value = ''
                        }
                      }}
                    />
                  </label>
                </section>
                <section>
                  <h3>Сетка</h3>
                  <GridFields grid={g} onChange={(grid) => void patchProps({ grid })} />
                </section>
                <section>
                  <h3>Свет и туман</h3>
                  <label>
                    Освещение
                    <select value={map.ambient.level} onChange={(e) => void patchProps({ ambient: { ...map.ambient, level: e.target.value as BattleMap['ambient']['level'] } })}>
                      <option value="bright">яркое</option>
                      <option value="dim">сумерки</option>
                      <option value="dark">темнота</option>
                    </select>
                  </label>
                  <label>
                    Туман
                    <select value={map.fog.mode} onChange={(e) => void patchProps({ fog: { ...map.fog, mode: e.target.value as BattleMap['fog']['mode'] } })}>
                      <option value="off">нет</option>
                      <option value="dynamic">по обзору героев</option>
                    </select>
                  </label>
                  {map.fog.mode !== 'off' && (
                    <>
                      <label className="me-check">
                        <input type="checkbox" checked={map.fog.shared_party_vision} onChange={(e) => void patchProps({ fog: { ...map.fog, shared_party_vision: e.target.checked } })} /> общий обзор отряда
                      </label>
                      <label className="me-check" title="Сервер не присылает игроку то, чего его герой не видит">
                        <input type="checkbox" checked={map.fog.honest} onChange={(e) => void patchProps({ fog: { ...map.fog, honest: e.target.checked } })} /> честный туман
                      </label>
                      {!map.fog.honest && <p className="tb-hint">Туман на клиенте: скрытое лишь не нарисовано.</p>}
                    </>
                  )}
                </section>
                <section>
                  <h3>Правила</h3>
                  <label>
                    Поднять предмет в бою
                    <select value={map.rules?.pickup_costs ?? 'object'} onChange={(e) => void patchProps({ rules: { high_ground_advantage: map.rules?.high_ground_advantage ?? false, pickup_costs: e.target.value } })}>
                      <option value="object">свободно</option>
                      <option value="bonus">бонусное действие</option>
                      <option value="action">действие</option>
                    </select>
                  </label>
                </section>
                {heroTokens.length > 0 && (
                  <section>
                    <h3>
                      <Eye aria-hidden="true" /> Глазами игрока
                    </h3>
                    <select value={eyes ?? ''} onChange={(e) => setEyes(e.target.value || null)} aria-label="Чьими глазами смотреть">
                      <option value="">мастер</option>
                      {heroTokens.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  )
}

function GridFields({ grid, onChange }: { grid: BattleMap['grid']; onChange: (g: BattleMap['grid']) => void }) {
  const [g, setG] = useState(grid)
  const [seen, setSeen] = useState(grid)
  if (seen !== grid) {
    setSeen(grid)
    setG(grid)
  }
  const field = (key: 'cell_px' | 'feet_per_cell' | 'cols' | 'rows' | 'offset_x' | 'offset_y', label: string, min = 0) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={g[key]}
        onChange={(e) => setG({ ...g, [key]: Number(e.target.value) || 0 })}
        onBlur={() => JSON.stringify(g) !== JSON.stringify(grid) && g.cell_px >= 10 && onChange(g)}
      />
    </label>
  )
  return (
    <div className="me-grid">
      {field('cell_px', 'Клетка, px', 10)}
      {field('feet_per_cell', 'Футов в клетке', 1)}
      {field('cols', 'Столбцов', 1)}
      {field('rows', 'Строк', 1)}
      {field('offset_x', 'Сдвиг X')}
      {field('offset_y', 'Сдвиг Y')}
    </div>
  )
}

function imageSize(f: File): Promise<{ w: number; h: number }> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      ok({ w: img.naturalWidth, h: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => fail(new Error('Картинка не читается'))
    img.src = url
  })
}

/** Бестиарий прямо в конструкторе: найти, добавить в комнату и сразу ставить */
function BeastSearch({ onAdded }: { onAdded: (c: { id: string; name: string }) => void }) {
  const { roomId } = useRoom()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Creature[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!q.trim()) {
      setFound([])
      return
    }
    let on = true
    const t = setTimeout(() => {
      fetchPage<Creature>('creatures', { q: q.trim(), limit: 12 }).then(
        (r) => on && setFound(r.items),
        () => on && setFound([]),
      )
    }, 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="me-beasts">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Бестиарий: гоблин, волк, скелет…" aria-label="Поиск существа" />
      {found.length > 0 && (
        <ul>
          {found.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy === c.id}
                onClick={async () => {
                  setBusy(c.id)
                  setErr(null)
                  try {
                    const [made] = await addCreatures(roomId, { catalog_ref: c.id, count: 1, on_screen_only: true })
                    if (made) onAdded({ id: made.id, name: made.display_name ?? c.name })
                  } catch (e) {
                    setErr(errText(e))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {c.name}
                {c.size ? <i> · {c.size}</i> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="tb-err">{err}</p>}
    </div>
  )
}
