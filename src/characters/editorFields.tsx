/**
 * Поля окна «Правка листа»: плотные, как в редакторах для тех, кто знает
 * правила. Число со степпером, «авто / вручную» для производных значений,
 * сегменты, переключатели, списки-чипы и поиск по каталогу.
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Minus, Plus, Search, Wand2, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Раздел окна: значок, заголовок, подсказка и действия справа */
export function EdSection({
  id,
  icon: Icon,
  title,
  lead,
  actions,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  lead?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="ed-sec" id={`ed-${id}`} data-section={id}>
      <header className="ed-sec-head">
        <span className="ed-sec-ico">
          <Icon aria-hidden="true" />
        </span>
        <span className="ed-sec-titles">
          <h4>{title}</h4>
          {lead && <p>{lead}</p>}
        </span>
        {actions && <span className="ed-sec-actions">{actions}</span>}
      </header>
      <div className="ed-sec-body">{children}</div>
    </section>
  )
}

/** Подпись поля сверху и подсказка справа от неё */
export function EdField({
  label,
  hint,
  wide,
  className = '',
  as: Tag = 'div',
  children,
}: {
  label: string
  hint?: ReactNode
  wide?: boolean
  className?: string
  /** label — только для одиночного поля ввода: клик по подписи ставит в него курсор */
  as?: 'div' | 'label'
  children: ReactNode
}) {
  return (
    <Tag className={`ed-field${wide ? ' is-wide' : ''} ${className}`}>
      <span className="ed-label">
        {label}
        {hint != null && <em>{hint}</em>}
      </span>
      {children}
    </Tag>
  )
}

export function Stepper({
  value,
  onChange,
  min = -99,
  max = 999,
  disabled,
  sign,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  disabled?: boolean
  /** показывать знак: +3 / −1 */
  sign?: boolean
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <span className={`ed-step${disabled ? ' is-off' : ''}`}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={disabled || value <= min} aria-label="Меньше" tabIndex={-1}>
        <Minus aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? (sign ? signed(value) : String(value))}
        disabled={disabled}
        onFocus={(e) => {
          setDraft(String(value))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = parseInt(e.target.value.replace('−', '-'), 10)
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(clamp(value + 1))
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(clamp(value - 1))
          }
        }}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={disabled || value >= max} aria-label="Больше" tabIndex={-1}>
        <Plus aria-hidden="true" />
      </button>
    </span>
  )
}

export function NumField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  sign,
}: {
  label: string
  hint?: ReactNode
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  sign?: boolean
}) {
  return (
    <EdField label={label} hint={hint}>
      <Stepper value={value} onChange={onChange} min={min} max={max} sign={sign} />
    </EdField>
  )
}

/**
 * Производное число: «авто» — считается по правилам и показывается как есть,
 * «вручную» — степпер со своим значением.
 */
export function AutoNum({
  label,
  auto,
  computed,
  value,
  onAuto,
  onChange,
  min,
  max,
  sign,
  note,
}: {
  label: string
  auto: boolean
  /** значение по правилам; null — посчитать нельзя (нет снаряжения и т.п.) */
  computed: number | null
  value: number
  onAuto: (auto: boolean) => void
  onChange: (v: number) => void
  min?: number
  max?: number
  sign?: boolean
  note?: string
}) {
  const canAuto = computed != null
  const on = auto && canAuto
  return (
    <div className={`ed-field ed-auto${on ? ' is-auto' : ''}`}>
      <span className="ed-label">
        {label}
        <button
          type="button"
          className={`ed-auto-tag${on ? ' is-on' : ''}`}
          onClick={() => onAuto(!on)}
          disabled={!canAuto}
          title={canAuto ? (on ? 'Считается по правилам — нажмите, чтобы вписать вручную' : `Вернуть расчёт по правилам (${sign ? signed(computed!) : computed})`) : 'Посчитать по правилам нельзя'}
        >
          <Wand2 aria-hidden="true" /> {on ? 'авто' : 'вручную'}
        </button>
      </span>
      <Stepper value={on ? computed! : value} onChange={onChange} min={min} max={max} sign={sign} disabled={on} />
      {note && <span className="ed-note">{note}</span>}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  wide,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  wide?: boolean
  hint?: ReactNode
}) {
  return (
    <EdField label={label} wide={wide} hint={hint} as="label">
      <input className="ed-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </EdField>
  )
}

export function AreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <EdField label={label} wide as="label">
      <textarea className="ed-input ed-area" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </EdField>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: ReactNode; title?: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <span className={`ed-seg ed-seg--${size}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

export function Toggle({ on, onChange, label, title }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`ed-toggle${on ? ' is-on' : ''}`} onClick={() => onChange(!on)} title={title}>
      <span className="ed-toggle-track" aria-hidden="true">
        <span />
      </span>
      {label && <span className="ed-toggle-label">{label}</span>}
    </button>
  )
}

/** Список строк чипами: × убирает, Enter или запятая добавляет */
export function ChipList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const parts = text
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !items.some((i) => i.toLocaleLowerCase('ru') === p.toLocaleLowerCase('ru')))
    if (parts.length) onChange([...items, ...parts])
    setText('')
  }
  return (
    <div className="ed-chips">
      {items.map((it) => (
        <span key={it} className="ed-chip">
          {it}
          <button type="button" onClick={() => onChange(items.filter((x) => x !== it))} aria-label={`Убрать «${it}»`}>
            <X aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        className="ed-chip-input"
        value={text}
        placeholder={placeholder ?? 'добавить…'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !text && items.length) {
            onChange(items.slice(0, -1))
          }
        }}
        onBlur={add}
      />
    </div>
  )
}

/** Поиск по каталогу с выпадающим списком; выбранное уходит в onPick */
export function CatalogSearch<T>({
  items,
  label,
  sub,
  onPick,
  placeholder,
  exclude,
}: {
  items: T[]
  label: (x: T) => string
  sub?: (x: T) => string
  onPick: (x: T) => void
  placeholder: string
  /** уже добавленные — по названию */
  exclude?: Set<string>
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const listId = useId()
  const found = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')
    if (!needle) return []
    return items
      .filter((x) => {
        const name = label(x).toLocaleLowerCase('ru').replace(/ё/g, 'е')
        return name.includes(needle) && !exclude?.has(label(x))
      })
      .slice(0, 10)
  }, [q, items, label, exclude])

  return (
    <div className="ed-search">
      <span className="ed-search-box">
        <Search aria-hidden="true" />
        <input
          className="ed-input"
          value={q}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && found.length > 0}
          aria-controls={listId}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && found[0]) {
              e.preventDefault()
              onPick(found[0])
              setQ('')
            }
          }}
        />
      </span>
      {open && found.length > 0 && (
        <ul className="ed-search-list" id={listId} role="listbox">
          {found.map((x) => (
            <li key={label(x)}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(x)
                  setQ('')
                }}
              >
                <b>{label(x)}</b>
                {sub && <i>{sub(x)}</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
