/**
 * Директория в духе боковой панели Foundry — один образец для списков мастера:
 * существа ширмы, добыча, карты, таблицы, база знаний.
 *
 * Шапка: «Создать», «Папка», поиск, «Свернуть всё», порядок (по алфавиту / вручную).
 * Папки с цветом и вложенностью; свёрнутые помнятся (localStorage). Записи и папки
 * перетаскиваются в папки, а в ручном порядке — между соседями. Меню по правой
 * кнопке или «⋯»: Открыть, свои действия списка, Переименовать, Дублировать,
 * Права доступа, Экспорт JSON, Удалить. Клавиатура: стрелки, Home/End, Enter,
 * F2 — переименовать, Delete — удалить, Shift+F10 — меню. Роли ARIA tree/treeitem.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent as RMouseEvent } from 'react'
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  KeyRound,
  ListOrdered,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { PermissionsDialog } from '../../rooms/perms/PermissionsDialog'
import { DirMenu, type MenuEntry } from './ContextMenu'
import { downloadJson } from './download'
import { allFolderIds, ancestors, buildTree, canNest, dropZone, FOLDER_COLORS, reorder, visibleRows, type DirFolder, type DirItem, type FolderNode, type Row, type SortMode } from './model'
import { loadCollapsed, loadSort, saveCollapsed, saveSort } from './storage'
import type { DirectoryListProps } from './types'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')
const DIR_MIME = 'application/x-vantage-dir'

type Drag = { type: 'item' | 'folder'; id: string }
type Over = { id: string | null; zone: 'before' | 'after' | 'inside' }
type Menu = { x: number; y: number; row: Row<DirItem> }

function RenameInput({ value, label, onDone }: { value: string; label: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(value)
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    onDone(name)
  }
  return (
    <input
      className="dir-rename"
      value={v}
      aria-label={label}
      maxLength={200}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(v.trim() && v.trim() !== value ? v.trim() : null)
        else if (e.key === 'Escape') finish(null)
      }}
      onBlur={() => finish(v.trim() && v.trim() !== value ? v.trim() : null)}
    />
  )
}

export function DirectoryList<T extends DirItem>(props: DirectoryListProps<T>) {
  const { listId, label, items, folders, ops, actions, selectedId = null, onCreate } = props
  const [ownQuery, setOwnQuery] = useState('')
  const query = props.query ?? ownQuery
  const setQuery = props.onQueryChange ?? setOwnQuery
  const [mode, setMode] = useState<SortMode>(() => loadSort(listId, props.defaultSort ?? 'alpha'))
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(listId))
  const [focusId, setFocusId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [perms, setPerms] = useState<T | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState<Over | null>(null)
  const drag = useRef<Drag | null>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const treeRef = useRef<HTMLUListElement>(null)
  const searching = query.trim().length > 0

  const tree = useMemo(() => buildTree(folders, items, { mode, query, match: props.match, hideEmpty: props.hideEmptyFolders }), [folders, items, mode, query, props.match, props.hideEmptyFolders])
  const rows = useMemo(() => visibleRows(tree, collapsed, searching), [tree, collapsed, searching])
  const nodes = useMemo(() => {
    const m = new Map<string, FolderNode<T>>()
    const walk = (n: FolderNode<T>) => {
      m.set(n.folder.id, n)
      n.folders.forEach(walk)
    }
    tree.folders.forEach(walk)
    return m
  }, [tree])

  // выбранная снаружи запись — раскрыть путь к ней
  const selectedFolder = items.find((x) => x.id === selectedId)?.folderId ?? null
  useEffect(() => {
    if (!selectedFolder) return
    const path = ancestors(folders, selectedFolder)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed((s) => (path.some((p) => s.has(p)) ? new Set([...s].filter((x) => !path.includes(x))) : s))
  }, [selectedFolder, folders])
  useEffect(() => saveCollapsed(listId, collapsed), [listId, collapsed])

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((s) => {
      const next = new Set(s)
      const isOpen = !next.has(id)
      if (open ?? !isOpen) next.delete(id)
      else next.add(id)
      return next
    })

  const run = useCallback(async (fn: () => unknown) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const focusRow = (id: string | null) => {
    setFocusId(id)
    if (id) requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)?.focus())
  }

  /* ---------- действия ---------- */

  const folderOf = (row: Row<T> | undefined) => (!row ? null : row.kind === 'folder' ? row.id : row.parentId)
  const newFolder = (parentId: string | null) =>
    ops &&
    run(async () => {
      const id = await ops.createFolder(parentId, 'Новая папка')
      if (parentId) toggle(parentId, true)
      if (id) {
        setRenaming(id)
        setFocusId(id)
      }
    })
  const removeItem = (it: T) => actions.remove && confirm(`Удалить «${it.name}»?`) && run(() => actions.remove?.(it))
  const removeFolder = (f: DirFolder) => ops && confirm(`Удалить папку «${f.name}»? Её содержимое перейдёт на уровень выше.`) && run(() => ops.deleteFolder(f.id))
  const canRename = (row: Row<T>) => (row.kind === 'folder' ? !!ops : !!actions.rename)

  const itemEntries = (it: T): MenuEntry[] => {
    const out: MenuEntry[] = []
    if (actions.open) out.push({ id: 'open', label: 'Открыть', icon: <ExternalLink />, run: () => actions.open?.(it) })
    for (const x of actions.extra?.(it) ?? []) out.push({ id: `x-${x.id}`, label: x.label, icon: x.icon, danger: x.danger, disabled: x.disabled, run: x.run })
    if (actions.rename) out.push({ id: 'rename', label: 'Переименовать', icon: <PenLine />, run: () => setRenaming(it.id) })
    if (actions.duplicate) out.push({ id: 'dup', label: 'Дублировать', icon: <Copy />, run: () => void run(() => actions.duplicate?.(it)) })
    if (actions.permissions) out.push({ id: 'perms', label: 'Права доступа', icon: <KeyRound />, run: () => setPerms(it) })
    if (actions.exportJson) out.push({ id: 'export', label: 'Экспорт JSON', icon: <Download />, run: () => void run(async () => downloadJson(it.name, await actions.exportJson?.(it))) })
    if (actions.remove) out.push({ id: 'remove', label: 'Удалить', icon: <Trash2 />, danger: true, run: () => void removeItem(it) })
    return out
  }
  const folderEntries = (f: DirFolder): MenuEntry[] => {
    const out: MenuEntry[] = []
    if (onCreate) out.push({ id: 'create', label: props.createLabel ? `${props.createLabel} здесь` : 'Создать здесь', icon: <FilePlus2 />, run: () => onCreate(f.id) })
    if (!ops) return out
    out.push({ id: 'sub', label: 'Новая подпапка', icon: <FolderPlus />, run: () => void newFolder(f.id) })
    out.push({ id: 'rename', label: 'Переименовать', icon: <PenLine />, run: () => setRenaming(f.id) })
    const sorts: [SortMode | null, string][] = [
      [null, 'Порядок как у списка'],
      ['alpha', 'По алфавиту'],
      ['manual', 'Вручную'],
    ]
    for (const [s, text] of sorts) out.push({ id: `sort-${s}`, label: text, icon: (f.sort ?? null) === s ? <Check /> : null, run: () => void run(() => ops.patchFolder(f.id, { sort: s })) })
    out.push({ id: 'remove', label: 'Удалить папку', icon: <Trash2 />, danger: true, run: () => void removeFolder(f) })
    return out
  }
  const openMenu = (row: Row<T>, x: number, y: number) => {
    setFocusId(row.id)
    setMenu({ x, y, row: row as Row<DirItem> })
  }

  /* ---------- перетаскивание ---------- */

  const trackPoint = (e: globalThis.DragEvent) => {
    lastPoint.current = { x: e.clientX, y: e.clientY }
  }
  const startDrag = (e: DragEvent, row: Row<T>) => {
    if (renaming) return e.preventDefault()
    drag.current = { type: row.kind, id: row.id }
    lastPoint.current = null
    document.addEventListener('dragover', trackPoint)
    e.dataTransfer.setData(DIR_MIME, listId)
    e.dataTransfer.effectAllowed = 'copyMove'
    if (row.kind === 'item') props.onItemDragStart?.(row.item, e)
  }
  const endDrag = (e: DragEvent, row: Row<T>) => {
    document.removeEventListener('dragover', trackPoint)
    drag.current = null
    setOver(null)
    if (row.kind === 'item') props.onItemDragEnd?.(row.item, e, lastPoint.current)
  }
  const modeOf = (folderId: string | null) => (searching ? 'alpha' : ((folderId ? nodes.get(folderId)?.folder.sort : null) ?? mode))
  const accepts = (target: string | null) => {
    const d = drag.current
    if (!d || !ops) return false
    return d.type === 'item' || canNest(folders, d.id, target)
  }
  const overRow = (e: DragEvent, row: Row<T>) => {
    if (!drag.current || drag.current.id === row.id) return
    const r = e.currentTarget.getBoundingClientRect()
    const parent = row.parentId
    let zone = dropZone(row.kind, e.clientY - r.top, r.height, modeOf(row.kind === 'folder' ? parent : row.parentId) === 'manual')
    if (drag.current.type === 'item' && row.kind === 'folder') zone = 'inside'
    if (drag.current.type === 'folder' && row.kind === 'item') zone = 'inside'
    const target = row.kind === 'folder' && zone === 'inside' ? row.id : parent
    if (!accepts(target)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (over?.id !== row.id || over.zone !== zone) setOver({ id: row.id, zone })
  }
  const drop = (row: Row<T> | null, zone: Over['zone']) => {
    const d = drag.current
    setOver(null)
    if (!d || !ops) return
    // куда: в папку строки, к её соседям или в корень
    const target = !row ? null : row.kind === 'folder' && zone === 'inside' ? row.id : row.parentId
    if (d.type === 'folder' && !canNest(folders, d.id, target)) return
    const node = target ? nodes.get(target) : null
    const siblings = d.type === 'item' ? (node ? node.items : tree.items).map((x) => x.id) : (node ? node.folders : tree.folders).map((x) => x.folder.id)
    const manual = modeOf(target) === 'manual'
    const sameKind = row && row.kind === d.type && !(row.kind === 'folder' && zone === 'inside')
    let before: string | null = null
    if (sameKind && row) {
      const rest = siblings.filter((x) => x !== d.id)
      before = zone === 'before' ? row.id : (rest[rest.indexOf(row.id) + 1] ?? null)
    }
    const currentParent = d.type === 'item' ? (items.find((x) => x.id === d.id)?.folderId ?? null) : (folders.find((x) => x.id === d.id)?.parentId ?? null)
    const moved = (currentParent ?? null) !== (target ?? null)
    const order = manual ? reorder(siblings, [d.id], before) : undefined
    if (!moved && !order) return
    if (target) toggle(target, true)
    void run(() => ops.move({ itemIds: d.type === 'item' && moved ? [d.id] : [], folderIds: d.type === 'folder' && moved ? [d.id] : [], targetId: target, order }))
  }

  /* ---------- клавиатура ---------- */

  const onKey = (e: KeyboardEvent) => {
    if (renaming || menu) return
    const at = rows.findIndex((r) => r.id === focusId)
    const row = rows[at]
    const go = (i: number) => rows[i] && focusRow(rows[i].id)
    switch (e.key) {
      case 'ArrowDown':
        go(at < 0 ? 0 : Math.min(rows.length - 1, at + 1))
        break
      case 'ArrowUp':
        go(at < 0 ? 0 : Math.max(0, at - 1))
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(rows.length - 1)
        break
      case 'ArrowRight':
        if (row?.kind === 'folder') {
          if (!row.open) toggle(row.id, true)
          else go(at + 1)
        }
        break
      case 'ArrowLeft':
        if (row?.kind === 'folder' && row.open && !searching) toggle(row.id, false)
        else if (row?.parentId) focusRow(row.parentId)
        break
      case 'Enter':
      case ' ':
        if (!row) return
        if (row.kind === 'folder') toggle(row.id)
        else actions.open?.(row.item)
        break
      case 'F2':
        if (row && canRename(row)) setRenaming(row.id)
        break
      case 'Delete':
        if (row?.kind === 'item') void removeItem(row.item)
        else if (row?.kind === 'folder') void removeFolder(row.node.folder)
        break
      case 'ContextMenu':
      case 'F10':
        if (e.key === 'F10' && !e.shiftKey) return
        if (row) {
          const r = treeRef.current?.querySelector(`[data-row="${CSS.escape(row.id)}"]`)?.getBoundingClientRect()
          openMenu(row, r ? r.left + 24 : 0, r ? r.bottom : 0)
        }
        break
      default:
        return
    }
    e.preventDefault()
  }

  /* ---------- строки ---------- */

  const tabbable = focusId && rows.some((r) => r.id === focusId) ? focusId : (rows.find((r) => r.id === selectedId)?.id ?? rows[0]?.id)
  const marker = (row: Row<T>) => (over?.id === row.id ? ` is-drop-${over.zone}` : '')
  const draggable = !!ops || !!props.onItemDragStart

  const renderRow = (row: Row<T>, index: number) => {
    const common = {
      'data-row': row.id,
      role: 'treeitem',
      'aria-level': row.depth + 1,
      'aria-posinset': index + 1,
      tabIndex: tabbable === row.id ? 0 : -1,
      draggable: draggable && renaming !== row.id && (row.kind === 'item' || !!ops),
      style: { ['--dir-depth' as string]: row.depth },
      onFocus: () => setFocusId(row.id),
      onContextMenu: (e: RMouseEvent) => {
        e.preventDefault()
        openMenu(row, e.clientX, e.clientY)
      },
      onDragStart: (e: DragEvent) => startDrag(e, row),
      onDragEnd: (e: DragEvent) => endDrag(e, row),
      onDragOver: (e: DragEvent) => overRow(e, row),
      onDrop: (e: DragEvent) => {
        if (!drag.current) return
        e.preventDefault()
        e.stopPropagation()
        drop(row, over?.id === row.id ? over.zone : 'inside')
      },
    }
    const more = (
      <button
        type="button"
        className="dir-more"
        tabIndex={-1}
        aria-label="Действия"
        title="Действия"
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          openMenu(row, r.left, r.bottom)
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
    )
    if (row.kind === 'folder') {
      const f = row.node.folder
      return (
        <li key={`f-${row.id}`} {...common} aria-expanded={row.open} aria-label={f.name} className={`dir-row is-folder${f.virtual ? ' is-virtual' : ''}${marker(row)}`} onClick={() => !renaming && (setFocusId(row.id), toggle(row.id))}>
          <span className="dir-caret" aria-hidden="true">
            {row.open ? <ChevronDown /> : <ChevronRight />}
          </span>
          <span className="dir-icon dir-folder-icon" style={f.color ? { color: f.color } : undefined} aria-hidden="true">
            {row.open ? <FolderOpen /> : <Folder />}
          </span>
          {renaming === row.id ? (
            <RenameInput
              value={f.name}
              label="Имя папки"
              onDone={(name) => {
                setRenaming(null)
                focusRow(row.id)
                if (name && ops) void run(() => ops.patchFolder(f.id, { name }))
              }}
            />
          ) : (
            <span className="dir-name">{f.name}</span>
          )}
          <i className="dir-count">{row.node.count}</i>
          {onCreate && (
            <button
              type="button"
              className="dir-more"
              tabIndex={-1}
              title={`${props.createLabel ?? 'Создать'} в «${f.name}»`}
              aria-label={`${props.createLabel ?? 'Создать'} в папке`}
              onClick={(e) => {
                e.stopPropagation()
                onCreate(f.id)
              }}
            >
              <Plus aria-hidden="true" />
            </button>
          )}
          {more}
        </li>
      )
    }
    const it = row.item
    const selected = it.id === selectedId
    return (
      <li
        key={`i-${row.id}`}
        {...common}
        aria-selected={selected}
        aria-label={it.name}
        className={`dir-row is-item${selected ? ' is-on' : ''}${marker(row)}`}
        onClick={() => !renaming && (setFocusId(row.id), actions.open?.(it))}
      >
        {ops && !searching && modeOf(row.parentId) === 'manual' && <GripVertical className="dir-grip" aria-hidden="true" />}
        {props.renderItem ? (
          renaming === row.id ? (
            <RenameInput value={it.name} label="Новое имя" onDone={(name) => (setRenaming(null), focusRow(row.id), name && void run(() => actions.rename?.(it, name)))} />
          ) : (
            props.renderItem(it)
          )
        ) : (
          <>
            <span className="dir-icon" aria-hidden="true">
              {props.icon?.(it) ?? <FileText />}
            </span>
            {renaming === row.id ? (
              <RenameInput value={it.name} label="Новое имя" onDone={(name) => (setRenaming(null), focusRow(row.id), name && void run(() => actions.rename?.(it, name)))} />
            ) : (
              <span className="dir-name">{it.name}</span>
            )}
          </>
        )}
        {props.rowActions && (
          <span className="dir-acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {props.rowActions(it)}
          </span>
        )}
        {more}
      </li>
    )
  }

  const menuRow = menu?.row as Row<T> | undefined
  const nothing = rows.length === 0

  return (
    <div className={`dir${props.compact ? ' is-compact' : ''}${props.className ? ` ${props.className}` : ''}${busy ? ' is-busy' : ''}`}>
      {!props.compact && (
        <div className="dir-head">
          <div className="dir-head-row">
            {onCreate && (
              <button type="button" className={`dir-btn is-main${props.createActive ? ' is-on' : ''}`} aria-pressed={props.createActive} onClick={() => onCreate(folderOf(rows.find((r) => r.id === focusId)))}>
                <Plus aria-hidden="true" /> {props.createLabel ?? 'Создать'}
              </button>
            )}
            {ops && (
              <button type="button" className="dir-btn" onClick={() => void newFolder(null)} title="Новая папка">
                <FolderPlus aria-hidden="true" /> Папка
              </button>
            )}
            {props.toolbar}
          </div>
          <div className="dir-head-row">
            <label className="dir-search">
              <Search aria-hidden="true" />
              <input type="search" value={query} placeholder={props.searchPlaceholder ?? 'Найти…'} aria-label="Поиск" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button type="button" className="dir-icon-btn" title="Свернуть всё" aria-label="Свернуть всё" onClick={() => setCollapsed(new Set(allFolderIds(buildTree(folders, items, { mode }))))}>
              <ChevronsDownUp aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`dir-icon-btn${mode === 'manual' ? ' is-on' : ''}`}
              aria-pressed={mode === 'manual'}
              title={mode === 'manual' ? 'Порядок: вручную (нажмите — по алфавиту)' : 'Порядок: по алфавиту (нажмите — вручную)'}
              aria-label={mode === 'manual' ? 'Порядок вручную' : 'Порядок по алфавиту'}
              onClick={() => {
                const next = mode === 'manual' ? 'alpha' : 'manual'
                setMode(next)
                saveSort(listId, next)
              }}
            >
              {mode === 'manual' ? <ListOrdered aria-hidden="true" /> : <ArrowDownAZ aria-hidden="true" />}
            </button>
          </div>
        </div>
      )}
      <ul
        ref={treeRef}
        className={`dir-tree${over?.id === null ? ' is-drop-root' : ''}`}
        role="tree"
        aria-label={label}
        onKeyDown={onKey}
        onDragOver={(e) => {
          if (!drag.current || !accepts(null)) return
          e.preventDefault()
          if (over?.id !== null) setOver({ id: null, zone: 'inside' })
        }}
        onDragLeave={(e) => {
          if (e.target === e.currentTarget) setOver(null)
        }}
        onDrop={(e) => {
          if (!drag.current) return
          e.preventDefault()
          drop(null, 'inside')
        }}
      >
        {rows.map(renderRow)}
      </ul>
      {nothing && (searching ? <p className="dir-empty">Ничего не нашли</p> : props.empty)}
      {error && <p className="tb-err">{error}</p>}
      {menu && menuRow && (
        <DirMenu
          x={menu.x}
          y={menu.y}
          label={menuRow.kind === 'folder' ? `Папка «${menuRow.node.folder.name}»` : `«${menuRow.item.name}»`}
          entries={menuRow.kind === 'folder' ? folderEntries(menuRow.node.folder) : itemEntries(menuRow.item)}
          swatches={menuRow.kind === 'folder' && ops ? [{ color: null, label: 'Без цвета', on: !menuRow.node.folder.color }, ...FOLDER_COLORS.map((c) => ({ ...c, on: menuRow.node.folder.color === c.color }))] : undefined}
          onSwatch={menuRow.kind === 'folder' && ops ? (color) => void run(() => ops.patchFolder(menuRow.node.folder.id, { color })) : undefined}
          onClose={() => {
            setMenu(null)
            focusRow(menuRow.id)
          }}
        />
      )}
      {perms && actions.permissions && <PermissionsDialog kind={actions.permissions} docId={perms.id} title={perms.name} onClose={() => setPerms(null)} />}
    </div>
  )
}
