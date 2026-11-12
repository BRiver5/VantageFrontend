import { useState } from 'react'
import type { BattleMap } from '../types'

export function GridFields({ grid, onChange }: { grid: BattleMap['grid']; onChange: (g: BattleMap['grid']) => void }) {
  const [g, setG] = useState(grid)
  const [seen, setSeen] = useState(grid)
  if (seen !== grid) {
    setSeen(grid)
    setG(grid)
  }
  const field = (key: 'cell_px' | 'feet_per_cell' | 'cols' | 'rows' | 'offset_x' | 'offset_y', label: string, min = 0) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={g[key]}
        onChange={(e) => setG({ ...g, [key]: Number(e.target.value) || 0 })}
        onBlur={() => JSON.stringify(g) !== JSON.stringify(grid) && g.cell_px >= 10 && onChange(g)}
      />
    </label>
  )
  return (
    <div className="me-grid">
      {field('cell_px', 'Клетка, px', 10)}
      {field('feet_per_cell', 'Футов в клетке', 1)}
      {field('cols', 'Столбцов', 1)}
      {field('rows', 'Строк', 1)}
      {field('offset_x', 'Сдвиг X')}
      {field('offset_y', 'Сдвиг Y')}
    </div>
  )
}

