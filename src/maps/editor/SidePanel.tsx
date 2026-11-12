/** Боковая панель без выбора: вкладки «Карта» (фон, сетка, свет, правила, глазами игрока) и «Сценарий» */
import { Eye, ImagePlus } from 'lucide-react'
import { uploadMedia } from '../../api'
import { fireTrigger } from '../api'
import type { BattleMap } from '../types'
import { errText, uid } from './batch'
import { GridFields } from './GridFields'
import { imageSize } from './imageSize'
import { SpawnsPanel } from './SpawnsPanel'
import { TriggersPanel } from './TriggersPanel'
import type { Change, PatchProps } from './types'

type Props = {
  map: BattleMap
  roomId: string
  mapId: string
  side: 'map' | 'script'
  setSide: (s: 'map' | 'script') => void
  eyes: string | null
  setEyes: (id: string | null) => void
  creatureRefs: { ref: string; name: string }[]
  change: Change
  save: () => Promise<void>
  patchProps: PatchProps
  flash: (t: string) => void
  setError: (e: string | null) => void
}

export function SidePanel({ map, roomId, mapId, side, setSide, eyes, setEyes, creatureRefs, change, save, patchProps, flash, setError }: Props) {
  const g = map.grid
  const bg = map.layers.find((l) => l.kind === 'background')
  const heroTokens = map.tokens.filter((t) => t.character_id)
  return (
    <>
      <nav className="me-tabs is-top">
        <button type="button" className={side === 'map' ? 'is-on' : ''} onClick={() => setSide('map')}>
          Карта
        </button>
        <button type="button" className={side === 'script' ? 'is-on' : ''} onClick={() => setSide('script')}>
          Сценарий
          {(map.triggers?.length ?? 0) + (map.spawns?.length ?? 0) > 0 && <i>{(map.triggers?.length ?? 0) + (map.spawns?.length ?? 0)}</i>}
        </button>
      </nav>
      {side === 'script' ? (
        <>
          <TriggersPanel
            map={map}
            onChange={(triggers) => change((m) => ({ ...m, triggers }))}
            onFire={(id) => {
              void save()
                .then(() => fireTrigger(roomId, mapId, id))
                .then(() => flash('Триггер запущен'), (e) => setError(errText(e)))
            }}
          />
          <SpawnsPanel map={map} creatures={creatureRefs} onChange={(spawns) => change((m) => ({ ...m, spawns }))} />
        </>
      ) : (
        <>
          <section>
            <h3>Фон</h3>
            <label className="me-upload">
              <ImagePlus aria-hidden="true" /> {bg ? 'Заменить картинку' : 'Загрузить картинку'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const [{ url }, size] = await Promise.all([uploadMedia(f), imageSize(f)])
                    const layer = { id: bg?.id ?? uid('bg'), image_url: url, x: 0, y: 0, w: size.w, h: size.h, rotation: 0, z: 0, kind: 'background' as const, opacity: 1 }
                    change((m) => ({ ...m, layers: [...m.layers.filter((l) => l.id !== layer.id), layer] }))
                    await patchProps({ grid: { ...g, cols: Math.ceil(size.w / g.cell_px), rows: Math.ceil(size.h / g.cell_px) } })
                  } catch (err) {
                    setError(errText(err))
                  } finally {
                    e.target.value = ''
                  }
                }}
              />
            </label>
          </section>
          <section>
            <h3>Сетка</h3>
            <GridFields grid={g} onChange={(grid) => void patchProps({ grid })} />
          </section>
          <section>
            <h3>Свет и туман</h3>
            <label>
              Освещение
              <select value={map.ambient.level} onChange={(e) => void patchProps({ ambient: { ...map.ambient, level: e.target.value as BattleMap['ambient']['level'] } })}>
                <option value="bright">яркое</option>
                <option value="dim">сумерки</option>
                <option value="dark">темнота</option>
              </select>
            </label>
            <label>
              Туман
              <select value={map.fog.mode} onChange={(e) => void patchProps({ fog: { ...map.fog, mode: e.target.value as BattleMap['fog']['mode'] } })}>
                <option value="off">нет</option>
                <option value="dynamic">по обзору героев</option>
              </select>
            </label>
            {map.fog.mode !== 'off' && (
              <>
                <label className="me-check">
                  <input type="checkbox" checked={map.fog.shared_party_vision} onChange={(e) => void patchProps({ fog: { ...map.fog, shared_party_vision: e.target.checked } })} /> общий обзор отряда
                </label>
                <label className="me-check" title="Сервер не присылает игроку то, чего его герой не видит">
                  <input type="checkbox" checked={map.fog.honest} onChange={(e) => void patchProps({ fog: { ...map.fog, honest: e.target.checked } })} /> честный туман
                </label>
                {!map.fog.honest && <p className="tb-hint">Туман на клиенте: скрытое лишь не нарисовано.</p>}
              </>
            )}
          </section>
          <section>
            <h3>Правила</h3>
            <label>
              Поднять предмет в бою
              <select value={map.rules?.pickup_costs ?? 'object'} onChange={(e) => void patchProps({ rules: { high_ground_advantage: map.rules?.high_ground_advantage ?? false, pickup_costs: e.target.value } })}>
                <option value="object">свободно</option>
                <option value="bonus">бонусное действие</option>
                <option value="action">действие</option>
              </select>
            </label>
          </section>
          {heroTokens.length > 0 && (
            <section>
              <h3>
                <Eye aria-hidden="true" /> Глазами игрока
              </h3>
              <select value={eyes ?? ''} onChange={(e) => setEyes(e.target.value || null)} aria-label="Чьими глазами смотреть">
                <option value="">мастер</option>
                {heroTokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </section>
          )}
        </>
      )}
    </>
  )
}
