/**
 * Конструктор боевой карты (мастер, компьютер). Правки копятся локально со
 * стеком отмены; раз в пару секунд разница с сохранённым уходит одним
 * пакетом /edit с revision. При 409 карта перечитывается, и несохранённые
 * правки накладываются поверх свежей версии.
 *
 * Инструменты: выбор (V), стена (W), дверь (D), окно (N), свет (L),
 * жетон (T). Стена — ломаная по углам клеток (Shift — свободно), двойной
 * клик или Enter заканчивает, Esc отменяет черновик.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DoorOpen, Eye, Hand, ImagePlus, Lightbulb, PenLine, Redo2, RectangleHorizontal, Save, Trash2, Undo2, UserRound, X } from 'lucide-react'
import { ApiError, uploadMedia } from '../api'
import { parsePortrait } from '../characters/portrait'
import { useRoom } from '../rooms/RoomProvider'
import { creatureArt, creatureName } from '../rooms/table/parts'
import { editMap, getMap, patchMap } from './api'
import { cellCenter, cellOf, dist, snapToCorner } from './geometry'
import { MapCanvas, type MapCanvasHandle } from './MapCanvas'
import type { BattleMap, EditBatch, EditKind, MapLight, MapToken, MapWall, Pt } from './types'

type Tool = 'select' | 'wall' | 'door' | 'window' | 'light' | 'token'
const KINDS: EditKind[] = ['walls', 'objects', 'lights', 'layers', 'tokens', 'items', 'zones']
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

export function MapEditor({ mapId, onClose }: { mapId: string; onClose: () => void }) {
  const { roomId, data } = useRoom()
  const [map, setMap] = useState<BattleMap | null>(null)
  const saved = useRef<BattleMap | null>(null)
  const undo = useRef<BattleMap[]>([])
  const redo = useRef<BattleMap[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<Pt[]>([])
  const [hover, setHover] = useState<Pt | null>(null)
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [stamp, setStamp] = useState<{ creature_id?: string; character_id?: string; label: string } | null>(null)
  const [eyes, setEyes] = useState<string | null>(null)
  const canvas = useRef<MapCanvasHandle>(null)
  const drag = useRef<{ id: string; kind: 'token' | 'light'; from: Pt; moved: boolean } | null>(null)

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

  // автосохранение пакетом
  const saving = useRef(false)
  const mapRef = useRef(map)
  mapRef.current = map
  const save = useCallback(async () => {
    const base = saved.current
    if (!base || saving.current) return
    const cur = mapRef.current
    if (!cur) return
    const batch = diffBatch(base, cur)
    if (!batch) return setState('saved')
    saving.current = true
    setState('saving')
    try {
      const next = await editMap(roomId, mapId, { ...batch, revision: base.revision })
      saved.current = next
      // пока сохраняли, могли ещё править: их оставим, revision — свежий
      setMap((m) => (m === cur ? next : m && { ...m, revision: next.revision }))
      setState((s) => (s === 'saving' ? 'saved' : s))
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const fresh = await getMap(roomId, mapId)
        saved.current = fresh
        setMap((m) => (m ? applyBatch(fresh, diffBatch(base, m) ?? {}) : fresh))
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

  const finishWall = useCallback(() => {
    if (draft.length >= 2) {
      const kind: MapWall['kind'] = tool === 'door' ? 'door' : tool === 'window' ? 'window' : 'wall'
      const segs = draft.slice(1).map((b, i) => wallOf(kind, draft[i], b))
      change((m) => ({ ...m, walls: [...m.walls, ...segs] }))
    }
    setDraft([])
  }, [draft, tool, change])

  const remove = useCallback(
    (id: string) => {
      change((m) => ({ ...m, walls: m.walls.filter((w) => w.id !== id), lights: m.lights.filter((l) => l.id !== id), tokens: m.tokens.filter((t) => t.id !== id) }))
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
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === 'escape') return draft.length ? setDraft([]) : setSel(null)
      if (k === 'enter') return finishWall()
      if ((k === 'delete' || k === 'backspace') && sel) return remove(sel)
      const t = ({ v: 'select', w: 'wall', d: 'door', n: 'window', l: 'light', t: 'token' } as Record<string, Tool>)[k]
      if (t) {
        setTool(t)
        setDraft([])
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [draft, sel, finishWall, remove])

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
  const hitAt = (p: Pt): string | null => {
    const near = g.cell_px * 0.3
    const l = map.lights.find((x) => dist(x, p) < near)
    if (l) return l.id
    const t = map.tokens.find((x) => dist(x, p) <= (x.size * g.cell_px) / 2)
    if (t) return t.id
    const w = map.walls.map((x) => ({ x, d: segDist(p, x.a, x.b) })).filter((x) => x.d < near * 0.6).sort((a, b) => a.d - b.d)[0]
    return w?.x.id ?? null
  }

  const onPointer = (kind: 'down' | 'move' | 'up', p: Pt, e: React.PointerEvent): boolean | void => {
    const free = e.shiftKey
    if (tool === 'wall' || tool === 'door' || tool === 'window') {
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
        if (dbl) return finishWall()
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
    if (tool === 'token') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0 && stamp) {
        const [c, r] = cellOf(g, p)
        const at = cellCenter(g, c, r)
        const cr = stamp.creature_id ? data?.creatures.find((x) => x.id === stamp.creature_id) : null
        const size = cr && 'snapshot' in cr ? ({ tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as Record<string, number>)[String((cr.snapshot as { size?: string })?.size ?? 'medium').toLowerCase()] ?? 1 : 1
        const t: MapToken = {
          id: uid('t'),
          ...(stamp.creature_id ? { creature_id: stamp.creature_id } : {}),
          ...(stamp.character_id ? { character_id: stamp.character_id } : {}),
          label: stamp.label,
          x: at.x + (size % 2 === 0 ? g.cell_px / 2 : 0),
          y: at.y + (size % 2 === 0 ? g.cell_px / 2 : 0),
          elevation_ft: 0,
          size,
          rotation: 0,
          vision_mode: 'normal',
          senses: {},
          flying: false,
          hidden: !!stamp.creature_id,
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
      const what = id && map.tokens.some((t) => t.id === id) ? 'token' : id && map.lights.some((l) => l.id === id) ? 'light' : null
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
      const at = d.kind === 'token' && !free ? (() => {
        const t = map.tokens.find((x) => x.id === d.id)
        const [c, r] = cellOf(g, p)
        const cc = cellCenter(g, c, r)
        return t && t.size % 2 === 0 ? { x: cc.x + g.cell_px / 2, y: cc.y + g.cell_px / 2 } : cc
      })() : { x: Math.round(p.x), y: Math.round(p.y) }
      setMap((m) =>
        m && (d.kind === 'token' ? { ...m, tokens: m.tokens.map((t) => (t.id === d.id ? { ...t, ...at } : t)) } : { ...m, lights: m.lights.map((l) => (l.id === d.id ? { ...l, ...at } : l)) }),
      )
      setState('dirty')
      return
    }
    if (kind === 'up') drag.current = null
  }

  const selWall = map.walls.find((w) => w.id === sel)
  const selLight = map.lights.find((l) => l.id === sel)
  const selToken = map.tokens.find((t) => t.id === sel)
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
    { id: 'light', label: 'Свет', key: 'L', icon: <Lightbulb aria-hidden="true" /> },
    { id: 'token', label: 'Жетон', key: 'T', icon: <UserRound aria-hidden="true" /> },
  ]

  return (
    <div className="me-shell" role="dialog" aria-label={`Конструктор: ${map.name}`}>
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

      <div className="me-canvas">
        <MapCanvas
          ref={canvas}
          map={map}
          viewer={viewer}
          artOf={artOf}
          overlays={{ editor: !eyes, selected: sel, draft: draft.length ? [...draft, ...(hover ? [hover] : [])] : null }}
          onPointer={onPointer}
          className={tool === 'select' ? '' : 'is-drawing'}
        />
        {error && (
          <p className="mp-note" role="alert">
            {error}
          </p>
        )}
        {(tool === 'wall' || tool === 'door' || tool === 'window') && (
          <p className="me-tip">{tool === 'wall' ? 'Клик — точка, двойной клик или Enter — закончить, Shift — без привязки' : 'Два клика: начало и конец'}</p>
        )}
      </div>

      <aside className="me-props" aria-label="Свойства">
        {selWall && (
          <section>
            <h3>{selWall.kind === 'door' ? 'Дверь' : selWall.kind === 'window' ? 'Окно' : 'Стена'}</h3>
            <label>
              Вид
              <select value={selWall.kind} onChange={(e) => {
                const k = e.target.value as MapWall['kind']
                const w = wallOf(k, selWall.a, selWall.b)
                setWall({ kind: k, blocks: w.blocks, door: k === 'door' || k === 'secret' ? (selWall.door ?? { open: false, locked: false }) : null })
              }}>
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
            <label className="me-check">
              <input type="checkbox" checked={selToken.hidden} onChange={(e) => setToken({ hidden: e.target.checked })} /> скрыт от игроков
            </label>
            <button type="button" className="me-del" onClick={() => remove(selToken.id)}>
              <Trash2 aria-hidden="true" /> Убрать с карты
            </button>
          </section>
        )}

        {tool === 'token' && (
          <section>
            <h3>Что ставить</h3>
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
            <p className="tb-hint">{stamp ? 'Кликните по клетке. Существа ставятся скрытыми.' : 'Выберите героя или существо комнаты.'}</p>
          </section>
        )}

        {!sel && tool !== 'token' && (
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
                <label className="me-check">
                  <input type="checkbox" checked={map.fog.shared_party_vision} onChange={(e) => void patchProps({ fog: { ...map.fog, shared_party_vision: e.target.checked } })} /> общий обзор отряда
                </label>
              )}
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
      </aside>
    </div>
  )
}

function GridFields({ grid, onChange }: { grid: BattleMap['grid']; onChange: (g: BattleMap['grid']) => void }) {
  const [g, setG] = useState(grid)
  useEffect(() => setG(grid), [grid])
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
