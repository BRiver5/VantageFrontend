import { useState, type DragEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Pin,
} from 'lucide-react'
import type { ScreenNote } from '../../types/rooms'
import { type TreeFolder, countPages, iconOf } from './tree'

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
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span className="kb-row-icon">{icon ?? <FileText aria-hidden="true" />}</span>
      <span className="kb-row-title">{n.title || 'Без названия'}</span>
      {n.shared && <Eye className="kb-row-mark" aria-label="видят игроки" />}
      {n.pinned && <Pin className="kb-row-mark" aria-label="закреплена" />}
    </button>
  )
}

export function FolderNode({ f, depth, current, openFolders, toggle, onOpen, onDrop, onNew }: { f: TreeFolder; depth: number; current: string | null; openFolders: Set<string>; toggle: (p: string) => void; onOpen: (id: string) => void; onDrop: (pageId: string, folder: string) => void; onNew: (folder: string) => void }) {
  const open = openFolders.has(f.path)
  const [over, setOver] = useState(false)
  const accept = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('text/x-kb-page')) return
    e.preventDefault()
    setOver(true)
  }
  return (
    <li className={`kb-folder${over ? ' is-over' : ''}`}>
      <div className="kb-folder-head" onDragOver={accept} onDragLeave={() => setOver(false)} onDrop={(e) => (setOver(false), onDrop(e.dataTransfer.getData('text/x-kb-page'), f.path))}>
        <button type="button" className="kb-row is-folder" onClick={() => toggle(f.path)} aria-expanded={open} style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}>
          {open ? <ChevronDown className="kb-caret" aria-hidden="true" /> : <ChevronRight className="kb-caret" aria-hidden="true" />}
          <span className="kb-row-icon">{open ? <FolderOpen aria-hidden="true" /> : <Folder aria-hidden="true" />}</span>
          <span className="kb-row-title">{f.name}</span>
          <i className="kb-row-count">{countPages(f)}</i>
        </button>
        <button type="button" className="kb-folder-add" onClick={() => onNew(f.path)} title={`Новая страница в «${f.name}»`} aria-label="Новая страница здесь">
          <FilePlus2 aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul>
          {f.folders.map((sub) => (
            <FolderNode key={sub.path} f={sub} depth={depth + 1} current={current} openFolders={openFolders} toggle={toggle} onOpen={onOpen} onDrop={onDrop} onNew={onNew} />
          ))}
          {f.pages.map((n) => (
            <li key={n.id} style={{ paddingLeft: `${(depth + 1) * 0.9}rem` }}>
              <PageRow n={n} current={current === n.id} onOpen={() => onOpen(n.id)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
