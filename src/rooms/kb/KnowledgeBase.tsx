/**
 * База знаний мастера: не стикеры на ширме, а свой вики-архив кампании.
 * Дерево папок, страницы в markdown со ссылками [[…]], обратные ссылки, граф
 * связей, доски с фото и таблицы случайностей прямо в страницах.
 *
 * Хранится в заметках ширмы как есть: title — название, folder — путь
 * «Локации/Север», body — markdown с шапкой (иконка, обложка, теги). Сервер
 * менять не нужно; всё можно выгрузить в Obsidian.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Network,
  Pin,
  Search,
  X,
} from 'lucide-react'
import { KnowledgeGraph } from './Graph'
import { type PageLookup } from './Markdown'
import { linksOf, plainText, tagsOf, writePage } from './mdparse'
import { norm, useKnowledge } from './context'
import { buildTree, iconOf } from './tree'
import { FolderNode, PageRow } from './TreeView'
import { TEMPLATES } from './templates'
import { PageView } from './PageView'

/* ---------- рабочая область ---------- */

export function KnowledgeWorkspace() {
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
