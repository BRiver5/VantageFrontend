import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, X } from 'lucide-react'
import { type SortOption, flipSort, parseSort } from './config'
import { useKeybinding } from '../../input/useKeybinding'

/** Кнопка с текущей сортировкой: на компьютере — выпадающий список, на телефоне — нижняя шторка. Рядом — обратный порядок. */
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
  const { key: selected, reverse } = parseSort(value)
  const current = sorts.find((s) => s.key === selected)
  const currentLabel = (reverse && current?.reverseLabel) || current?.label

  const ref = useRef<HTMLDivElement>(null)

  useKeybinding('dialog.close', () => setOpen(false), open)

  // на компьютере меню выпадающее — закрывается кликом мимо (на телефоне есть затемнение)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (key: string) => {
    // повторный выбор той же сортировки порядок не сбрасывает
    if (key !== selected) onChange(key)
    setOpen(false)
  }
  const options = [{ key: 'none', label: 'Без сортировки', icon: X }, ...sorts]

  return (
    <div className="sort-menu" ref={ref}>
      <button
        type="button"
        className={`ct-btn sort-menu-btn${current ? ' has-active' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowUpDown aria-hidden="true" />
        <span className="sort-menu-label">{currentLabel ?? 'Сортировка'}</span>
        <ChevronDown className="ct-btn-caret" aria-hidden="true" />
      </button>
      {current && (
        <button
          type="button"
          className={`ct-btn sort-dir-btn${reverse ? ' has-active' : ''}`}
          aria-label="Обратный порядок"
          aria-pressed={reverse}
          title={reverse ? 'Вернуть прямой порядок' : 'Обратный порядок'}
          onClick={() => onChange(flipSort(value))}
        >
          {reverse ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
        </button>
      )}
      {open && (
        <>
          <button type="button" className="sort-sheet-scrim" aria-label="Закрыть" onClick={() => setOpen(false)} />
          <div className="sort-sheet" role="dialog" aria-label="Сортировка">
            <p className="sort-sheet-title">Сортировка</p>
            {options.map(({ key, label, icon: Icon }) => (
              <button
                type="button"
                key={key}
                className={`sort-sheet-row${selected === key ? ' is-on' : ''}`}
                aria-pressed={selected === key}
                onClick={() => choose(key)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {selected === key && <Check aria-hidden="true" className="sort-sheet-check" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
