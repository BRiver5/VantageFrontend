/** Свойства жетона */
import { Trash2 } from 'lucide-react'
import type { MapToken } from '../types'

export function TokenProps({ token, setToken, remove }: { token: MapToken; setToken: (patch: Partial<MapToken>) => void; remove: (id: string) => void }) {
  return (
    <section>
      <h3>{token.label || 'Жетон'}</h3>
      <label>
        Подпись
        <input value={token.label} onChange={(e) => setToken({ label: e.target.value })} />
      </label>
      <label>
        Размер, клеток
        <select value={token.size} onChange={(e) => setToken({ size: Number(e.target.value) })}>
          {[0.5, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Высота, фт
        <input type="number" step={5} value={token.elevation_ft} onChange={(e) => setToken({ elevation_ft: Number(e.target.value) || 0 })} />
      </label>
      <label>
        Сторона
        <select value={token.side ?? 'neutral'} onChange={(e) => setToken({ side: e.target.value as MapToken['side'] })}>
          <option value="party">отряд</option>
          <option value="enemies">враги</option>
          <option value="neutral">нейтралы</option>
        </select>
      </label>
      <label>
        Группа
        <input value={token.group ?? ''} placeholder="засада, стража…" onChange={(e) => setToken({ group: e.target.value || null })} />
      </label>
      <label className="me-check">
        <input type="checkbox" checked={token.hidden} onChange={(e) => setToken({ hidden: e.target.checked })} /> скрыт от игроков
      </label>
      <label className="me-check">
        <input type="checkbox" checked={!!token.dormant} onChange={(e) => setToken({ dormant: e.target.checked })} /> спит (проснётся по сценарию)
      </label>
      <label className="me-check">
        <input type="checkbox" checked={token.flying} onChange={(e) => setToken({ flying: e.target.checked })} /> летает
      </label>
      <button type="button" className="me-del" onClick={() => remove(token.id)}>
        <Trash2 aria-hidden="true" /> Убрать с карты
      </button>
    </section>
  )
}
