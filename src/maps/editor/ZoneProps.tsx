/** Свойства зоны: шаблоны, частота, сценарии входа, хода и выхода */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BlockList } from '../blocks'
import type { BattleMap, MapZone } from '../types'
import { useRefs } from './useRefs'
import { ZONE_TEMPLATES } from './zoneTemplates'

const ZONE_TABS: { key: 'on_enter' | 'on_start_turn' | 'on_end_turn' | 'on_leave'; label: string }[] = [
  { key: 'on_enter', label: 'Вход' },
  { key: 'on_start_turn', label: 'Начало хода' },
  { key: 'on_end_turn', label: 'Конец хода' },
  { key: 'on_leave', label: 'Выход' },
]

export function ZoneProps({ zone, map, onChange, onRemove }: { zone: MapZone; map: BattleMap; onChange: (z: Partial<MapZone>) => void; onRemove: () => void }) {
  const refs = useRefs(map)
  const [tab, setTab] = useState<(typeof ZONE_TABS)[number]['key']>('on_enter')
  const zonePresets = (refs.preset ?? []).filter((p) => /^(zone|aura)\./.test(p.id))
  return (
    <section>
      <h3>Зона</h3>
      <label>
        Название
        <input value={zone.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <div className="me-chips">
        {ZONE_TEMPLATES.map((t) => (
          <button key={t.label} type="button" onClick={() => onChange(t.patch)}>
            {t.label}
          </button>
        ))}
      </div>
      <label>
        Эффект
        <select value={zone.vfx_preset ?? ''} onChange={(e) => onChange({ vfx_preset: e.target.value || null })}>
          <option value="">без эффекта</option>
          {zonePresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Срабатывает
        <select value={zone.frequency ?? 'every_time'} onChange={(e) => onChange({ frequency: e.target.value as MapZone['frequency'] })}>
          <option value="every_time">каждый раз</option>
          <option value="once_per_turn">раз за ход</option>
          <option value="once_per_creature">раз на существо</option>
          <option value="once">один раз</option>
        </select>
      </label>
      <label>
        На кого
        <select value={zone.affects ?? 'all'} onChange={(e) => onChange({ affects: e.target.value as MapZone['affects'] })}>
          <option value="all">на всех</option>
          <option value="party">на отряд</option>
          <option value="enemies">на врагов</option>
        </select>
      </label>
      <label>
        Заслоняет обзор
        <select value={zone.obscured ?? 'none'} onChange={(e) => onChange({ obscured: e.target.value as MapZone['obscured'] })}>
          <option value="none">нет</option>
          <option value="lightly">слегка</option>
          <option value="heavily">сильно</option>
        </select>
      </label>
      <label>
        Раундов
        <input type="number" min={0} placeholder="∞" value={zone.duration_rounds ?? ''} onChange={(e) => onChange({ duration_rounds: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="me-check">
        <input type="checkbox" checked={!!zone.difficult_terrain} onChange={(e) => onChange({ difficult_terrain: e.target.checked })} /> сложная местность
      </label>
      <label className="me-check" title="Навес, пещера: дождь и снег сюда не падают">
        <input type="checkbox" checked={!!zone.no_weather} onChange={(e) => onChange({ no_weather: e.target.checked })} /> без погоды
      </label>
      <label className="me-check">
        <input type="checkbox" checked={zone.visible_to_players} onChange={(e) => onChange({ visible_to_players: e.target.checked })} /> видна игрокам
      </label>
      <label className="me-check">
        <input type="checkbox" checked={zone.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> включена
      </label>
      <nav className="me-tabs">
        {ZONE_TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'is-on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {(zone[t.key]?.length ?? 0) > 0 && <i>{zone[t.key]!.length}</i>}
          </button>
        ))}
      </nav>
      <BlockList key={tab} value={zone[tab] ?? []} onChange={(v) => onChange({ [tab]: v })} refs={refs} />
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Удалить зону
      </button>
    </section>
  )
}
