import type { ScreenNote } from '../../types/rooms'
import { parsePage } from './mdparse'

/* ---------- дерево ---------- */

export interface TreeFolder {
  name: string
  path: string
  folders: TreeFolder[]
  pages: ScreenNote[]
}

export function buildTree(notes: ScreenNote[], extra: string[]): TreeFolder {
  const root: TreeFolder = { name: '', path: '', folders: [], pages: [] }
  const at = (path: string): TreeFolder => {
    let node = root
    if (!path) return node
    let acc = ''
    for (const part of path.split('/').map((p) => p.trim()).filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part
      let next = node.folders.find((f) => f.name === part)
      if (!next) {
        next = { name: part, path: acc, folders: [], pages: [] }
        node.folders.push(next)
      }
      node = next
    }
    return node
  }
  for (const p of extra) at(p)
  for (const n of notes) at(n.folder ?? '').pages.push(n)
  const sort = (f: TreeFolder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    f.pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ru'))
    f.folders.forEach(sort)
  }
  sort(root)
  return root
}

export const iconOf = (n: ScreenNote) => parsePage(n.body).meta.icon

export const countPages = (f: TreeFolder): number => f.pages.length + f.folders.reduce((s, x) => s + countPages(x), 0)
