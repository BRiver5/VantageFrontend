import { useState } from 'react'
import { Map as MapIcon, Presentation, Star, Trash2, Upload } from 'lucide-react'
import { uploadMedia } from '../../../api'
import type { BattleMap } from '../../../types/rooms'
import { ContentPanel, showToAll } from '../../Content'
import { useRoom } from '../../RoomProvider'
import { createMap, deleteMap, listMaps, patchMap } from '../../roomsApi'
import { errText } from '../parts'
import { Img } from '../../../media'
import { MapsShelf } from '../../../maps/MapsShelf'
import { useList } from './common'

/* ---------- карты и показ ---------- */

export function LeafMaps({ onlyQuick = false }: { onlyQuick?: boolean }) {
  const { roomId } = useRoom()
  const { items, error, setError, reload } = useList<BattleMap>(listMaps)
  const [sent, setSent] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const list = (items ?? []).filter((m) => !onlyQuick || m.quick_access)
  // карта, по которой идёт запрос: её кнопки не жмутся второй раз
  const [pending, setPending] = useState<string | null>(null)
  const act = (id: string, fn: () => Promise<unknown>, after?: () => void) => {
    if (pending) return
    setError(null)
    setPending(id)
    fn()
      .then(after, (e) => setError(errText(e)))
      .finally(() => setPending(null))
  }
  return (
    <div className={onlyQuick ? '' : 'sc-two is-maps'}>
      <div className="sc-pane">
        {!onlyQuick && <MapsShelf />}
        {!onlyQuick && <h3 className="ms-sub">Картинки для показа</h3>}
        <ul className="sc-maps">
          {!onlyQuick && (
            <li>
              <label className={`sc-map is-add${uploading ? ' is-busy' : ''}`}>
                <Upload aria-hidden="true" />
                <b>{uploading ? 'Загружаем…' : 'Новая карта'}</b>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setUploading(true)
                    setError(null)
                    try {
                      const { url } = await uploadMedia(f)
                      await createMap(roomId, { name: f.name.replace(/\.[^.]+$/, '') || 'Карта', image_url: url, grid: { cols: 30, rows: 20, cell_px: 50, offset_x: 0, offset_y: 0 } })
                      await reload()
                    } catch (err) {
                      setError(errText(err))
                    } finally {
                      setUploading(false)
                      e.target.value = ''
                    }
                  }}
                />
              </label>
            </li>
          )}
          {list.map((m) => (
            <li key={m.id}>
              <div className="sc-map">
                {m.image_url ? <Img src={m.image_url} alt="" loading="lazy" draggable={false} /> : <MapIcon aria-hidden="true" />}
                <b>{m.name}</b>
                <span className="sc-map-acts">
                  <button type="button" className="tb-goldbtn" disabled={!m.image_url || pending === m.id} onClick={() => act(m.id, () => showToAll(roomId, m.image_url ?? '', m.name), () => setSent(m.id))}>
                    <Presentation aria-hidden="true" /> {sent === m.id ? 'Показано' : 'Показать'}
                  </button>
                  {!onlyQuick && (
                    <>
                      <button type="button" className={`sc-iconbtn${m.quick_access ? ' is-on' : ''}`} aria-pressed={m.quick_access} aria-label="Быстрый доступ" title="Быстрый доступ" disabled={pending === m.id} onClick={() => act(m.id, () => patchMap(roomId, m.id, { quick_access: !m.quick_access }), () => void reload())}>
                        <Star aria-hidden="true" />
                      </button>
                      <button type="button" className="sc-iconbtn is-danger" aria-label="Удалить" title="Удалить" disabled={pending === m.id} onClick={() => confirm(`Удалить «${m.name}»?`) && act(m.id, () => deleteMap(roomId, m.id), () => void reload())}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
          {onlyQuick && items && list.length === 0 && <li className="tb-hint">Отметьте карту звездой в разделе «Карты».</li>}
        </ul>
        {error && <p className="tb-err">{error}</p>}
      </div>
      {!onlyQuick && (
        <div className="sc-pane">
          <ContentPanel bare />
        </div>
      )}
    </div>
  )
}
