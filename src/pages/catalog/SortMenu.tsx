import { useState } from 'react'
import {
  ArrowUpDown,
  Check,
  X,
} from 'lucide-react'
import { type SortOption } from './config'
import { useKeybinding } from '../../input/useKeybinding'

/** Телефон: кнопка с текущей сортировкой и нижняя шторка выбора */
export function SortMenu<T>({
  sorts,
  value,
  onChange,
}: {
  sorts: SortOption<T>[]
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = sorts.find((s) => s.key === value)

  useKeybinding('dialog.close', () => setOpen(false), open)

  const choose = (key: string) => {
    onChange(key)
    setOpen(false)
  }
  const options = [{ key: 'none', label: 'Без сортировки', icon: X }, ...sorts]

  return (
    <div className="sort-menu">
      <button
        type="button"
        className={`sort-btn sort-menu-btn${current ? ' is-active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ArrowUpDown aria-hidden="true" />
        {current?.label ?? 'Сортировка'}
      </button>
      {open && (
        <>
          <button type="button" className="sort-sheet-scrim" aria-label="Закрыть" onClick={() => setOpen(false)} />
          <div className="sort-sheet" role="dialog" aria-label="Сортировка">
            <p className="sort-sheet-title">Сортировка</p>
            {options.map(({ key, label, icon: Icon }) => (
              <button
                type="button"
                key={key}
                className={`sort-sheet-row${value === key ? ' is-on' : ''}`}
                aria-pressed={value === key}
                onClick={() => choose(key)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {value === key && <Check aria-hidden="true" className="sort-sheet-check" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
