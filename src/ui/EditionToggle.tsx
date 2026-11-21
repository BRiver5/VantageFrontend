/**
 * Переключатель редакции правил 2014 ⇄ 2024: вытянутый шестигранник-дорожка и
 * гранёный шестигранник-камень внутри. При переключении камень перекатывается
 * на другую сторону — едет и поворачивается на 120°, как катящийся гекс
 * (грани чередуются через 60°, поэтому в конце он выглядит так же, как в
 * начале). Вправо — 2024 (золото), влево — 2014 (серебро).
 *
 * Доступность: role="switch", aria-checked (вкл. = 2024), Space/Enter,
 * стрелки ←/→ и Home/End. Выключенный остаётся в фокусе (aria-disabled),
 * чтобы подсказка с причиной была видна и с клавиатуры.
 * Движение — только CSS; при «меньше движения» камень не катится.
 */
import type { KeyboardEvent, MouseEvent } from 'react'
import { editionLabel, type Edition } from '../editions/edition'

export type EditionToggleSize = 'normal' | 'compact'

export function EditionToggle({
  value,
  onChange,
  size = 'normal',
  labels = 'both',
  disabled = false,
  reason,
  busy = false,
  className,
  title,
  id,
}: {
  value: Edition
  onChange: (next: Edition) => void
  /** normal — главное меню; compact — шапки разделов и записей */
  size?: EditionToggleSize
  /** подписи по бокам: обе, только текущая (после дорожки) или без них */
  labels?: 'both' | 'active' | 'none'
  disabled?: boolean
  /** почему выключен — в подсказке и для чтения с экрана */
  reason?: string | null
  /** ещё выясняем, что доступно */
  busy?: boolean
  className?: string
  /** подсказка вместо «Редакция правил: 2024» */
  title?: string
  id?: string
}) {
  const on = value === '2024'
  const label = editionLabel(value)
  const tip = disabled && reason ? `${label}. ${reason}` : (title ?? label)

  const set = (next: Edition) => {
    if (disabled || busy || next === value) return
    onChange(next)
  }

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    set(on ? '2014' : '2024')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const to: Edition | null =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Home'
        ? '2014'
        : e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'End'
          ? '2024'
          : null
    if (!to) return
    e.preventDefault()
    set(to)
  }

  const cls = ['ed-toggle', `ed-toggle--${size}`, labels !== 'both' && `ed-toggle--labels-${labels}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      aria-description={disabled && reason ? reason : undefined}
      title={tip}
      className={cls}
      data-edition={value}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {labels === 'both' && (
        <span className={`ed-toggle-year${on ? '' : ' is-current'}`} aria-hidden="true">
          2014
        </span>
      )}
      <span className="ed-toggle-track" aria-hidden="true">
        <span className="ed-toggle-knob">
          <span className="ed-toggle-gem" />
        </span>
      </span>
      {labels === 'both' && (
        <span className={`ed-toggle-year${on ? ' is-current' : ''}`} aria-hidden="true">
          2024
        </span>
      )}
      {labels === 'active' && (
        <span className="ed-toggle-year is-current" aria-hidden="true">
          {value}
        </span>
      )}
    </button>
  )
}
