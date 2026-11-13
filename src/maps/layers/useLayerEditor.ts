/**
 * Метки и звуки местности в конструкторе. Это отдельные слои: правки уходят
 * сразу своими запросами, а не пакетом /edit, и стек отмены конструктора их
 * не касается.
 *
 * Инструмент «Метка» (P): клик ставит метку; страницу можно перетащить из
 * базы знаний. Инструмент «Звук» (A): клик выбирает место, источник — в
 * свойствах. В «Выборе» метки и звуки тащатся мышью, Delete убирает.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import type { MapCanvasHandle } from '../render/types'
import { noteAt, soundAt } from '../render/notes'
import type { Pt } from '../types'
import { KB_PAGE_MIME } from '../notes/bus'
import { createNote, createSound, deleteNote, deleteSound, patchNote, patchSound, type NoteInput, type SoundInput } from './api'
import type { MapNote, MapSound } from './types'
import { useMapLayers } from './useMapLayers'

export type LayerTool = 'note' | 'sound'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

export function useLayerEditor(opts: { roomId: string; mapId: string; tool: string; canvas: RefObject<MapCanvasHandle | null>; onError: (t: string) => void }) {
  const { roomId, mapId, tool, canvas, onError } = opts
  const layers = useMapLayers(mapId)
  const [sel, setSel] = useState<string | null>(null)
  const [pendingSound, setPendingSound] = useState<Pt | null>(null)
  const drag = useRef<{ id: string; kind: 'note' | 'sound'; from: Pt; base: Pt; moved: boolean } | null>(null)
  const k = () => canvas.current?.zoom() ?? 1

  const note = layers.notes.find((n) => n.id === sel) ?? null
  const sound = layers.sounds.find((s) => s.id === sel) ?? null

  const fail = useCallback(
    (e: unknown) => {
      onError(errText(e))
      layers.reload()
    },
    [onError, layers],
  )

  const addNote = async (p: Pt, body: NoteInput = {}) => {
    try {
      const n = await createNote(roomId, mapId, { x: Math.round(p.x), y: Math.round(p.y), icon: body.page_id ? 'book' : 'pin', ...body })
      if (n) {
        layers.put('notes', { upsert: [n] })
        setSel(n.id)
      }
    } catch (e) {
      onError(errText(e))
    }
  }
  const setNote = (n: MapNote, patch: NoteInput) => {
    layers.put('notes', { upsert: [{ ...n, ...patch } as MapNote] })
    void patchNote(roomId, mapId, n.id, patch).then((saved) => saved && layers.put('notes', { upsert: [saved] }), fail)
  }
  const removeNote = (n: MapNote) => {
    layers.put('notes', { remove: [n.id] })
    setSel(null)
    void deleteNote(roomId, mapId, n.id).catch(fail)
  }
  const addSound = async (body: SoundInput) => {
    if (!pendingSound) return
    try {
      const s = await createSound(roomId, mapId, { x: Math.round(pendingSound.x), y: Math.round(pendingSound.y), ...body })
      if (s) {
        layers.put('sounds', { upsert: [s] })
        setSel(s.id)
      }
      setPendingSound(null)
    } catch (e) {
      onError(errText(e))
    }
  }
  const setSound = (s: MapSound, patch: SoundInput) => {
    layers.put('sounds', { upsert: [{ ...s, ...patch } as MapSound] })
    void patchSound(roomId, mapId, s.id, patch).then((saved) => saved && layers.put('sounds', { upsert: [saved] }), fail)
  }
  const removeSound = (s: MapSound) => {
    layers.put('sounds', { remove: [s.id] })
    setSel(null)
    void deleteSound(roomId, mapId, s.id).catch(fail)
  }

  useEffect(() => {
    if (tool !== 'sound') setPendingSound(null)
  }, [tool])

  // Delete и Esc для выбранной метки или звука
  useEffect(() => {
    if (!note && !sound && !pendingSound) return
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === 'Escape') {
        setSel(null)
        setPendingSound(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (note) removeNote(note)
        else if (sound) removeSound(sound)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  /** ввод конструктора: undefined — не наше, решает конструктор */
  const pointer = (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent): boolean | undefined => {
    if (tool === 'note' || tool === 'sound') {
      if (kind === 'down') return e.button === 0
      if (kind === 'up' && e.button === 0) {
        if (tool === 'note') void addNote(p, { label: 'Метка' })
        else {
          setSel(null)
          setPendingSound({ x: Math.round(p.x), y: Math.round(p.y) })
        }
      }
      return true
    }
    if (tool !== 'select') return undefined
    if (kind === 'down') {
      if (e.button !== 0) return undefined
      const n = noteAt(layers.notes, p, k())
      const s = n ? null : soundAt(layers.sounds, p, k())
      const hit = n ?? s
      if (!hit) {
        setSel(null)
        return undefined
      }
      setSel(hit.id)
      drag.current = { id: hit.id, kind: n ? 'note' : 'sound', from: p, base: { x: hit.x, y: hit.y }, moved: false }
      return true
    }
    const d = drag.current
    if (!d) return undefined
    const at = { x: Math.round(d.base.x + p.x - d.from.x), y: Math.round(d.base.y + p.y - d.from.y) }
    if (kind === 'move') {
      if (!d.moved && Math.hypot(p.x - d.from.x, p.y - d.from.y) < 3 / k()) return true
      d.moved = true
      if (d.kind === 'note') {
        const n = layers.notes.find((x) => x.id === d.id)
        if (n) layers.put('notes', { upsert: [{ ...n, ...at }] })
      } else {
        const s = layers.sounds.find((x) => x.id === d.id)
        if (s) layers.put('sounds', { upsert: [{ ...s, ...at }] })
      }
      return true
    }
    drag.current = null
    if (d.moved) {
      if (d.kind === 'note') void patchNote(roomId, mapId, d.id, at).catch(fail)
      else void patchSound(roomId, mapId, d.id, at).catch(fail)
    }
    return true
  }

  const dragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(KB_PAGE_MIME)) e.preventDefault()
  }
  /** страница базы знаний брошена на холст: true — забрали */
  const drop = (e: DragEvent): boolean => {
    const pageId = e.dataTransfer.getData(KB_PAGE_MIME)
    if (!pageId || !canvas.current) return false
    e.preventDefault()
    void addNote(canvas.current.toMap(e.clientX, e.clientY), { page_id: pageId })
    return true
  }

  return {
    layers,
    pointer,
    dragOver,
    drop,
    selected: note ?? sound ?? (pendingSound ? 'pending' : null),
    note,
    sound,
    pendingSound,
    cancelSound: () => setPendingSound(null),
    addSound,
    setNote,
    removeNote,
    setSound,
    removeSound,
    overlays: { notes: layers.notes, sounds: layers.sounds, drawings: layers.drawings, layerSelected: sel, listener: pendingSound },
  }
}
