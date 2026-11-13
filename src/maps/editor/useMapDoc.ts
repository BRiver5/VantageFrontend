/**
 * Карта конструктора: загрузка, правки со стеком отмены, автосохранение
 * пакетом /edit (рельеф — PATCH) и правка свойств карты.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api'
import { editMap, getMap, patchMap } from '../api'
import type { BattleMap } from '../types'
import { applyBatch, diffBatch, errText } from './batch'
import type { SaveState } from './types'

export function useMapDoc(roomId: string, mapId: string) {
  const [map, setMap] = useState<BattleMap | null>(null)
  const saved = useRef<BattleMap | null>(null)
  const undo = useRef<BattleMap[]>([])
  const redo = useRef<BattleMap[]>([])
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState<string | null>(null)

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
        try {
          const fresh = await getMap(roomId, mapId)
          saved.current = fresh
          setMap((m) => (m ? { ...applyBatch(fresh, diffBatch(base, m) ?? {}), terrain: m.terrain } : fresh))
          setState('dirty')
        } catch (e2) {
          // не перечитали — правки остаются, показываем ошибку
          setState('error')
          setError(errText(e2))
        }
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

  return { map, setMap, undo, redo, state, setState, error, setError, change, save, patchProps }
}
