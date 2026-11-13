/**
 * Слои карты на клиенте: читаем GET …/layers при смене карты и после
 * переподключения, дальше живём событиями map.notes / map.sounds /
 * map.drawings. Правки отражаем сразу (оптимистично) — событие сервера
 * затем перезапишет запись тем же id.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRoom, useRoomEvents } from '../../rooms/RoomProvider'
import { getLayers } from './api'
import { applyDelta, byZ } from './apply'
import type { LayerDelta, MapDrawing, MapNote, MapSound } from './types'

export interface MapLayers {
  notes: MapNote[]
  sounds: MapSound[]
  drawings: MapDrawing[]
  /** местная правка до ответа сервера */
  put: <K extends 'notes' | 'sounds' | 'drawings'>(kind: K, delta: { upsert?: LayerItem[K][]; remove?: string[] }) => void
  reload: () => void
}
type LayerItem = { notes: MapNote; sounds: MapSound; drawings: MapDrawing }

const EMPTY = { notes: [] as MapNote[], sounds: [] as MapSound[], drawings: [] as MapDrawing[] }

export function useMapLayers(mapId: string | null | undefined, revealed = true): MapLayers {
  const { roomId, data } = useRoom()
  const [state, setState] = useState<{ mapId: string | null; notes: MapNote[]; sounds: MapSound[]; drawings: MapDrawing[] }>({ mapId: null, ...EMPTY })
  const [tick, setTick] = useState(0)
  const connected = data != null

  useEffect(() => {
    if (!mapId || !connected) return
    let alive = true
    getLayers(roomId, mapId).then(
      (r) => alive && r && setState({ mapId, notes: r.notes ?? [], sounds: r.sounds ?? [], drawings: byZ(r.drawings ?? []) }),
      () => alive && setState({ mapId, ...EMPTY }),
    )
    return () => {
      alive = false
    }
  }, [roomId, mapId, tick, connected, revealed])

  useRoomEvents((msg) => {
    if (msg.type !== 'map.notes' && msg.type !== 'map.sounds' && msg.type !== 'map.drawings') return
    const p = msg.payload as LayerDelta<never>
    if (!mapId || p.map_id !== mapId) return
    const kind = msg.type === 'map.notes' ? 'notes' : msg.type === 'map.sounds' ? 'sounds' : 'drawings'
    setState((s) => (s.mapId !== mapId ? s : patch(s, kind, p)))
  })

  const put = useCallback<MapLayers['put']>(
    (kind, delta) => setState((s) => patch(s, kind, { map_id: s.mapId ?? '', ...delta } as LayerDelta<never>)),
    [],
  )
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const same = state.mapId === mapId
  return { notes: same ? state.notes : EMPTY.notes, sounds: same ? state.sounds : EMPTY.sounds, drawings: same ? state.drawings : EMPTY.drawings, put, reload }
}

function patch<S extends { notes: MapNote[]; sounds: MapSound[]; drawings: MapDrawing[] }>(s: S, kind: 'notes' | 'sounds' | 'drawings', d: LayerDelta<never>): S {
  if (kind === 'drawings') return { ...s, drawings: byZ(applyDelta(s.drawings, d as LayerDelta<MapDrawing>)) }
  if (kind === 'notes') return { ...s, notes: applyDelta(s.notes, d as LayerDelta<MapNote>) }
  return { ...s, sounds: applyDelta(s.sounds, d as LayerDelta<MapSound>) }
}
