/**
 * Боевые карты в ширме мастера: создать из картинки, открыть конструктор,
 * положить на стол (activate), убрать со стола, удалить.
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Map as MapIcon, PenLine, Play, Square, Trash2, Upload } from 'lucide-react'
import { ApiError, uploadMedia } from '../api'
import { Img } from '../media'
import { useRoom } from '../rooms/RoomProvider'
import { activateMap, createMap, deleteMap, listMaps, patchMap } from './api'
import { MapEditor } from './MapEditor'
import type { BattleMap } from './types'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')

export function blankMap(name: string, image?: { url: string; w: number; h: number }): Partial<BattleMap> {
  const cell = 70
  const w = image?.w ?? cell * 24
  const h = image?.h ?? cell * 16
  return {
    name,
    description: '',
    revealed: false,
    grid: { kind: 'square', cell_px: cell, feet_per_cell: 5, cols: Math.ceil(w / cell), rows: Math.ceil(h / cell), offset_x: 0, offset_y: 0, area_rule: 'touch', diagonal: '5' },
    layers: image ? [{ id: 'bg', image_url: image.url, x: 0, y: 0, w, h, rotation: 0, z: 0, kind: 'background', opacity: 1 }] : [],
    terrain: { elevation: {}, difficult: [], water: [], climbable: [] },
    objects: [],
    walls: [],
    lights: [],
    ambient: { level: 'bright', color: null },
    tokens: [],
    items: [],
    zones: [],
    fog: { mode: 'off', honest: false, shared_party_vision: true },
  }
}

const sizeOf = (f: File) =>
  new Promise<{ w: number; h: number }>((ok, fail) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      ok({ w: img.naturalWidth, h: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => fail(new Error('Картинка не читается'))
    img.src = url
  })

export function MapsShelf() {
  const { roomId, data } = useRoom()
  const [items, setItems] = useState<BattleMap[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [off, setOff] = useState(false)
  const active = data?.room.active_map_id ?? data?.activeMap?.id ?? null

  const reload = useCallback(
    () =>
      listMaps(roomId).then(setItems, (e) => {
        // сервер ещё без карт: маршрута нет
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setOff(true)
        else setError(errText(e))
      }),
    [roomId],
  )
  useEffect(() => {
    void reload()
  }, [reload])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (off) {
    return (
      <section className="ms-shelf" aria-label="Боевые карты">
        <h3>Боевые карты</h3>
        <p className="tb-hint">Боевые карты заработают после обновления сервера.</p>
      </section>
    )
  }
  return (
    <section className="ms-shelf" aria-label="Боевые карты">
      <h3>Боевые карты</h3>
      <ul className="sc-maps">
        <li>
          <label className={`sc-map is-add${busy ? ' is-busy' : ''}`}>
            <Upload aria-hidden="true" />
            <b>{busy ? 'Создаём…' : 'Из картинки'}</b>
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                void act(async () => {
                  const [{ url }, size] = await Promise.all([uploadMedia(f), sizeOf(f)])
                  const m = await createMap(roomId, blankMap(f.name.replace(/\.[^.]+$/, '') || 'Карта', { url, ...size }))
                  setEditing(m.id)
                })
                e.target.value = ''
              }}
            />
          </label>
        </li>
        <li>
          <button
            type="button"
            className="sc-map is-add"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const m = await createMap(roomId, blankMap('Пустая карта'))
                setEditing(m.id)
              })
            }
          >
            <MapIcon aria-hidden="true" />
            <b>Пустая</b>
          </button>
        </li>
        {(items ?? []).map((m) => {
          const bg = m.layers?.find((l) => l.kind === 'background')?.image_url
          const on = m.id === active
          return (
            <li key={m.id}>
              <div className={`sc-map${on ? ' is-active' : ''}`}>
                {bg ? <Img src={bg} alt="" loading="lazy" draggable={false} /> : <MapIcon aria-hidden="true" />}
                <b>{m.name}</b>
                {on && <em className="ms-live">на столе</em>}
                <span className="sc-map-acts">
                  {on ? (
                    <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void act(() => patchMap(roomId, m.id, { revealed: false, revision: m.revision } as Partial<BattleMap>))}>
                      <Square aria-hidden="true" /> Убрать
                    </button>
                  ) : (
                    <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void act(() => activateMap(roomId, m.id))}>
                      <Play aria-hidden="true" /> На стол
                    </button>
                  )}
                  <button type="button" className="sc-iconbtn" aria-label="Конструктор" title="Конструктор" onClick={() => setEditing(m.id)}>
                    <PenLine aria-hidden="true" />
                  </button>
                  <button type="button" className="sc-iconbtn is-danger" aria-label="Удалить" title="Удалить" disabled={busy} onClick={() => confirm(`Удалить «${m.name}»?`) && void act(() => deleteMap(roomId, m.id))}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {error && <p className="tb-err">{error}</p>}
      {editing &&
        createPortal(
          <MapEditor
            mapId={editing}
            onClose={() => {
              setEditing(null)
              void reload()
            }}
          />,
          document.body,
        )}
    </section>
  )
}
