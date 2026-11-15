import { Eye, FileText, Pin } from 'lucide-react'
import type { ScreenNote } from '../../types/rooms'
import { iconOf } from './tree'

/** Строка страницы вне директории (закреплённые); дерево папок — src/ui/directory */
export function PageRow({ n, current, onOpen }: { n: ScreenNote; current: boolean; onOpen: () => void }) {
  const icon = iconOf(n)
  return (
    <button
      type="button"
      className={`kb-row${current ? ' is-on' : ''}`}
      onClick={onOpen}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-kb-page', n.id)
        // в текст страницы падает ссылка [[…]]
        e.dataTransfer.setData('text/plain', `[[${n.title}]]`)
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
    >
      <span className="kb-row-icon">{icon ?? <FileText aria-hidden="true" />}</span>
      <span className="kb-row-title">{n.title || 'Без названия'}</span>
      {n.shared && <Eye className="kb-row-mark" aria-label="видят игроки" />}
      {n.pinned && <Pin className="kb-row-mark" aria-label="закреплена" />}
    </button>
  )
}
