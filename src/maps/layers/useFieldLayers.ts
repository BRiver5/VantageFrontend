/**
 * Слои на карте стола (MapField): метки, звуки, рисунки в одном месте,
 * чтобы сама карта знала о них только ввод, оверлеи и три компонента.
 *
 * Метки: клик открывает страницу (мастеру — в базе знаний, игроку — окно со
 * страницей «От мастера»); мастер ставит метку, перетащив страницу из базы
 * знаний на карту или кнопкой «На карту» на странице (следующий клик).
 * «Показать на карте» со страницы ведёт камеру к метке.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { patchRoom } from '../../rooms/roomsApi'
import { useRoom } from '../../rooms/RoomProvider'
import type { MapCanvasHandle } from '../render/types'
import { noteAt } from '../render/notes'
import type { BattleMap, MapToken, Pt } from '../types'
import { useDrawTool } from '../drawings/useDrawTool'
import { KB_PAGE_MIME, onPlacePageOnMap, onShowPageOnMap, openKbPage } from '../notes/bus'
import { createNote } from './api'
import type { MapNote } from './types'
import { useMapLayers } from './useMapLayers'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

export function useFieldLayers(opts: { map: BattleMap | null; canvas: RefObject<MapCanvasHandle | null>; myTokens: MapToken[]; selected: string | null; onError: (t: string) => void }) {
  const { map, canvas, myTokens, selected, onError } = opts
  const { roomId, data, isDm } = useRoom()
  const mapId = map?.id ?? null
  const layers = useMapLayers(mapId, map?.revealed ?? false)
  const playersCanDraw = !!data?.room.settings?.players_can_draw
  const zoom = useCallback(() => canvas.current?.zoom() ?? 1, [canvas])
  const draw = useDrawTool({ roomId, mapId, layers, isDm, me: data?.me.user_id, playersCanDraw, zoom, onError })
  const [popup, setPopup] = useState<MapNote | null>(null)
  const [placing, setPlacing] = useState<{ pageId: string; title: string } | null>(null)
  const [listening, setListening] = useState(false)
  const [listenAt, setListenAt] = useState<Pt | null>(null)

  // «Поставить на карту» со страницы базы знаний
  useEffect(() => (isDm ? onPlacePageOnMap((v) => setPlacing(v)) : undefined), [isDm])
  // «Показать на карте»: камера к метке
  const notesRef = useRef(layers.notes)
  notesRef.current = layers.notes
  useEffect(
    () =>
      onShowPageOnMap((pageId) => {
        const n = notesRef.current.find((x) => x.page_id === pageId)
        if (!n) return false
        canvas.current?.panTo({ x: n.x, y: n.y })
        canvas.current?.ping({ x: n.x, y: n.y }, n.tint ?? '#f5d06a')
      }),
    [canvas],
  )

  const place = async (pageId: string | null, p: Pt) => {
    if (!mapId) return
    try {
      const n = await createNote(roomId, mapId, { x: Math.round(p.x), y: Math.round(p.y), page_id: pageId, icon: pageId ? 'book' : 'pin' })
      if (n) layers.put('notes', { upsert: [n] })
    } catch (e) {
      onError(errText(e))
    }
  }

  const openNote = (n: MapNote) => {
    if (isDm && n.page_id && openKbPage(n.page_id)) return
    setPopup(n)
  }

  /** ввод с карты раньше остального: true — событие забрано */
  const pointer = (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent, busy = false): boolean => {
    if (draw.pointer(kind, p, e)) return true
    if (draw.active && draw.tool === 'select') {
      // в режиме выбора рисунков метки не открываются, пустое место — пан
      return false
    }
    if (placing || (isDm && listening)) {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) {
        if (placing) {
          void place(placing.pageId, p)
          setPlacing(null)
        } else setListenAt(p)
      }
      return kind !== 'move'
    }
    // busy — карта тащит жетон: отпускание над меткой не открывает её
    if (kind === 'up' && e.button === 0 && !busy) {
      const n = noteAt(layers.notes, p, zoom())
      if (n) {
        openNote(n)
        return true
      }
    }
    return false
  }

  const dragOver = (e: DragEvent) => {
    if (isDm && e.dataTransfer.types.includes(KB_PAGE_MIME)) e.preventDefault()
  }
  const drop = (e: DragEvent) => {
    if (!isDm || !canvas.current) return
    const pageId = e.dataTransfer.getData(KB_PAGE_MIME)
    if (!pageId) return
    e.preventDefault()
    void place(pageId, canvas.current.toMap(e.clientX, e.clientY))
  }

  /** откуда слушать звуки местности */
  const listener = (): Pt | null => {
    if (!map) return null
    if (isDm) return (listening && listenAt) || canvas.current?.center() || null
    const own = myTokens.find((t) => t.id === selected) ?? myTokens[0]
    return own ? { x: own.x, y: own.y } : null
  }

  const togglePlayersDraw = (v: boolean) => {
    if (!data) return
    void patchRoom(roomId, { settings: { ...data.room.settings, players_can_draw: v } }).catch((e) => onError(errText(e)))
  }

  return {
    layers,
    draw,
    playersCanDraw,
    togglePlayersDraw,
    pointer,
    dragOver,
    drop,
    listener,
    listening,
    setListening: (v: boolean) => {
      setListening(v)
      if (!v) setListenAt(null)
    },
    placing,
    cancelPlacing: () => setPlacing(null),
    popup,
    closePopup: () => setPopup(null),
    overlays: {
      notes: layers.notes,
      drawings: layers.drawings,
      ...draw.overlay,
      sounds: isDm && listening ? layers.sounds : null,
      listener: isDm && listening ? listenAt : null,
    },
  }
}
