/**
 * Выпадающий список в стиле сайта: кнопка-шестигранник (как сортировка
 * каталога) и меню в тёмной панели с золотой отметкой. Замена системному
 * <select>, у которого не перекрасить список. Клавиатура: ↑ ↓ Enter Esc.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface HexOption {
  value: string
  label: string
}

export function HexSelect({
  value,
  options,
  onChange,
  icon,
  label,
  defaultValue = '',
}: {
  value: string
  options: HexOption[]
  onChange: (v: string) => void
  icon?: ReactNode
  /** подпись для чтения с экрана */
  label: string
  /** значение «ничего не выбрано»: кнопка не подсвечивается */
  defaultValue?: string
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const cur = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    setHi(Math.max(0, options.findIndex((o) => o.value === value)))
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, options, value])
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    }
    if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      choose(options[hi].value)
    }
  }

  return (
    <div className={`hex-select${open ? ' is-open' : ''}`} ref={root} onKeyDown={onKey}>
      <button
        type="button"
        className={`sort-btn hex-select-btn${value !== defaultValue ? ' is-active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${cur?.label ?? ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span className="hex-select-cur">{cur?.label}</span>
        <ChevronDown className="hex-select-chev" aria-hidden="true" />
      </button>
      {open && (
        <ul className="hex-select-menu" role="listbox" id={id} ref={list} aria-label={label} aria-activedescendant={`${id}-${hi}`}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              className={`${o.value === value ? 'is-on' : ''}${i === hi ? ' is-hi' : ''}`}
              onPointerEnter={() => setHi(i)}
              onClick={() => choose(o.value)}
            >
              <Check aria-hidden="true" />
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
