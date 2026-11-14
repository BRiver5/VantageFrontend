/**
 * Панель с сервера: читается при входе в комнату, правки сохраняются целиком с
 * небольшой задержкой (несколько перетаскиваний подряд — один запрос). Если
 * сервер панели не знает (старая версия), панель живёт в браузере.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import { getHotbar, putHotbar } from './api'
import { emptyPages, normalizePages, type HotbarPages } from './model'

const SAVE_DELAY = 600
const localKey = (roomId: string) => `vantage.hotbar.${roomId}`

function readLocal(roomId: string): HotbarPages {
  try {
    const raw = localStorage.getItem(localKey(roomId))
    return raw ? normalizePages(JSON.parse(raw)) : emptyPages()
  } catch {
    return emptyPages()
  }
}

function writeLocal(roomId: string, pages: HotbarPages) {
  try {
    localStorage.setItem(localKey(roomId), JSON.stringify(pages))
  } catch {
    // приватный режим: живёт до перезагрузки
  }
}

export function useHotbarPages(roomId: string) {
  const [pages, setPages] = useState<HotbarPages>(emptyPages)
  const [error, setError] = useState<string | null>(null)
  const local = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef<HotbarPages | null>(null)
  const dirty = useRef(false)

  useEffect(() => {
    let alive = true
    getHotbar(roomId)
      .then((p) => {
        // пока грузилось, игрок уже мог что-то положить: его правка важнее
        if (alive && !dirty.current) setPages(p)
      })
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          local.current = true
          if (!dirty.current) setPages(readLocal(roomId))
        }
      })
    return () => {
      alive = false
    }
  }, [roomId])

  const flush = useCallback(() => {
    const p = latest.current
    if (!p) return
    latest.current = null
    if (local.current) {
      writeLocal(roomId, p)
      return
    }
    putHotbar(roomId, p).then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : 'Панель не сохранилась'),
    )
  }, [roomId])

  // уйти из комнаты — дописать несохранённое
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      flush()
    },
    [flush],
  )

  const update = useCallback(
    (fn: (p: HotbarPages) => HotbarPages) => {
      setPages((prev) => {
        const next = fn(prev)
        if (next === prev) return prev
        dirty.current = true
        latest.current = next
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, SAVE_DELAY)
        return next
      })
    },
    [flush],
  )

  return { pages, update, error }
}
