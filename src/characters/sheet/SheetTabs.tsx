import { BellRing } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { countLabel } from '../../lib/plural'
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
            // выборы из плашки «Требует решения» (навыки, заклинания черт, ASI…)
            <em className="is-alert" title={`${countLabel(alert, ['выбор ждёт', 'выбора ждут', 'выборов ждут'])} решения — плашка «Требует решения» над листом`}>
              <BellRing aria-hidden="true" />
              {alert}
            </em>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
