/**
 * Директории в духе боковой панели Foundry: чистые помощники без React.
 * Дерево папок и записей, порядок (по алфавиту или вручную), поиск, плоский
 * список видимых строк для клавиатуры, новый порядок после перетаскивания и
 * папки-строки «Город/Таверны» у таблиц и базы знаний.
 */

export type SortMode = 'alpha' | 'manual'

export interface DirFolder {
  id: string
  name: string
  color: string | null
  parentId: string | null
  order: number
  sort: SortMode | null
  /** Папка есть только в путях записей (folder: «Город/Таверны»), на сервере её ещё нет */
  virtual?: boolean
  /** Полный путь — у списков, где папка записи хранится строкой */
  path?: string
}

export interface DirItem {
  id: string
  name: string
  folderId: string | null
  sortOrder?: number | null
}

export interface FolderNode<T extends DirItem> {
  folder: DirFolder
  depth: number
  folders: FolderNode<T>[]
  items: T[]
  /** Записей внутри, со всеми подпапками */
  count: number
}

export interface DirTree<T extends DirItem> {
  folders: FolderNode<T>[]
  items: T[]
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base', numeric: true })

export function sortFolders(list: DirFolder[], mode: SortMode): DirFolder[] {
  return [...list].sort((a, b) => (mode === 'manual' ? a.order - b.order : 0) || byName(a, b))
}

export function sortItems<T extends DirItem>(list: T[], mode: SortMode): T[] {
  const pos = (x: T) => (x.sortOrder == null ? Number.MAX_SAFE_INTEGER : x.sortOrder)
  return [...list].sort((a, b) => (mode === 'manual' ? pos(a) - pos(b) : 0) || byName(a, b))
}

const norm = (s: string) => s.trim().toLocaleLowerCase('ru')

/** Запись подходит под строку поиска: по имени, без регистра */
export const nameMatches = (item: { name: string }, query: string) => norm(item.name).includes(norm(query))

export interface BuildOptions<T extends DirItem> {
  mode: SortMode
  query?: string
  match?: (item: T, query: string) => boolean
  /** Пустые папки не показывать (вторые списки того же вида, например «За ширмой») */
  hideEmpty?: boolean
}

/**
 * Дерево. Запись, чья папка не найдена, лежит в корне. При поиске остаются
 * подходящие записи и их папки; папка, подошедшая по имени, — целиком.
 */
export function buildTree<T extends DirItem>(folders: DirFolder[], items: T[], opts: BuildOptions<T>): DirTree<T> {
  const ids = new Set(folders.map((f) => f.id))
  const kids = new Map<string | null, DirFolder[]>()
  for (const f of folders) {
    const parent = f.parentId && ids.has(f.parentId) && f.parentId !== f.id ? f.parentId : null
    kids.set(parent, [...(kids.get(parent) ?? []), f])
  }
  const inFolder = new Map<string | null, T[]>()
  for (const it of items) {
    const key = it.folderId && ids.has(it.folderId) ? it.folderId : null
    inFolder.set(key, [...(inFolder.get(key) ?? []), it])
  }
  const q = (opts.query ?? '').trim()
  const match = opts.match ?? nameMatches
  const seen = new Set<string>()

  const node = (f: DirFolder, depth: number, shown: boolean): FolderNode<T> | null => {
    if (seen.has(f.id)) return null // петля в данных — не уходим в бесконечность
    seen.add(f.id)
    const mode = f.sort ?? opts.mode
    const all = shown || !q || nameMatches(f, q)
    const sub = sortFolders(kids.get(f.id) ?? [], mode)
      .map((x) => node(x, depth + 1, all && !!q))
      .filter((x): x is FolderNode<T> => !!x)
    const own = sortItems(inFolder.get(f.id) ?? [], mode).filter((it) => !q || all || match(it, q))
    const count = own.length + sub.reduce((s, x) => s + x.count, 0)
    if (q && !all && count === 0) return null
    if (opts.hideEmpty && count === 0) return null
    return { folder: f, depth, folders: sub, items: own, count }
  }
  const roots = sortFolders(kids.get(null) ?? [], opts.mode)
    .map((f) => node(f, 0, false))
    .filter((x): x is FolderNode<T> => !!x)
  const items0 = sortItems(inFolder.get(null) ?? [], opts.mode).filter((it) => !q || match(it, q))
  return { folders: roots, items: items0 }
}

/* ---------- видимые строки: клавиатура и aria ---------- */

export type Row<T extends DirItem> =
  | { kind: 'folder'; id: string; depth: number; node: FolderNode<T>; parentId: string | null; open: boolean }
  | { kind: 'item'; id: string; depth: number; item: T; parentId: string | null }

/** Строки сверху вниз так, как их видно: содержимое свёрнутых папок пропускается (при поиске всё раскрыто) */
export function visibleRows<T extends DirItem>(tree: DirTree<T>, collapsed: ReadonlySet<string>, searching = false): Row<T>[] {
  const out: Row<T>[] = []
  const walk = (n: FolderNode<T>, parentId: string | null) => {
    const open = searching || !collapsed.has(n.folder.id)
    out.push({ kind: 'folder', id: n.folder.id, depth: n.depth, node: n, parentId, open })
    if (!open) return
    for (const f of n.folders) walk(f, n.folder.id)
    for (const it of n.items) out.push({ kind: 'item', id: it.id, depth: n.depth + 1, item: it, parentId: n.folder.id })
  }
  for (const f of tree.folders) walk(f, null)
  for (const it of tree.items) out.push({ kind: 'item', id: it.id, depth: 0, item: it, parentId: null })
  return out
}

/** Все папки дерева — «Свернуть всё» */
export function allFolderIds<T extends DirItem>(tree: DirTree<T>): string[] {
  const out: string[] = []
  const walk = (n: FolderNode<T>) => {
    out.push(n.folder.id)
    n.folders.forEach(walk)
  }
  tree.folders.forEach(walk)
  return out
}

/** Папки от корня до этой (для раскрытия пути к выбранной записи) */
export function ancestors(folders: DirFolder[], id: string | null): string[] {
  const map = new Map(folders.map((f) => [f.id, f]))
  const out: string[] = []
  let cur = id ? map.get(id) : undefined
  while (cur && !out.includes(cur.id)) {
    out.unshift(cur.id)
    cur = cur.parentId ? map.get(cur.parentId) : undefined
  }
  return out
}

/** Можно ли положить папку ``id`` в ``target``: не в себя и не в своего потомка */
export function canNest(folders: DirFolder[], id: string, target: string | null): boolean {
  if (target == null) return true
  return !ancestors(folders, target).includes(id)
}

/* ---------- перетаскивание ---------- */

/**
 * Новый ручной порядок соседей: ``moving`` встают перед ``before`` (null — в конец).
 * ``siblings`` — нынешний порядок в целевой папке; перетаскиваемые из него убираются.
 */
export function reorder(siblings: string[], moving: string[], before: string | null): string[] {
  const rest = siblings.filter((id) => !moving.includes(id))
  const at = before == null ? rest.length : rest.indexOf(before)
  const idx = at < 0 ? rest.length : at
  return [...rest.slice(0, idx), ...moving, ...rest.slice(idx)]
}

/** Сюда бросили: перед строкой, после неё или внутрь папки — по высоте указателя */
export function dropZone(kind: 'folder' | 'item', offsetY: number, height: number, manual: boolean): 'before' | 'after' | 'inside' {
  const r = height > 0 ? offsetY / height : 0.5
  if (kind === 'folder') {
    if (!manual) return 'inside'
    return r < 0.25 ? 'before' : r > 0.75 ? 'after' : 'inside'
  }
  return r < 0.5 ? 'before' : 'after'
}

/* ---------- папки-строки: таблицы и база знаний ---------- */

export interface ServerFolder {
  id: string
  name: string
  color: string | null
  parent_id: string | null
  sort: SortMode | null
  order: number
}

export const pathKey = (path: string | null | undefined) =>
  (path ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/')
    .toLocaleLowerCase('ru')

const cleanPath = (path: string | null | undefined) =>
  (path ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/')

export const VIRTUAL_PREFIX = 'path:'

/** Папки сервера в виде директории (без путей) */
export const fromServer = (list: ServerFolder[]): DirFolder[] =>
  list.map((f) => ({ id: f.id, name: f.name, color: f.color, parentId: f.parent_id, order: f.order, sort: f.sort }))

/**
 * Папки сервера плюс папки, которые есть только в путях записей. Путь сравнивается
 * без регистра, как на сервере. Возвращает папки (у каждой — ``path``) и поиск папки по пути.
 */
export function mergePathFolders(server: ServerFolder[], paths: (string | null | undefined)[]): { folders: DirFolder[]; byPath: (path: string | null | undefined) => string | null } {
  const folders = fromServer(server)
  const map = new Map(folders.map((f) => [f.id, f]))
  const keyOf = new Map<string, string>() // путь без регистра → id
  const fullPath = (f: DirFolder, guard = 0): string => {
    const parent = f.parentId ? map.get(f.parentId) : undefined
    return parent && guard < 32 ? `${fullPath(parent, guard + 1)}/${f.name}` : f.name
  }
  for (const f of folders) {
    f.path = fullPath(f)
    const key = pathKey(f.path)
    if (!keyOf.has(key)) keyOf.set(key, f.id)
  }
  for (const raw of paths) {
    const parts = cleanPath(raw).split('/').filter(Boolean)
    let parent: string | null = null
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      const key = pathKey(acc)
      let id = keyOf.get(key)
      if (!id) {
        id = VIRTUAL_PREFIX + key
        const f: DirFolder = { id, name: part, color: null, parentId: parent, order: Number.MAX_SAFE_INTEGER, sort: null, virtual: true, path: acc }
        folders.push(f)
        map.set(id, f)
        keyOf.set(key, id)
      }
      parent = id
    }
  }
  return { folders, byPath: (path) => (cleanPath(path) ? (keyOf.get(pathKey(path)) ?? null) : null) }
}

/** Путь папки для записи: у настоящей — из имён, у виртуальной — сохранённый */
export function folderPath(folders: DirFolder[], id: string | null): string {
  if (!id) return ''
  const map = new Map(folders.map((f) => [f.id, f]))
  return ancestors(folders, id)
    .map((x) => map.get(x)?.name ?? '')
    .join('/')
}

/** Цвета папок: метка слева у имени */
export const FOLDER_COLORS: { color: string; label: string }[] = [
  { color: '#c49a3c', label: 'Золото' },
  { color: '#c8493c', label: 'Кровь' },
  { color: '#d9a441', label: 'Янтарь' },
  { color: '#3fb950', label: 'Лес' },
  { color: '#4f8fd6', label: 'Море' },
  { color: '#b79cf0', label: 'Магия' },
  { color: '#9aa3ad', label: 'Камень' },
]
