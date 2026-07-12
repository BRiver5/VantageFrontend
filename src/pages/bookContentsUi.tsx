import { Link } from 'react-router-dom'
import { displayName } from '../api'
import type { BookContents } from '../api'
import { CONTENT_SECTIONS } from '../contentSections'

function entryHref(base: string | undefined, entry: Record<string, unknown>): string | null {
  const id = entry.id as string | undefined
  if (!base || !id) return null
  return `${base}/${id}`
}

/** Раскрывающиеся разделы содержимого книги/сеттинга — каждая запись кнопкой-ссылкой */
export function TomeSections({ contents }: { contents: BookContents }) {
  return (
    <div className="book-sections">
      {CONTENT_SECTIONS.map((section) => {
        const { key, label, icon: Icon } = section
        const base = 'base' in section ? section.base : undefined
        const list = contents[key] ?? []
        if (list.length === 0) return null
        return (
          <details key={key} id={`tome-${key}`} className="tome-section" open={list.length <= 30}>
            <summary>
              <Icon aria-hidden="true" />
              <span className="tome-section-name">{label}</span>
              <b className="loot-num">{list.length}</b>
            </summary>
            <div className="tome-entries">
              {list.map((entry, i) => {
                const href = entryHref(base, entry)
                const name = displayName(entry)
                return href ? (
                  <Link key={String(entry.id)} className="tome-entry tome-entry--link tome-entry--btn" to={href}>
                    {name}
                  </Link>
                ) : (
                  <span key={String(entry.id ?? i)} className="tome-entry">{name}</span>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
