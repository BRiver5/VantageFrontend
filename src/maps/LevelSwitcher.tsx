/**
 * Этажи на столе: мастер переключает видимый этаж («Все» или один), игрок
 * видит название этажа своего жетона (переключается сам, за жетоном).
 */
import { Layers } from 'lucide-react'
import { sortedLevels } from './levels'
import type { MapLevel } from './types'

export function LevelSwitcher({ levels, level, onLevel, className = '' }: { levels: MapLevel[]; level: string | null; onLevel?: (id: string | null) => void; className?: string }) {
  // сверху вниз, как этажи дома
  const list = sortedLevels(levels).reverse()
  const current = list.find((l) => l.id === level)
  if (!onLevel) {
    return current ? (
      <p className={`mp-levels is-readonly ${className}`} title="Этаж вашего жетона">
        <Layers aria-hidden="true" /> {current.name || 'Этаж'}
      </p>
    ) : null
  }
  return (
    <div className={`mp-levels ${className}`} role="radiogroup" aria-label="Этаж">
      <Layers aria-hidden="true" />
      <button type="button" role="radio" aria-checked={level == null} className={level == null ? 'is-on' : ''} onClick={() => onLevel(null)}>
        Все
      </button>
      {list.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className={level === l.id ? 'is-on' : ''} title={`${l.bottom_ft}–${l.top_ft} фт`} onClick={() => onLevel(l.id)}>
          {l.name || 'Этаж'}
        </button>
      ))}
    </div>
  )
}
