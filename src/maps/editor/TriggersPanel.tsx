/** Триггеры сценария карты */
import { useState } from 'react'
import { Play, Plus, Trash2 } from 'lucide-react'
import { BlockList, type BlockRefs } from '../blocks'
import type { BattleMap, MapTrigger, SceneAction, TriggerEvent } from '../types'
import { uid } from './batch'
import { useRefs } from './useRefs'

const EVENTS: { id: TriggerEvent; label: string; match?: 'zone_id' | 'wall_id' | 'object_id' | 'group' | 'variable' }[] = [
  { id: 'token_enters_zone', label: 'входит в зону', match: 'zone_id' },
  { id: 'token_leaves_zone', label: 'выходит из зоны', match: 'zone_id' },
  { id: 'turn_start_in_zone', label: 'начинает ход в зоне', match: 'zone_id' },
  { id: 'turn_end_in_zone', label: 'заканчивает ход в зоне', match: 'zone_id' },
  { id: 'door_opened', label: 'дверь открыли', match: 'wall_id' },
  { id: 'door_closed', label: 'дверь закрыли', match: 'wall_id' },
  { id: 'object_interacted', label: 'тронули объект', match: 'object_id' },
  { id: 'item_picked', label: 'подняли предмет' },
  { id: 'round_start', label: 'начался раунд' },
  { id: 'turn_start', label: 'начался ход' },
  { id: 'turn_end', label: 'закончился ход' },
  { id: 'combat_started', label: 'начался бой' },
  { id: 'combat_ended', label: 'бой окончен' },
  { id: 'creature_died', label: 'существо погибло' },
  { id: 'hp_below', label: 'хиты ниже порога' },
  { id: 'group_activated', label: 'группа проснулась', match: 'group' },
  { id: 'variable_changed', label: 'переменная изменилась', match: 'variable' },
  { id: 'manual', label: 'вручную (кнопкой)' },
]

export function TriggersPanel({ map, onChange, onFire }: { map: BattleMap; onChange: (list: MapTrigger[]) => void; onFire?: (id: string) => void }) {
  const refs = useRefs(map)
  const list = map.triggers ?? []
  const [open, setOpen] = useState<string | null>(null)
  const set = (id: string, patch: Partial<MapTrigger>) => onChange(list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  return (
    <section>
      <h3>Триггеры</h3>
      <ul className="me-list">
        {list.map((t) => {
          const ev = EVENTS.find((e) => e.id === t.event)
          const matchRefs = ev?.match ? (refs[ev.match as keyof BlockRefs] ?? null) : null
          return (
            <li key={t.id} className={open === t.id ? 'is-open' : ''}>
              <button type="button" className="me-list-head" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <b>{t.name || 'Триггер'}</b>
                <i>Когда {ev?.label ?? t.event}</i>
              </button>
              {open === t.id && (
                <div className="me-trig">
                  <label>
                    Название
                    <input value={t.name} onChange={(e) => set(t.id, { name: e.target.value })} />
                  </label>
                  <label>
                    Когда
                    <select value={t.event} onChange={(e) => set(t.id, { event: e.target.value as TriggerEvent, match: {} })}>
                      {EVENTS.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {ev?.match &&
                    (matchRefs ? (
                      <label>
                        Какая
                        <select value={String(t.match[ev.match] ?? '')} onChange={(e) => set(t.id, { match: e.target.value ? { [ev.match!]: e.target.value } : {} })}>
                          <option value="">любая</option>
                          {matchRefs.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        {ev.match === 'group' ? 'Группа' : 'Переменная'}
                        <input value={String(t.match[ev.match] ?? '')} onChange={(e) => set(t.id, { match: e.target.value ? { [ev.match!]: e.target.value } : {} })} />
                      </label>
                    ))}
                  <label>
                    Если
                    <input className="is-expr" placeholder="token.side == 'party'" value={t.condition ?? ''} onChange={(e) => set(t.id, { condition: e.target.value || null })} />
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={t.once} onChange={(e) => set(t.id, { once: e.target.checked })} /> только один раз
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={t.enabled} onChange={(e) => set(t.id, { enabled: e.target.checked })} /> включён
                  </label>
                  <p className="me-say">Сделать:</p>
                  <BlockList value={t.actions} onChange={(actions: SceneAction[]) => set(t.id, { actions })} refs={refs} />
                  <span className="me-row">
                    {onFire && (
                      <button type="button" className="me-ghost" onClick={() => onFire(t.id)} title="Запустить сейчас (на сохранённой карте)">
                        <Play aria-hidden="true" /> Запустить
                      </button>
                    )}
                    <button type="button" className="me-del" onClick={() => onChange(list.filter((x) => x.id !== t.id))}>
                      <Trash2 aria-hidden="true" /> Удалить
                    </button>
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="me-ghost"
        onClick={() => {
          const t: MapTrigger = { id: uid('tr'), name: 'Новый триггер', enabled: true, event: 'token_enters_zone', match: {}, condition: null, actions: [], once: false, cooldown_rounds: 0 }
          onChange([...list, t])
          setOpen(t.id)
        }}
      >
        <Plus aria-hidden="true" /> Триггер
      </button>
    </section>
  )
}
