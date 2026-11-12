/** Свойства источника света */
import { Trash2 } from 'lucide-react'
import type { MapLight, MapToken } from '../types'

export function LightProps({ light, setLight, remove, tokens }: { light: MapLight; setLight: (patch: Partial<MapLight>) => void; remove: (id: string) => void; tokens: MapToken[] }) {
  return (
    <section>
      <h3>Свет</h3>
      <label>
        Яркий, фт
        <input type="number" min={0} step={5} value={light.bright_ft} onChange={(e) => setLight({ bright_ft: Number(e.target.value) || 0 })} />
      </label>
      <label>
        Тусклый, ещё фт
        <input type="number" min={0} step={5} value={light.dim_ft} onChange={(e) => setLight({ dim_ft: Number(e.target.value) || 0 })} />
      </label>
      <label>
        Цвет
        <input type="color" value={light.color || '#ffd27a'} onChange={(e) => setLight({ color: e.target.value })} />
      </label>
      <label>
        Едет за жетоном
        <select value={light.attached_to ?? ''} onChange={(e) => setLight({ attached_to: e.target.value || null })}>
          <option value="">нет</option>
          {tokens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="me-check">
        <input type="checkbox" checked={light.flicker} onChange={(e) => setLight({ flicker: e.target.checked })} /> мерцает
      </label>
      <label className="me-check">
        <input type="checkbox" checked={light.enabled} onChange={(e) => setLight({ enabled: e.target.checked })} /> горит
      </label>
      <button type="button" className="me-del" onClick={() => remove(light.id)}>
        <Trash2 aria-hidden="true" /> Удалить
      </button>
    </section>
  )
}
