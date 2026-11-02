/**
 * Дашборд мастера: 12 колонок, виджеты двигаются и меняют размер указателем.
 * Своя сетка без библиотек: позиция считается из пикселей в клетки, пересечения
 * и выход за край проверяются на клиенте (сервер на такое отвечает 422).
 * Раскладка сохраняется через PUT /screen/dashboard с задержкой.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Dices, GripHorizontal, LayoutGrid, Lock, Pencil, Plus, ScrollText, Swords, Trash2, Users, Volume2, Package, Map as MapIcon, NotebookPen, Skull } from 'lucide-react'
import { ApiError } from '../api'
import type { DashboardWidget, WidgetType } from '../types/rooms'
import { HeroCardLine } from './Lobby'
import { RoomLog } from './RoomLog'
import { useRoomRoll } from './RoomDice'
import { useRoom } from './RoomProvider'
import { getDashboard, saveDashboard } from './roomsApi'
import { CreatureCard, LootCard } from './table/Cards'
import { LeafMaps, LeafNotes } from './table/DmScreen'
import { creatureArt, creatureHp, creatureName, Hex, itemName, itemArt, originFromEvent, type Origin } from './table/parts'

const COLS = 12
const ROW_H = 72
const GAP = 8
const SAVE_DELAY = 900

interface WidgetMeta {
  title: string
  icon: typeof Users
  w: number
  h: number
  minW: number
  minH: number
}

const META: Record<WidgetType, WidgetMeta> = {
  notes: { title: 'Заметки', icon: NotebookPen, w: 4, h: 5, minW: 3, minH: 3 },
  party: { title: 'Партия', icon: Users, w: 4, h: 4, minW: 3, minH: 2 },
  initiative: { title: 'Бой', icon: Swords, w: 8, h: 6, minW: 5, minH: 4 },
  creatures: { title: 'Существа', icon: Skull, w: 4, h: 6, minW: 3, minH: 3 },
  quick_items: { title: 'Предметы', icon: Package, w: 4, h: 5, minW: 3, minH: 3 },
  quick_maps: { title: 'Карты', icon: MapIcon, w: 4, h: 4, minW: 3, minH: 2 },
  dice: { title: 'Кубики', icon: Dices, w: 3, h: 3, minW: 2, minH: 2 },
  log: { title: 'Журнал', icon: ScrollText, w: 4, h: 5, minW: 3, minH: 3 },
  soundboard: { title: 'Звуки', icon: Volume2, w: 4, h: 3, minW: 2, minH: 2 },
}
const ORDER = Object.keys(META) as WidgetType[]

const overlap = (a: DashboardWidget, b: DashboardWidget) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const inBounds = (w: DashboardWidget) => w.x >= 0 && w.y >= 0 && w.w >= 1 && w.h >= 1 && w.x + w.w <= COLS
const valid = (w: DashboardWidget, others: DashboardWidget[]) => inBounds(w) && others.every((o) => o.id === w.id || !overlap(w, o))

/** Первое свободное место нужного размера: сверху вниз, слева направо */
function findSpot(list: DashboardWidget[], w: number, h: number): { x: number; y: number } {
  for (let y = 0; y < 200; y++)
    for (let x = 0; x + w <= COLS; x++) if (list.every((o) => !overlap({ ...o }, { id: '_', type: 'log', x, y, w, h, config: {} }))) return { x, y }
  return { x: 0, y: 0 }
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

const DEFAULT_LAYOUT = (): DashboardWidget[] => [
  { id: newId(), type: 'party', x: 0, y: 0, w: 4, h: 4, config: {} },
  { id: newId(), type: 'initiative', x: 4, y: 0, w: 8, h: 6, config: {} },
  { id: newId(), type: 'notes', x: 0, y: 4, w: 4, h: 5, config: {} },
  { id: newId(), type: 'log', x: 4, y: 6, w: 4, h: 4, config: {} },
  { id: newId(), type: 'creatures', x: 8, y: 6, w: 4, h: 4, config: {} },
]

/* ---------- содержимое виджетов ---------- */

function DiceWidget() {
  const roll = useRoomRoll()
  const [busy, setBusy] = useState<number | null>(null)
  if (!roll) return <p className="rm-hint">Кубики недоступны</p>
  return (
    <div className="rm-dash-dice">
      {[4, 6, 8, 10, 12, 20, 100].map((s) => (
        <button
          key={s}
          type="button"
          className="cs-btn"
          disabled={busy === s}
          onClick={() => {
            setBusy(s)
            void roll.roll({ expression: `1d${s}`, label: `Мастер: d${s}`, visibility: 'public' }).catch(() => undefined).finally(() => setBusy(null))
          }}
        >
          d{s}
        </button>
      ))}
    </div>
  )
}

/** Жетоны существ: нажатие открывает ту же карту, что и на столе */
function CreaturesWidget() {
  const { data } = useRoom()
  const [open, setOpen] = useState<{ id: string; origin: Origin } | null>(null)
  if (!data || data.creatures.length === 0) return <p className="tb-hint">Существ пока нет.</p>
  return (
    <div className="sc-tokens">
      {data.creatures.map((c) => (
        <button key={c.id} type="button" className="sc-token" onClick={(e) => setOpen({ id: c.id, origin: originFromEvent(e) })}>
          <Hex plain={creatureArt(c)} name={creatureName(c)} ratio={creatureHp(c).ratio} tone="enemy" />
          <b>{creatureName(c)}</b>
        </button>
      ))}
      {open && <CreatureCard id={open.id} origin={open.origin} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Предметы на столе и за ширмой */
function ItemsWidget() {
  const { data } = useRoom()
  const [open, setOpen] = useState<{ id: string; origin: Origin } | null>(null)
  const items = data?.items ?? []
  const openItem = open ? items.find((i) => i.id === open.id) : null
  if (items.length === 0) return <p className="tb-hint">На столе и за ширмой пусто.</p>
  return (
    <div className="sc-behind is-column">
      {items.map((it) => (
        <button key={it.id} type="button" className="sc-mini-item" onClick={(e) => setOpen({ id: it.id, origin: originFromEvent(e) })}>
          {itemArt(it) ? <img src={itemArt(it) as string} alt="" /> : <Package aria-hidden="true" />}
          {itemName(it)}
          {it.quantity > 1 && <em>×{it.quantity}</em>}
          <small>{it.holder === 'table' ? 'на столе' : 'за ширмой'}</small>
        </button>
      ))}
      {openItem && open && <LootCard item={openItem} origin={open.origin} canClaim={false} onClaim={() => {}} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Порядок хода одной строкой */
function InitiativeWidget() {
  const { data } = useRoom()
  const combat = data?.combat
  if (!combat || combat.status === 'ended') return <p className="tb-hint">Боя нет.</p>
  return (
    <ol className="sc-init">
      {combat.combatants.map((c) => (
        <li key={c.id} className={c.id === combat.current_combatant_id ? 'is-now' : ''}>
          {c.card ? <Hex raw={c.card.avatar_url} name={c.card.name} /> : c.creature ? <Hex plain={creatureArt(c.creature)} name={creatureName(c.creature)} tone="enemy" /> : null}
          <b>{c.card?.name ?? (c.creature ? creatureName(c.creature) : 'Участник')}</b>
          <i>{c.initiative ?? '—'}</i>
        </li>
      ))}
    </ol>
  )
}

function WidgetBody({ type }: { type: WidgetType }): ReactNode {
  const { data } = useRoom()
  switch (type) {
    case 'notes':
      return <LeafNotes />
    case 'party':
      return data && data.characters.length > 0 ? (
        <ul className="rm-dash-party">
          {data.characters.map((c) => (
            <li key={c.id}>
              <HeroCardLine card={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="tb-hint">В партии пока никого.</p>
      )
    case 'initiative':
      return <InitiativeWidget />
    case 'creatures':
      return <CreaturesWidget />
    case 'quick_items':
      return <ItemsWidget />
    case 'quick_maps':
      return <LeafMaps onlyQuick />
    case 'dice':
      return <DiceWidget />
    case 'log':
      return <RoomLog bare limit={60} />
    case 'soundboard':
      return <p className="tb-hint">Звуки и музыка появятся позже: место под них уже готово.</p>
  }
}

/* ---------- сетка ---------- */

type Drag = { id: string; mode: 'move' | 'resize'; sx: number; sy: number; orig: DashboardWidget }

export function DashboardGrid() {
  const { roomId, data } = useRoom()
  const [widgets, setWidgets] = useState<DashboardWidget[] | null>(null)
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState<DashboardWidget | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState(1100)
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closed = data?.room.status === 'closed'
  const loaded = widgets !== null

  useEffect(() => {
    let live = true
    getDashboard(roomId).then(
      (w) => live && setWidgets(w.length > 0 ? w : DEFAULT_LAYOUT()),
      (e) => {
        if (!live) return
        setWidgets(DEFAULT_LAYOUT())
        setError(e instanceof Error ? e.message : 'Не удалось загрузить раскладку')
      },
    )
    return () => {
      live = false
    }
  }, [roomId])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [loaded])

  useEffect(() => () => clearTimeout(timer.current), [])

  const persist = useCallback(
    (list: DashboardWidget[]) => {
      clearTimeout(timer.current)
      setStatus('saving')
      timer.current = setTimeout(() => {
        saveDashboard(roomId, list).then(
          () => {
            setStatus('saved')
            setError(null)
          },
          (e) => {
            setStatus('error')
            setError(e instanceof ApiError && e.status === 422 ? 'Сервер не принял раскладку: виджеты пересекаются или выходят за край' : e instanceof Error ? e.message : 'Не удалось сохранить')
          },
        )
      }, SAVE_DELAY)
    },
    [roomId],
  )

  const commit = useCallback(
    (next: DashboardWidget[]) => {
      setWidgets(next)
      persist(next)
    },
    [persist],
  )

  const colW = (width + GAP) / COLS
  const rowH = ROW_H + GAP
  const list = useMemo(() => (widgets ?? []).map((w) => (draft && draft.id === w.id ? draft : w)), [widgets, draft])
  const rows = Math.max(8, ...list.map((w) => w.y + w.h)) + (edit ? 2 : 0)
  const draftOk = draft ? valid(draft, widgets ?? []) : true

  const start = (e: RPointerEvent, w: DashboardWidget, mode: Drag['mode']) => {
    if (!edit || closed || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: w.id, mode, sx: e.clientX, sy: e.clientY, orig: w }
    setDraft(w)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = Math.round((e.clientX - d.sx) / colW)
    const dy = Math.round((e.clientY - d.sy) / rowH)
    const m = META[d.orig.type]
    if (d.mode === 'move') {
      setDraft({ ...d.orig, x: Math.max(0, Math.min(COLS - d.orig.w, d.orig.x + dx)), y: Math.max(0, d.orig.y + dy) })
    } else {
      setDraft({ ...d.orig, w: Math.max(m.minW, Math.min(COLS - d.orig.x, d.orig.w + dx)), h: Math.max(m.minH, d.orig.h + dy) })
    }
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d || !draft) return setDraft(null)
    const same = draft.x === d.orig.x && draft.y === d.orig.y && draft.w === d.orig.w && draft.h === d.orig.h
    if (!same && valid(draft, widgets ?? [])) commit((widgets ?? []).map((w) => (w.id === draft.id ? draft : w)))
    setDraft(null)
  }

  const add = (type: WidgetType) => {
    const m = META[type]
    const cur = widgets ?? []
    commit([...cur, { id: newId(), type, ...findSpot(cur, m.w, m.h), w: m.w, h: m.h, config: {} }])
  }
  const remove = (id: string) => commit((widgets ?? []).filter((w) => w.id !== id))
  const used = new Set((widgets ?? []).map((w) => w.type))

  if (!widgets) return <p className="muted">Загружаем раскладку…</p>
  return (
    <div className="rm-dash">
      <div className="rm-dash-bar">
        <h3 className="rm-panel-title">
          <LayoutGrid aria-hidden="true" /> Дашборд
        </h3>
        <span className={`rm-dash-status is-${status}`} role="status">
          {status === 'saving' ? 'Сохраняем…' : status === 'saved' ? 'Сохранено' : status === 'error' ? 'Не сохранено' : ''}
        </span>
        {edit && (
          <label className="rm-dash-add">
            <Plus aria-hidden="true" />
            <select
              aria-label="Добавить виджет"
              value=""
              onChange={(e) => {
                if (e.target.value) add(e.target.value as WidgetType)
              }}
            >
              <option value="">Добавить виджет…</option>
              {ORDER.map((t) => (
                <option key={t} value={t}>
                  {META[t].title}
                  {used.has(t) ? ' (ещё один)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className={`cs-btn${edit ? ' cw-next' : ''}`} disabled={closed} onClick={() => setEdit((v) => !v)} aria-pressed={edit}>
          {edit ? <Lock aria-hidden="true" /> : <Pencil aria-hidden="true" />} {edit ? 'Готово' : 'Изменить раскладку'}
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <div ref={host} className={`rm-dash-grid${edit ? ' is-edit' : ''}`} style={{ height: rows * rowH - GAP }}>
        {edit && (
          <div
            className="rm-dash-guides"
            aria-hidden="true"
            style={{ backgroundSize: `${colW}px ${rowH}px`, backgroundPosition: `0 0` }}
          />
        )}
        {list.map((w) => {
          const m = META[w.type] ?? META.log
          const Icon = m.icon
          const dragging = draft?.id === w.id
          return (
            <section
              key={w.id}
              className={`rm-dash-widget is-${w.type}${dragging ? ` is-dragging${draftOk ? '' : ' is-bad'}` : ''}`}
              style={{ left: w.x * colW, top: w.y * rowH, width: w.w * colW - GAP, height: w.h * rowH - GAP }}
              aria-label={m.title}
            >
              <header
                className="rm-dash-head"
                onPointerDown={(e) => start(e, w, 'move')}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                style={{ cursor: edit ? 'grab' : 'default', touchAction: edit ? 'none' : undefined }}
              >
                <Icon aria-hidden="true" />
                <b>{m.title}</b>
                {edit && (
                  <>
                    <GripHorizontal className="rm-dash-grip" aria-hidden="true" />
                    <button type="button" className="cw-mini-btn cw-mini-btn--danger" aria-label={`Убрать «${m.title}»`} onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(w.id)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </>
                )}
              </header>
              <div className="rm-dash-body" inert={edit}>
                <WidgetBody type={w.type} />
              </div>
              {edit && (
                <span
                  className="rm-dash-resize"
                  role="separator"
                  aria-label={`Размер «${m.title}»`}
                  onPointerDown={(e) => start(e, w, 'resize')}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                />
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
