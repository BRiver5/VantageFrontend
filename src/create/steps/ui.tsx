/** Общие кирпичики шагов визарда: заголовок, карточка выбора, плитка факта. */
import { useState, type ReactNode } from 'react'
import { Check, Image as ImageIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Corners } from '../../ornaments'

export function StepHeader({
  kicker,
  title,
  lead,
}: {
  kicker?: string
  title: string
  lead?: string
}) {
  return (
    <header className="cw-step-head">
      {kicker && <p className="cw-step-kicker">{kicker}</p>}
      <h2 className="cw-step-title gold-text">{title}</h2>
      {lead && <p className="cw-step-lead">{lead}</p>}
    </header>
  )
}

/** Арт сущности каталога с фолбэком на иконку — ссылки на внешние картинки бьются */
export function ChoiceArt({ src, icon: Icon }: { src: string | null; icon: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span className="cw-card-art cw-card-art--empty">
        <Icon aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="cw-card-art">
      <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      <span className="cw-card-art-shade" aria-hidden="true" />
    </span>
  )
}

/** Карточка выбора расы / класса / подкласса / предыстории */
export function ChoiceCard({
  art,
  icon = ImageIcon,
  name,
  meta,
  chips,
  description,
  selected,
  onSelect,
}: {
  art: string | null
  icon?: LucideIcon
  name: string
  meta?: string | null
  chips?: ReactNode
  description?: string | null
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`cw-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <Corners size={18} gold={selected} />
      <ChoiceArt src={art} icon={icon} />
      <span className="cw-card-body">
        <span className="cw-card-name">{name}</span>
        {meta && <span className="cw-card-meta">{meta}</span>}
        {chips && <span className="cw-card-chips">{chips}</span>}
        {description && <span className="cw-card-desc">{description}</span>}
      </span>
      {selected && (
        <span className="cw-card-check" aria-hidden="true">
          <Check />
        </span>
      )}
    </button>
  )
}

/** Маленький жетон-факт: иконка + значение + подпись */
export function FactChip({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <span className="cw-chip">
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Панель с серебряными углами — контейнер содержимого шага */
export function StepPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`cw-panel${className ? ` ${className}` : ''}`}>
      <Corners size={20} />
      {children}
    </div>
  )
}

/** Строка состояния загрузки/ошибки для шагов каталога */
export function StepStatus({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p className="status-line is-error">Архив недоступен: {error}</p>
  if (loading) return <p className="cw-status">Разворачиваем свитки…</p>
  return null
}
