/**
 * База знаний мастера: не стикеры на ширме, а свой вики-архив кампании.
 * Дерево папок, страницы в markdown со ссылками [[…]], обратные ссылки, граф
 * связей, доски с фото и таблицы случайностей прямо в страницах.
 *
 * Хранится в заметках ширмы как есть: title — название, folder — путь
 * «Локации/Север», body — markdown с шапкой (иконка, обложка, теги). Сервер
 * менять не нужно; всё можно выгрузить в Obsidian.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  Bold,
  ChevronDown,
  ChevronRight,
  Dices,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Heading2,
  ImagePlus,
  Italic,
  LayoutDashboard,
  Link2,
  List,
  ListChecks,
  MessageSquareQuote,
  Network,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { ApiError, uploadMedia } from '../../api'
import { Img } from '../../media'
import type { ScreenNote } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { createNote, deleteNote, listNotes, patchNote, patchNotesBatch } from '../roomsApi'
import { errText } from '../table/parts'
import { KnowledgeGraph } from './Graph'
import { MarkdownBody, type PageLookup } from './Markdown'
import { linksOf, parseBlocks, parsePage, plainText, renameLinks, tagsOf, writePage, type PageMeta } from './mdparse'

/* ---------- хранилище ---------- */

interface KnowledgeApi {
  notes: ScreenNote[] | null
  error: string | null
  isOpen: boolean
  current: string | null
  /** открыть базу (и страницу) */
  open: (id?: string | null) => void
  close: () => void
  create: (body: Partial<ScreenNote>) => Promise<ScreenNote | null>
  /** force — без проверки ревизии: «оставить мою» после конфликта */
  update: (id: string, patch: Partial<ScreenNote>, force?: boolean) => Promise<void>
  /** несколько заметок разом: всё или ничего */
  updateMany: (items: (Partial<ScreenNote> & { id: string })[]) => Promise<void>
  remove: (id: string) => Promise<void>
  setCurrent: (id: string | null) => void
}

const Ctx = createContext<KnowledgeApi | null>(null)
export const useKnowledge = () => useContext(Ctx)

const norm = (s: string) => s.trim().toLowerCase()

/** Страницу поменяли в другой вкладке: сервер отказал по ревизии */
export class NoteConflict extends Error {
  constructor() {
    super('Страницу изменили в другой вкладке')
  }
}

export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const { roomId } = useRoom()
  const [notes, setNotes] = useState<ScreenNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listNotes(roomId).then(
      (n) => alive && setNotes(n),
      (e) => alive && setError(errText(e)),
    )
    return () => {
      alive = false
    }
  }, [roomId])

  const create = useCallback(
    async (body: Partial<ScreenNote>) => {
      try {
        const n = await createNote(roomId, { title: 'Новая страница', body: '', ...body })
        setNotes((l) => [...(l ?? []), n])
        return n
      } catch (e) {
        setError(errText(e))
        return null
      }
    },
    [roomId],
  )
  // ревизии на экране: с ними сервер не даст затереть правку из другой вкладки
  const revs = useRef(new Map<string, number>())
  useEffect(() => {
    for (const n of notes ?? []) if (n.revision != null && !revs.current.has(n.id)) revs.current.set(n.id, n.revision)
  }, [notes])
  const reload = useCallback(async () => {
    const fresh = await listNotes(roomId)
    revs.current = new Map(fresh.filter((n) => n.revision != null).map((n) => [n.id, n.revision as number]))
    setNotes(fresh)
  }, [roomId])

  const update = useCallback(
    async (id: string, patch: Partial<ScreenNote>, force = false) => {
      setNotes((l) => (l ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)))
      const rev = revs.current.get(id)
      try {
        const saved = await patchNote(roomId, id, force || rev == null ? patch : { ...patch, revision: rev })
        if (saved?.revision != null) revs.current.set(id, saved.revision)
        setNotes((l) => (l ?? []).map((n) => (n.id === id ? { ...n, ...saved, ...patch } : n)))
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          await reload().catch(() => undefined)
          throw new NoteConflict()
        }
        setError(errText(e))
        throw e
      }
    },
    [roomId, reload],
  )
  const updateMany = useCallback(
    async (items: (Partial<ScreenNote> & { id: string })[]) => {
      if (items.length === 0) return
      setNotes((l) => (l ?? []).map((n) => ({ ...n, ...(items.find((x) => x.id === n.id) ?? {}) })))
      try {
        const res = await patchNotesBatch(roomId, items.map((x) => ({ ...x, ...(revs.current.has(x.id) ? { revision: revs.current.get(x.id) } : {}) })))
        for (const n of res.items ?? []) if (n.revision != null) revs.current.set(n.id, n.revision)
        setNotes((l) => (l ?? []).map((n) => res.items?.find((x) => x.id === n.id) ?? n))
      } catch (e) {
        // старый сервер без пакетной правки — по одной
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          for (const x of items) await update(x.id, x).catch(() => undefined)
          return
        }
        if (e instanceof ApiError && e.status === 409) {
          await reload().catch(() => undefined)
          throw new NoteConflict()
        }
        setError(errText(e))
        throw e
      }
    },
    [roomId, reload, update],
  )
  const remove = useCallback(
    async (id: string) => {
      await deleteNote(roomId, id)
      setNotes((l) => (l ?? []).filter((n) => n.id !== id))
      setCurrent((c) => (c === id ? null : c))
    },
    [roomId],
  )
  const value = useMemo<KnowledgeApi>(
    () => ({
      notes,
      error,
      isOpen,
      current,
      open: (id) => {
        if (id !== undefined) setCurrent(id)
        setOpen(true)
      },
      close: () => setOpen(false),
      create,
      update,
      updateMany,
      remove,
      setCurrent,
    }),
    [notes, error, isOpen, current, create, update, updateMany, remove],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <KnowledgeWorkspace />}
    </Ctx.Provider>
  )
}

/* ---------- дерево ---------- */

interface TreeFolder {
  name: string
  path: string
  folders: TreeFolder[]
  pages: ScreenNote[]
}

function buildTree(notes: ScreenNote[], extra: string[]): TreeFolder {
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

const iconOf = (n: ScreenNote) => parsePage(n.body).meta.icon

function PageRow({ n, current, onOpen }: { n: ScreenNote; current: boolean; onOpen: () => void }) {
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

function FolderNode({ f, depth, current, openFolders, toggle, onOpen, onDrop, onNew }: { f: TreeFolder; depth: number; current: string | null; openFolders: Set<string>; toggle: (p: string) => void; onOpen: (id: string) => void; onDrop: (pageId: string, folder: string) => void; onNew: (folder: string) => void }) {
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

const countPages = (f: TreeFolder): number => f.pages.length + f.folders.reduce((s, x) => s + countPages(x), 0)

/* ---------- шаблоны ---------- */

const TEMPLATES: { name: string; icon: string; folder: string; body: string }[] = [
  { name: 'Пустая страница', icon: '', folder: '', body: '' },
  {
    name: 'Персонаж мастера',
    icon: '🧙',
    folder: 'Персонажи',
    body: '> [!lore] Кто это\n> Одна фраза, чтобы вспомнить за столом.\n\n## Внешность и манеры\n- \n\n## Чего хочет\n- \n\n## Что знает\n- \n\n> [!secret]- Тайна\n> Игроки об этом пока не знают.\n\n## Связи\n- [[]]\n',
  },
  {
    name: 'Локация',
    icon: '🏰',
    folder: 'Локации',
    body: '## Впечатление\nЧто видят, слышат и чуют герои с порога.\n\n## Кто здесь\n- [[]]\n\n## Что можно найти\n- [ ] \n\n```board\n{"h":360,"items":[]}\n```\n',
  },
  {
    name: 'Квест',
    icon: '📜',
    folder: 'Квесты',
    body: '> [!tip] Зацепка\n> Как герои узнают о деле.\n\n## Шаги\n- [ ] \n- [ ] \n\n## Награда\n\n## Если пойдёт не так\n',
  },
  {
    name: 'Таблица случайностей',
    icon: '🎲',
    folder: 'Таблицы',
    body: '```random\nСлухи в таверне\n- Мельник видел огни на болотах\n- Кузнец задолжал гильдии воров\n- В колодце что-то шепчет по ночам\n- Караван из столицы не пришёл\n- Старая ведьма ищет учеников\n- На кладбище пропали надгробия\n```\n',
  },
  { name: 'Доска расследования', icon: '🧷', folder: 'Доски', body: '```board\n{"h":560,"items":[]}\n```\n' },
]

const ICONS = ['📜', '🏰', '🗺️', '🧙', '🐉', '⚔️', '🛡️', '💀', '🔮', '🗝️', '💰', '🍺', '🌲', '⛰️', '🌊', '🔥', '❄️', '🌙', '☀️', '👑', '🕯️', '📖', '🧪', '🏹', '🪓', '🎲', '🧷', '🐺', '🕸️', '⚓']

/* ---------- редактор ---------- */

function Editor({ value, onChange, titles }: { value: string; onChange: (v: string) => void; titles: string[] }) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const [suggest, setSuggest] = useState<{ q: string; at: number } | null>(null)
  const [pick, setPick] = useState(0)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const insert = (before: string, after = '', placeholder = '') => {
    const el = ta.current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const sel = value.slice(s, e) || placeholder
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }
  /** Вставить с новой строки (для блоков) */
  const block = (text: string) => {
    const el = ta.current
    const s = el?.selectionStart ?? value.length
    const lead = s > 0 && value[s - 1] !== '\n' ? '\n\n' : ''
    const next = value.slice(0, s) + lead + text + '\n' + value.slice(s)
    onChange(next)
    requestAnimationFrame(() => el?.focus())
  }
  const upload = async (f: File) => {
    setBusy(true)
    try {
      const { url } = await uploadMedia(f)
      insert(`![${f.name.replace(/\.[^.]+$/, '')}](${url})`)
    } catch {
      /* ошибка видна по отсутствию картинки */
    } finally {
      setBusy(false)
    }
  }
  const checkSuggest = (v: string, caret: number) => {
    const m = /\[\[([^\]\n]*)$/.exec(v.slice(0, caret))
    setSuggest(m ? { q: m[1], at: caret - m[1].length } : null)
    setPick(0)
  }
  const options = suggest ? titles.filter((t) => norm(t).includes(norm(suggest.q))).slice(0, 8) : []
  const choose = (t: string) => {
    if (!suggest) return
    const el = ta.current
    const caret = el?.selectionStart ?? suggest.at
    const next = value.slice(0, suggest.at) + t + ']]' + value.slice(caret).replace(/^\]\]/, '')
    onChange(next)
    setSuggest(null)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = suggest.at + t.length + 2
      el?.setSelectionRange(pos, pos)
    })
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest && options.length) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setPick((p) => (p + 1) % options.length)
      if (e.key === 'ArrowUp') return e.preventDefault(), setPick((p) => (p - 1 + options.length) % options.length)
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), choose(options[pick])
      if (e.key === 'Escape') return setSuggest(null)
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') return e.preventDefault(), insert('**', '**', 'жирный')
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') return e.preventDefault(), insert('*', '*', 'курсив')
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return e.preventDefault(), insert('[[', ']]', 'Страница')
  }
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (img) {
      e.preventDefault()
      void upload(img)
    }
  }
  const TOOLS: { icon: typeof Bold; label: string; run: () => void }[] = [
    { icon: Heading2, label: 'Заголовок', run: () => block('## Заголовок') },
    { icon: Bold, label: 'Жирный (Ctrl+B)', run: () => insert('**', '**', 'жирный') },
    { icon: Italic, label: 'Курсив (Ctrl+I)', run: () => insert('*', '*', 'курсив') },
    { icon: Link2, label: 'Ссылка на страницу (Ctrl+K)', run: () => insert('[[', ']]', 'Страница') },
    { icon: List, label: 'Список', run: () => block('- пункт') },
    { icon: ListChecks, label: 'Задачи', run: () => block('- [ ] дело') },
    { icon: MessageSquareQuote, label: 'Выноска', run: () => block('> [!note] Заголовок\n> Текст') },
    { icon: Table2, label: 'Таблица', run: () => block('| Имя | Где | Что |\n| --- | --- | --- |\n|  |  |  |') },
    { icon: ImagePlus, label: 'Картинка', run: () => file.current?.click() },
    { icon: LayoutDashboard, label: 'Доска с фото', run: () => block('```board\n{"h":420,"items":[]}\n```') },
    { icon: Dices, label: 'Таблица случайностей', run: () => block('```random\nНазвание таблицы\n- первый исход\n- второй исход\n- третий исход\n```') },
  ]
  return (
    <div className="kb-editor">
      <div className="kb-tools" role="toolbar" aria-label="Разметка">
        {TOOLS.map(({ icon: Icon, label, run }) => (
          <button key={label} type="button" onClick={run} title={label} aria-label={label}>
            <Icon aria-hidden="true" />
          </button>
        ))}
        {busy && <span className="kb-tools-busy">загружаем…</span>}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
      </div>
      <div className="kb-textwrap">
        <textarea
          ref={ta}
          className="kb-text"
          value={value}
          spellCheck
          placeholder={'Пишите как в Obsidian: # заголовок, [[ссылка]], - [ ] задача…\nКартинку можно вставить прямо из буфера.'}
          onChange={(e) => (onChange(e.target.value), checkSuggest(e.target.value, e.target.selectionStart))}
          onKeyDown={onKey}
          onPaste={onPaste}
          onClick={(e) => checkSuggest(value, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setSuggest(null), 150)}
        />
        {suggest && options.length > 0 && (
          <ul className="kb-suggest" role="listbox">
            {options.map((t, i) => (
              <li key={t}>
                <button type="button" className={i === pick ? 'is-on' : ''} onMouseDown={(e) => (e.preventDefault(), choose(t))}>
                  <FileText aria-hidden="true" /> {t}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ---------- страница ---------- */

function PageView({ note, lookup, folders, onOpenTitle, onTag, backlinks }: { note: ScreenNote; lookup: PageLookup; folders: string[]; onOpenTitle: (t: string) => void; onTag: (t: string) => void; backlinks: ScreenNote[] }) {
  const kb = useKnowledge()!
  const [mode, setMode] = useState<'read' | 'edit'>(note.body.trim() ? 'read' : 'edit')
  const [draft, setDraft] = useState(note.body)
  const [title, setTitle] = useState(note.title)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle')
  const [iconPick, setIconPick] = useState(false)
  /** что не записалось из-за чужой правки: можно оставить своё */
  const lost = useRef<Partial<ScreenNote> | null>(null)
  const [side, setSide] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<Partial<ScreenNote> | null>(null)
  const cover = useRef<HTMLInputElement>(null)
  const { meta } = parsePage(draft)

  const flush = useCallback(async () => {
    const patch = pending.current
    if (!patch) return
    pending.current = null
    setState('saving')
    try {
      await kb.update(note.id, patch)
      setState('saved')
    } catch (e) {
      if (e instanceof NoteConflict) {
        lost.current = { ...lost.current, ...patch }
        setState('conflict')
      } else setState('error')
    }
  }, [kb, note.id])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void flush()
    },
    [flush],
  )
  const queue = (patch: Partial<ScreenNote>) => {
    pending.current = { ...pending.current, ...patch }
    setState('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }
  const setBody = (v: string) => {
    setDraft(v)
    queue({ body: v })
  }
  const setMeta = (patch: Partial<PageMeta>) => setBody(writePage({ ...parsePage(draft).meta, ...patch }, parsePage(draft).body))

  /** Переименование: ссылки [[Старое]] в других страницах переписываются одним пакетом */
  const renameTo = async (next: string) => {
    const t = next.trim() || 'Без названия'
    if (t === note.title) return
    const old = note.title
    const linked = (kb.notes ?? []).filter((n) => n.id !== note.id && linksOf(n.body).includes(norm(old)))
    try {
      await kb.updateMany([{ id: note.id, title: t }, ...linked.map((n) => ({ id: n.id, body: renameLinks(n.body, old, t) }))])
    } catch (e) {
      setState(e instanceof NoteConflict ? 'conflict' : 'error')
    }
  }
  const keepMine = async () => {
    const patch = { ...lost.current, body: draft, title }
    lost.current = null
    setState('saving')
    try {
      await kb.update(note.id, patch, true)
      setState('saved')
    } catch {
      setState('error')
    }
  }
  const takeTheirs = () => {
    lost.current = null
    setDraft(note.body)
    setTitle(note.title)
    setState('idle')
  }

  const outline = parseBlocks(parsePage(draft).body).filter((b): b is Extract<typeof b, { t: 'h' }> => b.t === 'h')
  const path = (note.folder ?? '').split('/').filter(Boolean)

  return (
    <article className={`kb-page${meta.width === 'wide' ? ' is-wide' : ''}${mode === 'edit' ? ' is-editing' : ''}`}>
      {meta.cover ? (
        <div className="kb-cover">
          <Img src={meta.cover} alt="" />
          <span className="kb-cover-tools">
            <button type="button" onClick={() => cover.current?.click()}>
              сменить обложку
            </button>
            <button type="button" onClick={() => setMeta({ cover: undefined })}>
              убрать
            </button>
          </span>
        </div>
      ) : null}
      <input
        ref={cover}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            setMeta({ cover: (await uploadMedia(f)).url })
          } catch {
            setState('error')
          }
        }}
      />
      <div className="kb-page-in">
        <div className="kb-crumbs">
          <BookOpen aria-hidden="true" />
          {path.length === 0 ? <i>корень</i> : path.map((p, i) => <span key={i}>{p}</span>)}
          <input
            className="kb-move"
            list="kb-folders"
            defaultValue={note.folder ?? ''}
            placeholder="папка/подпапка"
            title="Переложить в папку"
            onBlur={(e) => {
              const v = e.target.value.split('/').map((x) => x.trim()).filter(Boolean).join('/') || null
              if (v !== (note.folder ?? null)) void kb.update(note.id, { folder: v })
            }}
          />
          <datalist id="kb-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div className="kb-titlebar">
          <span className="kb-icon-wrap">
            <button type="button" className={`kb-icon${meta.icon ? '' : ' is-empty'}`} onClick={() => setIconPick((v) => !v)} title="Иконка страницы">
              {meta.icon ?? <FileText aria-hidden="true" />}
            </button>
            {iconPick && (
              <span className="kb-icons">
                {ICONS.map((i) => (
                  <button key={i} type="button" onClick={() => (setMeta({ icon: i }), setIconPick(false))}>
                    {i}
                  </button>
                ))}
                <button type="button" className="is-clear" onClick={() => (setMeta({ icon: undefined }), setIconPick(false))}>
                  без иконки
                </button>
              </span>
            )}
          </span>
          <input className="kb-title" value={title} maxLength={120} placeholder="Без названия" onChange={(e) => setTitle(e.target.value)} onBlur={() => void renameTo(title)} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
        </div>
        <div className="kb-pagebar">
          <div className="kb-modes" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'read'} className={mode === 'read' ? 'is-on' : ''} onClick={() => setMode('read')}>
              <BookOpen aria-hidden="true" /> чтение
            </button>
            <button type="button" role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-on' : ''} onClick={() => setMode('edit')}>
              <Pencil aria-hidden="true" /> правка
            </button>
          </div>
          {!meta.cover && (
            <button type="button" className="kb-chip" onClick={() => cover.current?.click()}>
              <ImagePlus aria-hidden="true" /> обложка
            </button>
          )}
          <button type="button" className="kb-chip" onClick={() => setMeta({ width: meta.width === 'wide' ? 'normal' : 'wide' })}>
            {meta.width === 'wide' ? 'узко' : 'широко'}
          </button>
          <span className="kb-spacer" />
          <small className={`kb-save is-${state}`}>{state === 'saving' ? 'записываем…' : state === 'saved' ? 'записано' : state === 'error' ? 'не записалось' : state === 'conflict' ? 'конфликт правок' : ''}</small>
          <button type="button" className={`kb-chip${note.pinned ? ' is-on' : ''}`} onClick={() => void kb.update(note.id, { pinned: !note.pinned })} title={note.pinned ? 'Убрать из закреплённых' : 'Закрепить: страница будет под рукой на дашборде'}>
            {note.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />} {note.pinned ? 'закреплено' : 'к себе'}
          </button>
          <button type="button" className={`kb-chip${note.shared ? ' is-share' : ''}`} onClick={() => void kb.update(note.id, { shared: !note.shared })} title={note.shared ? 'Игроки видят эту страницу' : 'Открыть страницу партии'}>
            {note.shared ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} {note.shared ? 'видят игроки' : 'показать партии'}
          </button>
          <button type="button" className="kb-chip is-quiet" onClick={() => setSide((v) => !v)} title="Связи и оглавление">
            <PanelRight aria-hidden="true" />
          </button>
          <button type="button" className="kb-chip is-danger" onClick={() => confirm(`Удалить «${note.title}»?`) && void kb.remove(note.id)} title="Удалить страницу">
            <Trash2 aria-hidden="true" />
          </button>
        </div>
        {state === 'conflict' && (
          <div className="kb-conflict" role="alert">
            <span>Эту страницу только что изменили в другой вкладке. Ваши последние правки не записаны.</span>
            <button type="button" className="kb-chip" onClick={takeTheirs}>
              взять свежую
            </button>
            <button type="button" className="kb-chip is-on" onClick={() => void keepMine()}>
              оставить мою
            </button>
          </div>
        )}
        {meta.tags.length > 0 && (
          <div className="kb-tags">
            {meta.tags.map((t) => (
              <button key={t} type="button" className="kb-tag" onClick={() => onTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className={`kb-columns${side ? ' has-side' : ''}`}>
          <div className={`kb-main${mode === 'edit' ? ' is-split' : ''}`}>
            {mode === 'edit' && <Editor value={parsePage(draft).body} onChange={(v) => setBody(writePage(parsePage(draft).meta, v))} titles={lookup.titles.filter((t) => t !== note.title)} />}
            <div className="kb-doc">
              {draft.trim() ? <MarkdownBody src={draft} pages={lookup} onOpen={onOpenTitle} onTag={onTag} onChange={setBody} /> : <p className="kb-hint">Пустая страница. Нажмите «правка» и начните писать.</p>}
            </div>
          </div>
          {side && (
            <aside className="kb-side">
              {outline.length > 1 && (
                <section>
                  <h4>Оглавление</h4>
                  <ul className="kb-outline">
                    {outline.map((h, i) => (
                      <li key={i} style={{ paddingLeft: `${(h.level - 1) * 0.8}rem` }}>
                        <button type="button" onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                          {h.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <h4>Ссылаются сюда</h4>
                {backlinks.length === 0 ? (
                  <p className="kb-hint">Пока никто. Напишите [[{note.title}]] на другой странице.</p>
                ) : (
                  <ul className="kb-backlinks">
                    {backlinks.map((b) => (
                      <li key={b.id}>
                        <button type="button" onClick={() => kb.setCurrent(b.id)}>
                          <b>
                            {iconOf(b) ? `${iconOf(b)} ` : ''}
                            {b.title}
                          </b>
                          <i>{plainText(b.body, 90)}</i>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          )}
        </div>
      </div>
    </article>
  )
}

/* ---------- рабочая область ---------- */

function KnowledgeWorkspace() {
  const kb = useKnowledge()!
  const notes = useMemo(() => kb.notes ?? [], [kb.notes])
  const [q, setQ] = useState('')
  const [graph, setGraph] = useState(false)
  const [newMenu, setNewMenu] = useState(false)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set())
  const byTitle = useMemo(() => new Map(notes.map((n) => [norm(n.title), n])), [notes])
  const current = notes.find((n) => n.id === kb.current) ?? null

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.kb-suggest')) kb.close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [kb])

  // открытая страница — раскрыть её папки
  useEffect(() => {
    if (!current?.folder) return
    const parts = current.folder.split('/')
    setOpenFolders((s) => {
      const next = new Set(s)
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')))
      return next
    })
  }, [current?.folder])

  const lookup = useMemo<PageLookup>(
    () => ({ has: (t) => byTitle.has(norm(t)), body: (t) => byTitle.get(norm(t))?.body ?? null, titles: notes.map((n) => n.title) }),
    [byTitle, notes],
  )
  const folders = useMemo(() => {
    const s = new Set<string>(extraFolders)
    for (const n of notes) if (n.folder) n.folder.split('/').forEach((_, i, a) => s.add(a.slice(0, i + 1).join('/')))
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [notes, extraFolders])
  const tree = useMemo(() => buildTree(notes, extraFolders), [notes, extraFolders])
  const pinned = notes.filter((n) => n.pinned)
  const edges = useMemo(() => {
    const out: { from: string; to: string }[] = []
    for (const n of notes) for (const l of linksOf(n.body)) {
      const t = byTitle.get(l)
      if (t && t.id !== n.id) out.push({ from: n.id, to: t.id })
    }
    return out
  }, [notes, byTitle])
  const backlinks = current ? notes.filter((n) => n.id !== current.id && linksOf(n.body).includes(norm(current.title))) : []

  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    if (s.startsWith('#')) return notes.filter((n) => tagsOf(n.body).includes(s.slice(1)))
    return notes.filter((n) => n.title.toLowerCase().includes(s) || n.body.toLowerCase().includes(s))
  }, [q, notes])

  /** Ссылка [[…]]: открыть страницу, а если её нет — создать рядом с текущей */
  const openTitle = async (t: string) => {
    const hit = byTitle.get(norm(t))
    if (hit) return kb.setCurrent(hit.id)
    const n = await kb.create({ title: t.trim(), folder: current?.folder ?? null })
    if (n) kb.setCurrent(n.id)
  }
  const newPage = async (tpl: (typeof TEMPLATES)[number], folder?: string) => {
    setNewMenu(false)
    const body = writePage({ tags: [], extra: {}, icon: tpl.icon || undefined }, tpl.body)
    const n = await kb.create({ title: tpl.name === 'Пустая страница' ? 'Новая страница' : tpl.name, folder: folder ?? (tpl.folder || current?.folder || null), body, order: notes.length })
    if (n) kb.setCurrent(n.id)
    setGraph(false)
  }
  const toggle = (p: string) =>
    setOpenFolders((s) => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  return createPortal(
    <div className="kb-layer" role="dialog" aria-label="База знаний">
      <div className="kb-shell">
        <aside className="kb-nav">
          <header className="kb-brand">
            <BookOpen aria-hidden="true" />
            <b>Кодекс кампании</b>
            <button type="button" className="tb-card-x" onClick={kb.close} aria-label="Закрыть базу знаний">
              <X aria-hidden="true" />
            </button>
          </header>
          <label className="kb-search">
            <Search aria-hidden="true" />
            <input type="search" value={q} placeholder="Поиск или #тег" onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="kb-nav-acts">
            <span className="kb-new-wrap">
              <button type="button" className="kb-new" onClick={() => setNewMenu((v) => !v)} aria-expanded={newMenu}>
                <FilePlus2 aria-hidden="true" /> страница
              </button>
              {newMenu && (
                <span className="kb-new-menu">
                  {TEMPLATES.map((t) => (
                    <button key={t.name} type="button" onClick={() => void newPage(t)}>
                      <span>{t.icon || <FileText aria-hidden="true" />}</span> {t.name}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <button type="button" className="kb-new is-quiet" onClick={() => setNewFolder('')} title="Новая папка">
              <FolderPlus aria-hidden="true" />
            </button>
            <button type="button" className={`kb-new is-quiet${graph ? ' is-on' : ''}`} onClick={() => setGraph((v) => !v)} title="Граф связей">
              <Network aria-hidden="true" />
            </button>
          </div>
          {newFolder != null && (
            <form
              className="kb-newfolder"
              onSubmit={(e) => {
                e.preventDefault()
                const p = newFolder.split('/').map((x) => x.trim()).filter(Boolean).join('/')
                if (p) {
                  setExtraFolders((l) => [...new Set([...l, p])])
                  setOpenFolders((s) => new Set([...s, p]))
                }
                setNewFolder(null)
              }}
            >
              <Folder aria-hidden="true" />
              <input autoFocus value={newFolder} placeholder="Локации/Север" onChange={(e) => setNewFolder(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
            </form>
          )}
          <div className="kb-tree" onDragOver={(e) => e.dataTransfer.types.includes('text/x-kb-page') && e.preventDefault()} onDrop={(e) => e.target === e.currentTarget && void kb.update(e.dataTransfer.getData('text/x-kb-page'), { folder: null })}>
            {kb.notes == null && !kb.error && <p className="kb-hint">Открываем архив…</p>}
            {kb.error && <p className="tb-err">{kb.error}</p>}
            {found ? (
              <ul>
                {found.length === 0 && <li className="kb-hint">Ничего не нашли</li>}
                {found.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={`kb-row is-found${current?.id === n.id ? ' is-on' : ''}`} onClick={() => (kb.setCurrent(n.id), setGraph(false))}>
                      <span className="kb-row-icon">{iconOf(n) ?? <FileText aria-hidden="true" />}</span>
                      <span className="kb-row-title">
                        {n.title}
                        <i>{plainText(n.body, 70)}</i>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {pinned.length > 0 && (
                  <section className="kb-pinned">
                    <h4>
                      <Pin aria-hidden="true" /> Закреплено
                    </h4>
                    {pinned.map((n) => (
                      <PageRow key={n.id} n={n} current={current?.id === n.id} onOpen={() => (kb.setCurrent(n.id), setGraph(false))} />
                    ))}
                  </section>
                )}
                <ul>
                  {tree.folders.map((f) => (
                    <FolderNode
                      key={f.path}
                      f={f}
                      depth={0}
                      current={current?.id ?? null}
                      openFolders={openFolders}
                      toggle={toggle}
                      onOpen={(id) => (kb.setCurrent(id), setGraph(false))}
                      onDrop={(id, folder) => id && void kb.update(id, { folder })}
                      onNew={(folder) => void newPage(TEMPLATES[0], folder)}
                    />
                  ))}
                  {tree.pages.map((n) => (
                    <li key={n.id}>
                      <PageRow n={n} current={current?.id === n.id} onOpen={() => (kb.setCurrent(n.id), setGraph(false))} />
                    </li>
                  ))}
                </ul>
                {notes.length === 0 && kb.notes != null && <p className="kb-hint">Архив пуст. Начните с шаблона: «страница» → «Локация».</p>}
              </>
            )}
          </div>
        </aside>
        <main className="kb-stage">
          {graph ? (
            <KnowledgeGraph
              nodes={notes.map((n) => ({ id: n.id, title: n.title, folder: n.folder ?? '', icon: iconOf(n) }))}
              edges={edges}
              current={current?.id ?? null}
              onOpen={(id) => (kb.setCurrent(id), setGraph(false))}
            />
          ) : current ? (
            <PageView key={current.id} note={current} lookup={lookup} folders={folders} onOpenTitle={(t) => void openTitle(t)} onTag={(t) => setQ(`#${t}`)} backlinks={backlinks} />
          ) : (
            <div className="kb-welcome">
              <BookOpen aria-hidden="true" />
              <h2>Кодекс кампании</h2>
              <p>Персонажи, места, тайны и доски расследований — всё, что вы готовите между играми. Страницы связываются ссылками [[…]], а граф покажет, как всё переплетено.</p>
              <div className="kb-welcome-tpl">
                {TEMPLATES.slice(1).map((t) => (
                  <button key={t.name} type="button" onClick={() => void newPage(t)}>
                    <span>{t.icon}</span>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>,
    document.body,
  )
}

/* ---------- закреплённое: для дашборда ---------- */

export function PinnedPages() {
  const kb = useKnowledge()
  const pinned = (kb?.notes ?? []).filter((n) => n.pinned)
  if (!kb) return null
  return (
    <div className="kb-pins">
      {pinned.length === 0 ? (
        <p className="kb-hint">Закрепите страницу кнопкой «к себе» — она появится здесь.</p>
      ) : (
        pinned.map((n) => (
          <button key={n.id} type="button" className="kb-pin-card" onClick={() => kb.open(n.id)}>
            <b>
              {iconOf(n) ? `${iconOf(n)} ` : ''}
              {n.title}
            </b>
            <i>{plainText(n.body, 140)}</i>
          </button>
        ))
      )}
      <button type="button" className="kb-open-all" onClick={() => kb.open()}>
        <BookOpen aria-hidden="true" /> открыть кодекс
      </button>
    </div>
  )
}
