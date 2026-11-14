/** Поиск по каталогу для базы знаний: выбрать существо для НИП, товар для лавки, карточку для вставки */
import { useEffect, useState, type DragEvent } from 'react'
import { Search } from 'lucide-react'
import { searchCatalog } from '../../api/catalog'
import type { SearchHit } from '../../api/types'

export function CatalogPicker({
  entities,
  onPick,
  dragText,
  placeholder = 'Найти в каталоге…',
  autoFocus,
}: {
  entities: string[]
  onPick: (hit: SearchHit) => void
  /** есть — строку можно перетащить в текст страницы */
  dragText?: (hit: SearchHit) => string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const key = entities.join(',')
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setState('busy')
      searchCatalog(query, { entities: key.split(','), limit: 12, signal: ctrl.signal }).then(
        (r) => {
          setHits(r.items)
          setState('idle')
        },
        () => !ctrl.signal.aborted && setState('error'),
      )
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, key])
  const shown = q.trim().length < 2 ? [] : hits
  const drag = (hit: SearchHit) => (e: DragEvent) => {
    if (!dragText) return
    e.dataTransfer.setData('text/plain', dragText(hit))
    e.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <div className="kb-picker">
      <label className="kb-search">
        <Search aria-hidden="true" />
        <input type="search" value={q} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} />
      </label>
      {state === 'error' && <p className="tb-err">Каталог не ответил</p>}
      {shown.length > 0 && (
        <ul className="kb-picker-list">
          {shown.map((h) => (
            <li key={`${h.entity}:${h.id}`}>
              <button type="button" draggable={!!dragText} onDragStart={drag(h)} onClick={() => onPick(h)} title={dragText ? 'Нажмите или перетащите в текст' : undefined}>
                <b>{h.title}</b>
                <i>{h.entity_title}</i>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && state === 'idle' && shown.length === 0 && <p className="kb-hint">Ничего не нашли</p>}
    </div>
  )
}
