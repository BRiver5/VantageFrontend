import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Итог создания на телефоне: разделы вместо длинной ленты */
export function ReviewTabs({
  tabs,
  current,
  onSelect,
}: {
  tabs: { id: string; label: string; icon: LucideIcon; body: ReactNode }[]
  current: { id: string; body: ReactNode }
  onSelect: (id: string) => void
}) {
  return (
    <>
      <nav className="cw-rtabs" aria-label="Разделы листа">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={current.id === id ? 'is-on' : ''} aria-pressed={current.id === id} onClick={() => onSelect(id)}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div key={current.id} className="cw-rpane">
        {current.body}
      </div>
    </>
  )
}
