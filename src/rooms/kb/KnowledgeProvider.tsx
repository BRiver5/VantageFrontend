import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../../api'
import type { ScreenNote } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { createNote, deleteNote, listNotes, patchNote, patchNotesBatch } from '../roomsApi'
import { errText } from '../table/parts'
import { Ctx, type KnowledgeApi, NoteConflict } from './context'
import { KnowledgeWorkspace } from './KnowledgeBase'

export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const { roomId } = useRoom()
  const [notes, setNotes] = useState<ScreenNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listNotes(roomId).then(
      (n) => alive && setNotes(n),
      (e) => alive && setError(errText(e)),
    )
    return () => {
      alive = false
    }
  }, [roomId])

  const create = useCallback(
    async (body: Partial<ScreenNote>) => {
      try {
        const n = await createNote(roomId, { title: 'Новая страница', body: '', ...body })
        setNotes((l) => [...(l ?? []), n])
        return n
      } catch (e) {
        setError(errText(e))
        return null
      }
    },
    [roomId],
  )
  // ревизии на экране: с ними сервер не даст затереть правку из другой вкладки
  const revs = useRef(new Map<string, number>())
  useEffect(() => {
    for (const n of notes ?? []) if (n.revision != null && !revs.current.has(n.id)) revs.current.set(n.id, n.revision)
  }, [notes])
  const reload = useCallback(async () => {
    const fresh = await listNotes(roomId)
    revs.current = new Map(fresh.filter((n) => n.revision != null).map((n) => [n.id, n.revision as number]))
    setNotes(fresh)
  }, [roomId])

  const update = useCallback(
    async (id: string, patch: Partial<ScreenNote>, force = false) => {
      setNotes((l) => (l ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)))
      const rev = revs.current.get(id)
      try {
        const saved = await patchNote(roomId, id, force || rev == null ? patch : { ...patch, revision: rev })
        if (saved?.revision != null) revs.current.set(id, saved.revision)
        setNotes((l) => (l ?? []).map((n) => (n.id === id ? { ...n, ...saved, ...patch } : n)))
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          await reload().catch(() => undefined)
          throw new NoteConflict()
        }
        setError(errText(e))
        throw e
      }
    },
    [roomId, reload],
  )
  const updateMany = useCallback(
    async (items: (Partial<ScreenNote> & { id: string })[]) => {
      if (items.length === 0) return
      setNotes((l) => (l ?? []).map((n) => ({ ...n, ...(items.find((x) => x.id === n.id) ?? {}) })))
      try {
        const res = await patchNotesBatch(roomId, items.map((x) => ({ ...x, ...(revs.current.has(x.id) ? { revision: revs.current.get(x.id) } : {}) })))
        for (const n of res.items ?? []) if (n.revision != null) revs.current.set(n.id, n.revision)
        setNotes((l) => (l ?? []).map((n) => res.items?.find((x) => x.id === n.id) ?? n))
      } catch (e) {
        // старый сервер без пакетной правки — по одной
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          for (const x of items) await update(x.id, x).catch(() => undefined)
          return
        }
        if (e instanceof ApiError && e.status === 409) {
          await reload().catch(() => undefined)
          throw new NoteConflict()
        }
        setError(errText(e))
        throw e
      }
    },
    [roomId, reload, update],
  )
  const remove = useCallback(
    async (id: string) => {
      await deleteNote(roomId, id)
      setNotes((l) => (l ?? []).filter((n) => n.id !== id))
      setCurrent((c) => (c === id ? null : c))
    },
    [roomId],
  )
  const value = useMemo<KnowledgeApi>(
    () => ({
      notes,
      error,
      isOpen,
      current,
      open: (id) => {
        if (id !== undefined) setCurrent(id)
        setOpen(true)
      },
      close: () => setOpen(false),
      create,
      update,
      updateMany,
      remove,
      setCurrent,
    }),
    [notes, error, isOpen, current, create, update, updateMany, remove],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <KnowledgeWorkspace />}
    </Ctx.Provider>
  )
}
