import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, SlidersHorizontal } from 'lucide-react'
import type {
  BookMap,
} from '../../api'
import { type FilterGroup } from './config'

/** Кнопка «Фильтры» с выпадающим меню. Одна на каталог и на подробный обзор. */
export function FilterMenu<T>({
  groups,
  sel,
  onToggle,
  onReset,
  bookMap,
  items,
  buttonClassName = 'rec-filter-btn quest-filter-btn',
}: {
  groups: FilterGroup<T>[]
  sel: Record<string, string[]>
  onToggle: (groupKey: string, optKey: string) => void
  onReset: () => void
  bookMap: BookMap
  /** полный список раздела — из него берутся варианты вроде «только эти книги» */
  items: T[]
  /** вид кнопки: гекс-плашка по умолчанию, в шапке каталога — своя */
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // закрывается по клику мимо и по Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = Object.values(sel).reduce((n, v) => n + v.length, 0)

  return (
    <div className="quest-filter" ref={ref}>
      <button
        type="button"
        className={`${buttonClassName}${open ? ' is-open' : ''}${count ? ' has-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SlidersHorizontal aria-hidden="true" />
        Фильтры
        {count > 0 && <span className="rec-filter-count">{count}</span>}
      </button>

      {open && (
        <div className="quest-filter-panel qf-panel">
          <div className="qf-head">
            <span>Фильтры{count > 0 && <em>{count}</em>}</span>
            {count > 0 && (
              <button type="button" className="qf-reset" onClick={onReset}>
                Сбросить всё
              </button>
            )}
          </div>
          {groups.map((g) => {
            const opts = g.options(bookMap, items)
            if (opts.length === 0) return null
            const s = sel[g.key] ?? []
            return (
              <div className="qf-group" key={g.key}>
                <span className="qf-label">
                  {g.label}
                  {s.length > 0 && <em>{s.length}</em>}
                </span>
                <div className="qf-opts" role="group" aria-label={g.label}>
                  {opts.map((o) => {
                    const on = s.includes(o.key)
                    return (
                      <button
                        key={o.key}
                        type="button"
                        className={`qf-opt${on ? ' is-on' : ''}`}
                        style={o.color ? ({ '--rarity-dot': o.color } as CSSProperties) : undefined}
                        title={o.hint}
                        aria-pressed={on}
                        onClick={() => onToggle(g.key, o.key)}
                      >
                        {on ? <Check aria-hidden="true" /> : o.color ? <i className="qf-dot" aria-hidden="true" /> : null}
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
