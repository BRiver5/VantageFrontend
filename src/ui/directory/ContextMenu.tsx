/**
 * Меню директории: по правой кнопке, по «⋯» или Shift+F10. Стрелки ходят по
 * пунктам, Escape закрывает и возвращает фокус строке.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuEntry {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  run: () => void
}

export interface MenuSwatch {
  color: string | null
  label: string
  on: boolean
}

export function DirMenu({ x, y, label, entries, swatches, onSwatch, onClose }: { x: number; y: number; label: string; entries: MenuEntry[]; swatches?: MenuSwatch[]; onSwatch?: (color: string | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) })
    el.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [x, y])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const close = () => onClose()
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  const step = (dir: 1 | -1) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled), [role="menuitemradio"]') ?? [])]
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + dir + items.length) % items.length].focus()
  }

  return createPortal(
    <div
      ref={ref}
      className="dir-menu"
      role="menu"
      aria-label={label}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') step(1)
        else if (e.key === 'ArrowUp') step(-1)
        else if (e.key === 'Escape' || e.key === 'Tab') onClose()
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {entries.map((m) => (
        <button
          key={m.id}
          type="button"
          role="menuitem"
          className={m.danger ? 'is-danger' : undefined}
          disabled={m.disabled}
          onClick={() => {
            onClose()
            m.run()
          }}
        >
          <span className="dir-menu-icon" aria-hidden="true">
            {m.icon}
          </span>
          {m.label}
        </button>
      ))}
      {swatches && onSwatch && (
        <div className="dir-menu-swatches" role="group" aria-label="Цвет папки">
          {swatches.map((s) => (
            <button
              key={s.color ?? 'none'}
              type="button"
              role="menuitemradio"
              aria-checked={s.on}
              title={s.label}
              aria-label={s.label}
              className={`dir-swatch${s.color ? '' : ' is-none'}`}
              style={s.color ? { background: s.color } : undefined}
              onClick={() => {
                onClose()
                onSwatch(s.color)
              }}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
