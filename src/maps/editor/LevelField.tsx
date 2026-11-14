/** Конструктор: на каком этаже вещь («на всех этажах» — без level_id), у зоны — лестница на другой этаж */
import { sortedLevels } from '../levels'
import type { MapLevel } from '../types'

export function LevelField({ levels, value, onChange, stairs, onStairs }: { levels: MapLevel[]; value: string | null | undefined; onChange: (id: string | null) => void; stairs?: string | null; onStairs?: (id: string | null) => void }) {
  if (!levels.length) return null
  const list = sortedLevels(levels).reverse()
  return (
    <section>
      <label>
        Этаж
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">на всех этажах</option>
          {list.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name || 'Этаж'}
            </option>
          ))}
        </select>
      </label>
      {onStairs && (
        <label title="Жетон, вошедший в зону, встаёт на пол выбранного этажа">
          Лестница на этаж
          <select value={stairs ?? ''} onChange={(e) => onStairs(e.target.value || null)}>
            <option value="">нет</option>
            {list.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || 'Этаж'}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}
