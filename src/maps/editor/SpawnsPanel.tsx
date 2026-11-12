/** Циклы появления (подкрепления) */
import { Plus, Trash2 } from 'lucide-react'
import type { BattleMap, SpawnCycle } from '../types'
import { uid } from './batch'

export function SpawnsPanel({ map, creatures, onChange }: { map: BattleMap; creatures: { ref: string; name: string }[]; onChange: (list: SpawnCycle[]) => void }) {
  const list = map.spawns ?? []
  const set = (id: string, patch: Partial<SpawnCycle>) => onChange(list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  return (
    <section>
      <h3>Подкрепления</h3>
      {list.map((s) => (
        <div key={s.id} className="me-spawn">
          <p className="me-say">
            Каждые
            <input type="number" min={1} value={s.every_rounds} onChange={(e) => set(s.id, { every_rounds: Number(e.target.value) || 1 })} />
            раунда с
            <input type="number" min={1} value={s.start_round} onChange={(e) => set(s.id, { start_round: Number(e.target.value) || 1 })} />
            -го —
            <input type="number" min={1} value={s.count} onChange={(e) => set(s.id, { count: Number(e.target.value) || 1 })} />
            шт., не больше
            <input type="number" min={1} value={s.max_total} onChange={(e) => set(s.id, { max_total: Number(e.target.value) || 1 })} />
          </p>
          <label>
            Кто
            <select value={s.creature.catalog_ref ?? ''} onChange={(e) => set(s.id, { creature: { catalog_ref: e.target.value || null, name: creatures.find((c) => c.ref === e.target.value)?.name ?? null } })}>
              <option value="">—</option>
              {creatures.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Где
            <select value={s.at.zone_id ?? ''} onChange={(e) => set(s.id, { at: { zone_id: e.target.value || null } })}>
              <option value="">—</option>
              {map.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name || 'зона'}
                </option>
              ))}
            </select>
          </label>
          <span className="me-row">
            <label className="me-check">
              <input type="checkbox" checked={s.enabled} onChange={(e) => set(s.id, { enabled: e.target.checked })} /> включено
            </label>
            <button type="button" className="me-del" onClick={() => onChange(list.filter((x) => x.id !== s.id))}>
              <Trash2 aria-hidden="true" />
            </button>
          </span>
        </div>
      ))}
      <button
        type="button"
        className="me-ghost"
        disabled={map.zones.length === 0}
        title={map.zones.length === 0 ? 'Сначала нарисуйте зону появления' : undefined}
        onClick={() => onChange([...list, { id: uid('sp'), name: 'Подкрепление', enabled: true, start_round: 2, every_rounds: 2, max_total: 4, count: 1, creature: {}, at: { zone_id: map.zones[0]?.id ?? null }, side: 'enemies' }])}
      >
        <Plus aria-hidden="true" /> Подкрепление
      </button>
    </section>
  )
}
