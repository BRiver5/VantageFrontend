import type { LucideIcon } from 'lucide-react'
import type { SheetTab } from '../CharacterSheet'

export type TabRow = { id: SheetTab; label: string; icon: LucideIcon; badge?: number; alert?: number }

/** Корешки страниц сохранённого листа */
export function SheetTabs({ rows, current, onTab }: { rows: TabRow[]; current: SheetTab; onTab: (tab: SheetTab) => void }) {
  return (
    <nav className="cw-tabs" role="tablist" aria-label="Страницы листа">
      {rows.map(({ id, label, icon: Icon, badge, alert }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={current === id}
          className={`cw-tab${current === id ? ' is-on' : ''}`}
          onClick={() => onTab(id)}
        >
          <Icon aria-hidden="true" /> {label}
          {badge ? <em>{badge}</em> : null}
          {alert ? (
            <em className="is-alert" title="Нерешённые выборы">
              !{alert}
            </em>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
