/**
 * Боевые карты в ширме мастера: создать из картинки, открыть конструктор,
 * положить на стол (activate), убрать со стола, удалить. Список — директория
 * с папками (src/ui/directory, вид maps — общий с картинками для показа).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookMarked, FileInput, Library, Map as MapIcon, PenLine, Play, Square, Trash2, Upload, X } from 'lucide-react'
import { ApiError, uploadMedia } from '../api'
import { Img } from '../media'
import { useRoom } from '../rooms/RoomProvider'
import { DirectoryList } from '../ui/directory/DirectoryList'
import { useDirectory } from '../ui/directory/useDirectory'
import { activateMap, createMap, deleteMap, deleteScene, importUvtt, listMaps, listScenes, loadScene, patchMap, saveAsScene, type ScenePresetSummary } from './api'
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
  const [scenes, setScenes] = useState(false)
  const active = data?.room.active_map_id ?? data?.activeMap?.id ?? null
  const dir = useDirectory('maps')
  const { folderOf, sortOf } = dir
  const entries = useMemo(() => (items ?? []).map((m) => ({ m, id: m.id, name: m.name, folderId: folderOf(m), sortOrder: sortOf(m.id) })), [items, folderOf, sortOf])
  const saveScene = (m: BattleMap) => {
    const title = prompt('Название сцены', m.name)
    if (title) void act(() => saveAsScene(roomId, m.id, title))
  }

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
        <li>
          <label className={`sc-map is-add${busy ? ' is-busy' : ''}`} title="Universal VTT из Dungeondraft, DungeonFog и других: картинка, стены, двери и свет">
            <FileInput aria-hidden="true" />
            <b>Импорт .dd2vtt</b>
            <input
              type="file"
              accept=".dd2vtt,.uvtt,.df2vtt,application/json"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                void act(async () => {
                  const m = await importUvtt(roomId, f)
                  setEditing(m.id)
                })
                e.target.value = ''
              }}
            />
          </label>
        </li>
        <li>
          <button type="button" className="sc-map is-add" disabled={busy} onClick={() => setScenes(true)}>
            <Library aria-hidden="true" />
            <b>Из сцен</b>
          </button>
        </li>
      </ul>
      <DirectoryList
        listId="maps-battle"
        label="Боевые карты"
        items={entries}
        folders={dir.folders}
        ops={dir.ops}
        selectedId={active}
        searchPlaceholder="Найти карту…"
        renderItem={({ m }) => {
          const bg = m.layers?.find((l) => l.kind === 'background')?.image_url
          return (
            <>
              <span className="dir-thumb">{bg ? <Img src={bg} alt="" loading="lazy" draggable={false} /> : <MapIcon aria-hidden="true" />}</span>
              <span className="dir-name">{m.name}</span>
              {m.id === active && <em className="dir-live ms-live">на столе</em>}
            </>
          )
        }}
        rowActions={({ m }) =>
          m.id === active ? (
            <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void act(() => patchMap(roomId, m.id, { revealed: false, revision: m.revision } as Partial<BattleMap>))}>
              <Square aria-hidden="true" /> Убрать
            </button>
          ) : (
            <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void act(() => activateMap(roomId, m.id))}>
              <Play aria-hidden="true" /> На стол
            </button>
          )
        }
        actions={{
          open: ({ m }) => setEditing(m.id),
          extra: ({ m }) => [
            m.id === active
              ? { id: 'off', label: 'Убрать со стола', icon: <Square />, disabled: busy, run: () => void act(() => patchMap(roomId, m.id, { revealed: false, revision: m.revision } as Partial<BattleMap>)) }
              : { id: 'on', label: 'На стол', icon: <Play />, disabled: busy, run: () => void act(() => activateMap(roomId, m.id)) },
            { id: 'edit', label: 'Конструктор', icon: <PenLine />, run: () => setEditing(m.id) },
            { id: 'scene', label: 'Сохранить как сцену', icon: <BookMarked />, disabled: busy, run: () => saveScene(m) },
          ],
          rename: ({ m }, name) => act(() => patchMap(roomId, m.id, { name, revision: m.revision } as Partial<BattleMap>)),
          duplicate: ({ m }) => {
            const { id: _id, room_id: _room, revision: _rev, ...rest } = m as BattleMap & { room_id?: string; revision?: number }
            return act(() => createMap(roomId, { ...rest, name: `${m.name} (копия)`, revealed: false }))
          },
          exportJson: ({ m }) => m,
          remove: ({ m }) => act(() => deleteMap(roomId, m.id)),
        }}
        empty={items && items.length === 0 ? <p className="tb-hint">Создайте карту из картинки, пустую или из сцены.</p> : null}
      />
      {dir.error && <p className="tb-err">{dir.error}</p>}
      {error && <p className="tb-err">{error}</p>}
      {scenes && (
        <ScenesPicker
          onClose={() => setScenes(false)}
          onLoad={(id) => {
            setScenes(false)
            void act(() => loadScene(roomId, id, true))
          }}
        />
      )}
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

/** Библиотека сцен: официальные, публичные и свои */
function ScenesPicker({ onClose, onLoad }: { onClose: () => void; onLoad: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<ScenePresetSummary[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    const t = setTimeout(() => listScenes(q.trim()).then((x) => on && setList(x), (e) => on && setErr(errText(e))), 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="ms-scenes" role="dialog" aria-label="Сцены">
      <header>
        <b>Сцены</b>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: склеп, таверна" aria-label="Поиск сцен" />
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <ul>
        {(list ?? []).map((s) => (
          <li key={s.id}>
            <div>
              <b>{s.title}</b>
              <i>
                {[s.visibility === 'official' ? 'официальная' : s.visibility === 'private' ? 'моя' : 'общая', s.encounters ? `групп врагов: ${s.encounters}` : '', s.loot ? `находок: ${s.loot}` : '', s.level_range ? `ур. ${s.level_range[0]}–${s.level_range[1]}` : ''].filter(Boolean).join(' · ')}
              </i>
              {s.description && <p>{s.description}</p>}
            </div>
            <span>
              <button type="button" className="tb-goldbtn" onClick={() => onLoad(s.id)}>
                <Play aria-hidden="true" /> На стол
              </button>
              {s.visibility === 'private' && (
                <button type="button" className="sc-iconbtn is-danger" aria-label="Удалить сцену" onClick={() => confirm(`Удалить сцену «${s.title}»?`) && void deleteScene(s.id).then(() => setList((l) => (l ?? []).filter((x) => x.id !== s.id)), (e) => setErr(errText(e)))}>
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </span>
          </li>
        ))}
        {list && list.length === 0 && <li className="tb-hint">Сцен пока нет. Сохраните свою карту кнопкой с закладкой.</li>}
        {!list && !err && <li className="tb-hint">Загружаем…</li>}
      </ul>
      {err && <p className="tb-err">{err}</p>}
    </div>
  )
}
