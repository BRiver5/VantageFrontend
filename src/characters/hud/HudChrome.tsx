import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Corners } from '../../ornaments'

/* ---------- просьба повернуть экран ---------- */

export function RotateGate({ coarse, text, backTo = '/characters', backLabel = 'К персонажам' }: { coarse: boolean; text?: string; backTo?: string; backLabel?: string }) {
  useEffect(() => {
    document.documentElement.dataset.rotate = '1'
    return () => {
      delete document.documentElement.dataset.rotate
    }
  }, [])
  return (
    <div className="hud-rotate" role="status">
      <svg className="hud-rotate-sigil" viewBox="0 0 200 200" aria-hidden="true">
        <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
        <polygon points="100,22 167,61 167,139 100,178 33,139 33,61" />
        <polygon points="100,6 167,139 33,139" />
        <polygon points="100,194 33,61 167,61" />
      </svg>
      <svg className="hud-rotate-icon" viewBox="0 0 120 120" aria-hidden="true">
        <path className="hud-rotate-arc" d="M28 34 A46 46 0 0 1 92 34" />
        <path className="hud-rotate-arrow" d="M84 24 L93 35 L80 38" />
        <g className="hud-rotate-phone">
          <rect x="42" y="30" width="36" height="66" rx="6" />
          <path d="M54 37 H66" />
          <circle cx="60" cy="88" r="2.4" />
        </g>
      </svg>
      <h2 className="gold-text">{coarse ? 'Поверните устройство' : 'Расширьте окно'}</h2>
      <p>{text ?? 'Лист героя создан для горизонтального экрана — так всё важное видно сразу, без прокрутки.'}</p>
      {coarse && <p className="hud-rotate-hint">Не поворачивается? Проверьте, включён ли автоповорот экрана.</p>}
      <Link to={backTo} className="hud-rotate-back">
        {backLabel}
      </Link>
    </div>
  )
}

/* ---------- мелкие кирпичи ---------- */

/** Круглая кнопка шапки: значок, подпись и счётчик */
export function RoundButton({
  icon: Icon,
  label,
  badge,
  alert,
  on,
  onClick,
}: {
  icon: LucideIcon
  label: string
  badge?: number
  alert?: boolean
  on?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`ghud-round${on ? ' is-on' : ''}${alert ? ' is-alert' : ''}`} onClick={onClick} aria-label={label} aria-expanded={on}>
      <span className="ghud-round-ring">
        <Icon aria-hidden="true" />
        {badge ? <em>{badge}</em> : null}
      </span>
      <i>{label}</i>
    </button>
  )
}

/** Окно поверх экрана: панель справа остаётся, между окнами можно переходить сразу */
export function HudWindow({
  id,
  title,
  icon: Icon,
  aside,
  onClose,
  children,
}: {
  id: string
  title: string
  icon: LucideIcon
  aside?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <section className={`hud-win hud-win--${id}`} role="dialog" aria-label={title}>
      <Corners size={22} gold />
      <header className="hud-win-head">
        <span className="hud-win-sign">
          <Icon aria-hidden="true" />
        </span>
        <h2 className="gold-text">{title}</h2>
        {aside && <span className="hud-win-aside">{aside}</span>}
        <button type="button" className="hud-win-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="hud-win-body">{children}</div>
    </section>
  )
}

/** Разделы окна — вертикальными вкладками слева, вместо длинной прокрутки */
export function HudSplit({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  onChange: (key: string) => void
  children: ReactNode
}) {
  return (
    <div className="hud-split">
      <nav className="hud-split-tabs" aria-label="Разделы">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={active === t.key ? 'is-on' : ''} aria-pressed={active === t.key} onClick={() => onChange(t.key)}>
            <span>{t.label}</span>
            {t.count != null && <em>{t.count}</em>}
          </button>
        ))}
      </nav>
      <div key={active} className="hud-split-pane">
        {children}
      </div>
    </div>
  )
}
