/** Свойства предмета на карте */
import { Trash2 } from 'lucide-react'
import type { BattleMap, MapItem } from '../types'

export function ItemProps({ item, map, onChange, onRemove }: { item: MapItem; map: BattleMap; onChange: (i: Partial<MapItem>) => void; onRemove: () => void }) {
  const boxes = map.objects.filter((o) => o.container)
  return (
    <section>
      <h3>Предмет на карте</h3>
      <label>
        Название
        <input value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {boxes.length > 0 && (
        <label>
          Лежит в
          <select value={item.container_object_id ?? ''} onChange={(e) => onChange({ container_object_id: e.target.value || null })}>
            <option value="">на полу</option>
            {boxes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name || 'контейнер'}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="me-check">
        <input type="checkbox" checked={!!item.hidden} onChange={(e) => onChange({ hidden: e.target.checked })} /> спрятан
      </label>
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Убрать
      </button>
    </section>
  )
}
