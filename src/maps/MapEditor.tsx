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
 *
 * Выбор: клик, Shift+клик — добавить или убрать, Shift+рамка по пустому —
 * несколько сразу. Палитра задаёт свойства новых стен (объектов, жетонов) и
 * правит выбранное одним шагом отмены; список объектов сцены — слева.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as RDragEvent } from 'react'
import { List, Paintbrush, X } from 'lucide-react'
import { addCreatures } from '../rooms/roomsApi'
import { parsePortrait } from '../characters/portrait'
import { useRoom } from '../rooms/RoomProvider'
import { creatureArt, creatureName } from '../rooms/table/parts'
import type { Asset } from './assets'
import { ASSET_MIME, AssetLibrary, ItemProps, ObjectProps, ZoneProps } from './EditorPanels'
import { cellOf, dist, snapToCorner } from './geometry'
import { MapCanvas, type MapCanvasHandle } from './MapCanvas'
import type { MapItem, MapLight, MapToken, MapWall, MapZone, Pt } from './types'
import { errText, uid } from './editor/batch'
import { assetPlacement, dragTo, duplicateNear, hitAt, nextStampNumber, paintTerrain, snapCell, toolTip } from './editor/edit'
import { EditorHeader } from './editor/EditorHeader'
import { SIZE_CELLS, wallOf } from './editor/geometry'
import { LightProps } from './editor/LightProps'
import { paletteWall, withNewDefaults, type PaletteKind } from './editor/palette'
import { PalettePanel } from './editor/PalettePanel'
import { idsInBox, kindOf, removeIds, toggleId } from './editor/placeables'
import { PlaceablesPanel } from './editor/PlaceablesPanel'
import { SidePanel } from './editor/SidePanel'
import { StampPanel } from './editor/StampPanel'
import { TerrainBrush } from './editor/TerrainBrush'
import { TokenProps } from './editor/TokenProps'
import { ToolBar } from './editor/ToolBar'
import { useMapDoc } from './editor/useMapDoc'
import { usePalette } from './editor/usePalette'
import { WallProps } from './editor/WallProps'
import type { Brush, Stamp, Tool } from './editor/types'

export function MapEditor({ mapId, onClose }: { mapId: string; onClose: () => void }) {
  const { roomId, data } = useRoom()
  const { map, setMap, undo, redo, state, setState, error, setError, change, save, patchProps } = useMapDoc(roomId, mapId)
  const [tool, setTool] = useState<Tool>('select')
  const [brush, setBrush] = useState<Brush>('up')
  // выбранное: один — свойства справа, несколько — палитра
  const [picked, setPicked] = useState<string[]>([])
  const sel = picked.length === 1 ? picked[0] : null
  const setSel = useCallback((id: string | null) => setPicked(id ? [id] : []), [])
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null)
  const [showList, setShowList] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const { palette, setPalette } = usePalette()
  const [draft, setDraft] = useState<Pt[]>([])
  const [hover, setHover] = useState<Pt | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [stamp, setStamp] = useState<Stamp | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [stampHidden, setStampHidden] = useState(false)
  const [eyes, setEyes] = useState<string | null>(null)
  const [side, setSide] = useState<'map' | 'script'>('map')
  const canvas = useRef<MapCanvasHandle>(null)
  const drag = useRef<{ id: string; kind: 'token' | 'light' | 'item' | 'object'; from: Pt; moved: boolean } | null>(null)
  /** Shift+клик по объекту: переключить в выборе на отпускании, если не тащили */
  const toggle = useRef<{ id: string; from: Pt } | null>(null)
  const stroke = useRef<{ painted: Set<string>; add: boolean } | null>(null)

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
      // стена — по палитре, дверь и окно — своими инструментами
      const segs = draft.slice(1).map((b, i) => (kind === 'wall' ? paletteWall(palette.walls, draft[i], b) : wallOf(kind, draft[i], b)))
      change((m) => ({ ...m, walls: [...m.walls, ...segs] }))
    }
    setDraft([])
  }, [draft, tool, change, palette.walls, setSel])

  const removeMany = useCallback(
    (ids: string[]) => {
      change((m) => removeIds(m, ids))
      setPicked([])
    },
    [change],
  )
  const remove = useCallback((id: string) => removeMany([id]), [removeMany])

  // горячие клавиши
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        if (!map) return
        const from = e.shiftKey ? redo.current : undo.current
        const to = e.shiftKey ? undo.current : redo.current
        const prev = from.pop()
        if (prev) {
          // стек меняем здесь, не в функции setMap: её React может вызвать дважды
          to.push(map)
          setMap(prev)
          setState('dirty')
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'd' && sel) {
        // копия выбранного рядом
        e.preventDefault()
        change((m) => duplicateNear(m, sel))
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === 'escape') return draft.length ? setDraft([]) : setSel(null)
      if (k === 'enter') return finishDraft()
      if ((k === 'delete' || k === 'backspace') && picked.length) return removeMany(picked)
      const t = ({ v: 'select', w: 'wall', d: 'door', n: 'window', l: 'light', t: 'token', o: 'asset', h: 'terrain', z: 'zone', i: 'item' } as Record<string, Tool>)[k]
      if (t) {
        setTool(t)
        setDraft([])
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [map, draft, sel, picked, finishDraft, removeMany, setSel, change, undo, redo, setMap, setState])

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
    () => ({ editor: !eyes, heights: !eyes && (tool === 'terrain' || tool === 'asset'), selected: sel, multi: picked.length > 1 ? picked : undefined, selectBox: box, draft: draft.length ? [...draft, ...(hover ? [hover] : [])] : null, closeDraft: tool === 'zone' }),
    [eyes, tool, sel, picked, box, draft, hover],
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

  /** поставить ассет: по виду — пол, фон, жетон или объект */
  const placeAsset = (a: Asset, p: Pt) => {
    const placed = assetPlacement(g, a, p)
    change((m) => withNewDefaults(placed.apply(m), placed.select, palette))
    if (placed.select) setSel(placed.select)
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
      return paintTerrain(m, key, brush, st.add)
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
        const at = snapCell(g, p, size, size)
        // один жетон — одно существо (одно место в инициативе). Уже стоит — добавляем в комнату ещё одного такого же
        if (stamp.creature_id && map.tokens.some((x) => x.creature_id === stamp.creature_id)) {
          if (!cr || !('snapshot' in cr)) return
          const base = cr as { catalog_ref?: string | null; snapshot: unknown; image_url?: string | null }
          const n = nextStampNumber(map.tokens.map((x) => x.label), stamp.label)
          void addCreatures(roomId, base.catalog_ref ? { catalog_ref: base.catalog_ref, count: 1, on_screen_only: true } : ({ snapshot: base.snapshot, image_url: base.image_url ?? null, count: 1, on_screen_only: true } as Parameters<typeof addCreatures>[1])).then(
            ([made]) => {
              if (!made) return
              const label = `${stamp.label} ${n}`
              const id = uid('t')
              change((m) => withNewDefaults({ ...m, tokens: [...m.tokens, { id, creature_id: made.id, label, x: at.x, y: at.y, elevation_ft: 0, size, rotation: 0, vision_mode: 'normal', senses: {}, flying: false, hidden: stampHidden, side: 'enemies' }] }, id, palette))
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
        change((m) => withNewDefaults({ ...m, tokens: [...m.tokens, t] }, t.id, palette))
      }
      return
    }
    // рамка выбора: Shift и тянуть по пустому
    if (box) {
      if (kind === 'move') setBox({ a: box.a, b: p })
      if (kind === 'up') {
        const ids = idsInBox(map, box.a, p)
        setPicked((cur) => [...new Set([...cur, ...ids])])
        setBox(null)
      }
      return
    }
    if (kind === 'up' && toggle.current) {
      const tg = toggle.current
      toggle.current = null
      if (dist(tg.from, p) < 3) setPicked((cur) => toggleId(cur, tg.id))
    }
    // выбор и перетаскивание
    if (kind === 'down') {
      if (e.button !== 0) return false
      const id = hitAt(map, p)
      if (e.shiftKey && !id) {
        setBox({ a: p, b: p })
        return true
      }
      toggle.current = e.shiftKey && id ? { id, from: p } : null
      if (!e.shiftKey) setSel(id)
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
      setMap((m) => {
        if (!m) return m
        return dragTo(m, g, d, p, free)
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
  const tip = toolTip(tool, asset) ?? (tool === 'select' && picked.length > 1 ? `Выбрано: ${picked.length}. Shift+клик — убрать, Delete — удалить` : null)
  // вкладка палитры: вид выбранного, иначе — стены
  const firstKind = picked.length ? kindOf(map, picked[0]) : null
  const paletteTab: PaletteKind = firstKind === 'objects' || firstKind === 'tokens' ? firstKind : 'walls'

  return (
    <div className={`me-shell${tool === 'asset' ? ' has-lib' : ''}`} role="dialog" aria-label={`Конструктор: ${map.name}`}>
      <EditorHeader name={map.name} state={state} patchProps={patchProps} save={save} onClose={onClose} />

      <ToolBar tool={tool} setTool={setTool} setDraft={setDraft} />

      <div className={`me-canvas${showList ? ' has-outliner' : ''}`} onDragOver={(e) => e.dataTransfer.types.includes(ASSET_MIME) && e.preventDefault()} onDrop={onDrop}>
        <MapCanvas ref={canvas} map={map} viewer={viewer} artOf={artOf} overlays={overlays} onPointer={onPointer} className={tool === 'select' ? '' : 'is-drawing'} />
        {(error || note) && (
          <p className="mp-note" role="alert">
            {error ?? note}
          </p>
        )}
        {tip && <p className="me-tip">{tip}</p>}
        {tool === 'terrain' && <TerrainBrush brush={brush} setBrush={setBrush} />}
        <div className="me-float" role="group" aria-label="Панели конструктора">
          <button type="button" className={showList ? 'is-on' : ''} aria-pressed={showList} title="Объекты сцены" onClick={() => setShowList((v) => !v)}>
            <List aria-hidden="true" /> Список
          </button>
          <button type="button" className={showPalette ? 'is-on' : ''} aria-pressed={showPalette} title="Палитра: свойства новых и массовая правка" onClick={() => setShowPalette((v) => !v)}>
            <Paintbrush aria-hidden="true" /> Палитра
          </button>
        </div>
        {showList && (
          <PlaceablesPanel
            map={map}
            picked={picked}
            setPicked={setPicked}
            change={change}
            onCenter={(p) => canvas.current?.panTo(p)}
            onOpen={(id) => {
              setPicked([id])
              setTool('select')
              setShowPalette(false)
            }}
            onClose={() => setShowList(false)}
          />
        )}
      </div>

      {tool === 'asset' && <AssetLibrary picked={asset} onPick={setAsset} />}

      <aside className="me-props" aria-label="Свойства">
        {selWall && <WallProps wall={selWall} setWall={setWall} remove={remove} />}
        {selLight && <LightProps light={selLight} setLight={setLight} remove={remove} tokens={map.tokens} />}
        {selToken && <TokenProps token={selToken} setToken={setToken} remove={remove} />}
        {selObj && <ObjectProps key={selObj.id} obj={selObj} map={map} onChange={(patch) => change((m) => ({ ...m, objects: m.objects.map((o) => (o.id === selObj.id ? { ...o, ...patch } : o)) }))} onRemove={() => remove(selObj.id)} />}
        {selItem && <ItemProps item={selItem} map={map} onChange={(patch) => change((m) => ({ ...m, items: m.items.map((i) => (i.id === selItem.id ? { ...i, ...patch } : i)) }))} onRemove={() => remove(selItem.id)} />}
        {selZone && <ZoneProps key={selZone.id} zone={selZone} map={map} onChange={(patch) => change((m) => ({ ...m, zones: m.zones.map((z) => (z.id === selZone.id ? { ...z, ...patch } : z)) }))} onRemove={() => remove(selZone.id)} />}

        {(showPalette || tool === 'wall' || picked.length > 1) && <PalettePanel key={paletteTab} map={map} picked={picked} palette={palette} setPalette={setPalette} change={change} flash={flash} initial={paletteTab} />}

        {tool === 'token' && <StampPanel data={data} stamp={stamp} setStamp={setStamp} stampHidden={stampHidden} setStampHidden={setStampHidden} flash={flash} />}

        {!picked.length && tool !== 'token' && <SidePanel map={map} roomId={roomId} mapId={mapId} side={side} setSide={setSide} eyes={eyes} setEyes={setEyes} creatureRefs={creatureRefs} change={change} save={save} patchProps={patchProps} flash={flash} setError={setError} />}
      </aside>
    </div>
  )
}

