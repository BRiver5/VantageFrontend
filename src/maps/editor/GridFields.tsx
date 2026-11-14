import { useState } from 'react'
import { isHex, normalizeKind } from '../hex'
import type { BattleMap, GridKind } from '../types'

const KINDS: [GridKind, string][] = [
  ['square', 'Квадраты'],
  ['hex_rows_odd', 'Шестиугольники рядами, сдвиг нечётных'],
  ['hex_rows_even', 'Шестиугольники рядами, сдвиг чётных'],
  ['hex_cols_odd', 'Шестиугольники столбцами, сдвиг нечётных'],
  ['hex_cols_even', 'Шестиугольники столбцами, сдвиг чётных'],
]

export function GridFields({ grid, onChange }: { grid: BattleMap['grid']; onChange: (g: BattleMap['grid']) => void }) {
  const [g, setG] = useState(grid)
  const [seen, setSeen] = useState(grid)
  if (seen !== grid) {
    setSeen(grid)
    setG(grid)
  }
  const hex = isHex(g)
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
  const commit = (patch: Partial<BattleMap['grid']>) => {
    const next = { ...g, ...patch }
    setG(next)
    if (next.cell_px >= 10) onChange(next)
  }
  return (
    <div className="me-grid">
      <label>
        Сетка
        <select value={normalizeKind(g.kind)} onChange={(e) => commit({ kind: e.target.value as GridKind })}>
          {KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {field('cell_px', hex ? 'Между центрами клеток, px' : 'Клетка, px', 10)}
      {field('feet_per_cell', 'Футов в клетке', 1)}
      {field('cols', 'Столбцов', 1)}
      {field('rows', 'Строк', 1)}
      {field('offset_x', 'Сдвиг X')}
      {field('offset_y', 'Сдвиг Y')}
      {!hex && (
        <label>
          Диагональ
          <select value={g.diagonal} onChange={(e) => commit({ diagonal: e.target.value as BattleMap['grid']['diagonal'] })}>
            <option value="5">Всегда 5 футов</option>
            <option value="5-10">Чередование 5 и 10 футов</option>
          </select>
        </label>
      )}
      <label>
        Область задевает клетку
        <select value={g.area_rule} onChange={(e) => commit({ area_rule: e.target.value as BattleMap['grid']['area_rule'] })}>
          <option value="touch">Хоть немного</option>
          <option value="center">Центром</option>
        </select>
      </label>
    </div>
  )
}
