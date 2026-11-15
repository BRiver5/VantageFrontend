/**
 * Папки одного списка мастера: загрузка, событие folders.changed из других вкладок
 * и операции для DirectoryList. У таблиц и базы знаний (``paths``) папка записи —
 * строка-путь: папки, которых нет на сервере, показываются виртуальными и
 * создаются (/folders/ensure) при первом действии с ними.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../../api'
import { useRoom, useRoomEvents } from '../../rooms/RoomProvider'
import { createFolder, deleteFolder, ensureFolderPath, listFolders, moveInFolders, patchFolder, type FolderKind, type FolderListing, type FolderPatch } from './api'
import { folderPath, fromServer, mergePathFolders, type DirFolder } from './model'
import type { FolderOps, MoveRequest } from './types'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

export interface DirectoryOptions {
  /** Пути папок записей — у списков, где папка хранится строкой (таблицы, база знаний) */
  paths?: (string | null | undefined)[]
  /** Записи сами разложит владелец списка (база знаний — пакетной правкой страниц) */
  moveItems?: (ids: string[], path: string, order: string[] | null) => Promise<void>
  /** Сервер переписал что-то в записях (пути): перечитать их */
  onChanged?: () => void
  /** Не загружать (список сейчас не показан) */
  disabled?: boolean
}

export interface Directory {
  folders: DirFolder[]
  /** Папка записи: по ``placements`` или по строке-пути */
  folderOf: (doc: { id: string; folder?: string | null }) => string | null
  sortOf: (id: string) => number | null
  ops: FolderOps | null
  error: string | null
  clearError: () => void
}

export function useDirectory(kind: FolderKind, opts: DirectoryOptions = {}): Directory {
  const { roomId } = useRoom()
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [off, setOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathMode = opts.paths != null
  const { moveItems, onChanged } = opts

  const reload = useCallback(
    () =>
      listFolders(roomId, kind).then(setListing, (e) => {
        // сервер ещё без папок — список работает и так
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setOff(true)
        else setError(errText(e))
      }),
    [roomId, kind],
  )
  const disabled = !!opts.disabled
  useEffect(() => {
    if (!disabled) void reload()
  }, [reload, disabled])
  useRoomEvents((msg) => {
    if (!disabled && msg.type === 'folders.changed' && (msg.payload as { kind?: string })?.kind === kind) {
      void reload()
      if (pathMode) onChanged?.()
    }
  })

  const pathsKey = (opts.paths ?? []).join('\n')
  const merged = useMemo(() => {
    const server = listing?.folders ?? []
    if (!pathMode) return { folders: fromServer(server), byPath: () => null as string | null }
    return mergePathFolders(server, pathsKey ? pathsKey.split('\n') : [])
  }, [listing, pathMode, pathsKey])

  const folderOf = useCallback(
    (doc: { id: string; folder?: string | null }) => (pathMode ? merged.byPath(doc.folder) : (listing?.placements[doc.id]?.folder_id ?? null)),
    [pathMode, merged, listing],
  )
  const sortOf = useCallback((id: string) => listing?.placements[id]?.sort_order ?? null, [listing])

  /** Виртуальная папка → настоящая (создаётся по пути) */
  const real = useCallback(
    async (id: string | null): Promise<string | null> => {
      if (id == null) return null
      const f = merged.folders.find((x) => x.id === id)
      if (!f?.virtual) return id
      const res = await ensureFolderPath(roomId, kind, f.path ?? f.name)
      setListing((l) => (l ? { ...l, folders: res.folders } : l))
      return res.folder.id
    },
    [merged, roomId, kind],
  )

  const ops = useMemo<FolderOps | null>(() => {
    if (off) return null
    const guard = async (fn: () => Promise<unknown>) => {
      setError(null)
      try {
        await fn()
      } catch (e) {
        setError(errText(e))
        throw e
      }
    }
    const after = async () => {
      await reload()
      if (pathMode) onChanged?.()
    }
    return {
      createFolder: async (parentId, name) => {
        let id: string | null = null
        await guard(async () => {
          const f = await createFolder(roomId, { kind, name, parent_id: await real(parentId) })
          id = f.id
          await reload()
        })
        return id
      },
      patchFolder: (id, patch: FolderPatch) =>
        guard(async () => {
          const rid = await real(id)
          if (rid) await patchFolder(roomId, rid, patch)
          await after()
        }),
      deleteFolder: (id) =>
        guard(async () => {
          const rid = await real(id)
          if (rid) await deleteFolder(roomId, rid)
          await after()
        }),
      move: (req: MoveRequest) =>
        guard(async () => {
          const target = await real(req.targetId)
          const folders: string[] = []
          for (const f of req.folderIds) {
            const rid = await real(f)
            if (rid) folders.push(rid)
          }
          // порядок: виртуальные id папок заменяем настоящими
          const order = req.order ? await Promise.all(req.order.map(async (x) => (merged.folders.some((f) => f.id === x) ? ((await real(x)) ?? x) : x))) : null
          if (pathMode && moveItems && (req.itemIds.length > 0 || req.order)) {
            const fresh = listing ? await listFolders(roomId, kind).catch(() => null) : null
            const all = fresh ? fromServer(fresh.folders) : merged.folders
            const itemOrder = order ? order.filter((x) => !all.some((f) => f.id === x)) : null
            await moveItems(req.itemIds, folderPath(all, target), itemOrder)
            if (folders.length > 0 || order) await moveInFolders(roomId, { kind, folder_id: target, folders, order: order?.filter((x) => all.some((f) => f.id === x)) })
            await after()
            return
          }
          const res = await moveInFolders(roomId, { kind, folder_id: target, ids: req.itemIds, folders, order: order ?? undefined })
          setListing(res)
          if (pathMode) onChanged?.()
        }),
    }
  }, [off, roomId, kind, real, reload, pathMode, onChanged, moveItems, merged, listing])

  return { folders: merged.folders, folderOf, sortOf, ops, error, clearError: () => setError(null) }
}
