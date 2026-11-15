/**
 * База знаний мастера: не стикеры на ширме, а свой вики-архив кампании.
 * Дерево папок, страницы в markdown со ссылками [[…]], обратные ссылки, граф
 * связей, доски с фото и таблицы случайностей прямо в страницах.
 *
 * Хранится в заметках ширмы как есть: title — название, folder — путь
 * «Локации/Север», body — markdown с шапкой (иконка, обложка, теги). Сервер
 * менять не нужно; всё можно выгрузить в Obsidian.
 */
import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  Eye,
  FilePlus2,
  FileText,
  Network,
  Pin,
  PinOff,
  ScrollText,
  X,
} from 'lucide-react'
import type { ScreenNote } from '../../types/rooms'
import { DirectoryList } from '../../ui/directory/DirectoryList'
import { folderPath } from '../../ui/directory/model'
import { useDirectory } from '../../ui/directory/useDirectory'
import { KnowledgeGraph } from './Graph'
import { type PageLookup } from './Markdown'
import { embedsOf, linksOf, plainText, tagsOf, writePage } from './mdparse'
import { QuestLog } from './PageTypes'
import { typePatch } from './pageKinds'
import { norm, useKnowledge } from './context'
import { iconOf } from './tree'
import { PageRow } from './TreeView'
import { TEMPLATES } from './templates'
import { PageView } from './PageView'
import { useKeybinding } from '../../input/useKeybinding'

/* ---------- рабочая область ---------- */

export function KnowledgeWorkspace() {
  const kb = useKnowledge()!
  const notes = useMemo(() => kb.notes ?? [], [kb.notes])
  const [q, setQ] = useState('')
  const [graph, setGraph] = useState(false)
  const [quests, setQuests] = useState(false)
  const closeViews = () => {
    setGraph(false)
    setQuests(false)
  }
  const [newMenu, setNewMenu] = useState(false)
  const byTitle = useMemo(() => new Map(notes.map((n) => [norm(n.title), n])), [notes])
  const current = notes.find((n) => n.id === kb.current) ?? null

  useKeybinding('dialog.close', () => {
    if (!document.querySelector('.kb-suggest')) kb.close()
  })

  // Папки — общая директория (src/ui/directory): путь страницы остаётся строкой folder,
  // а перенос — пакетная правка страниц с проверкой ревизий.
  const { updateMany, reload } = kb
  const moveItems = useCallback(
    async (ids: string[], path: string, order: string[] | null) => {
      const patch = new Map<string, Partial<ScreenNote> & { id: string }>()
      for (const id of ids) patch.set(id, { id, folder: path || null })
      order?.forEach((id, i) => patch.set(id, { ...(patch.get(id) ?? { id }), order: i }))
      await updateMany([...patch.values()])
    },
    [updateMany],
  )
  const reloadNotes = useCallback(() => void reload().catch(() => undefined), [reload])
  const dir = useDirectory('kb', { paths: notes.map((n) => n.folder), moveItems, onChanged: reloadNotes })
  const { folderOf } = dir
  const entries = useMemo(() => notes.map((n) => ({ ...n, name: n.title || 'Без названия', folderId: folderOf(n), sortOrder: n.order })), [notes, folderOf])

  const lookup = useMemo<PageLookup>(
    () => ({
      has: (t) => byTitle.has(norm(t)),
      body: (t) => byTitle.get(norm(t))?.body ?? null,
      titles: notes.map((n) => n.title),
      byId: (id) => {
        const n = notes.find((x) => x.id === id)
        return n ? { title: n.title, body: n.body, revealed: n.revealed_secrets ?? [] } : null
      },
    }),
    [byTitle, notes],
  )
  const folders = useMemo(() => [...new Set(dir.folders.map((f) => f.path ?? folderPath(dir.folders, f.id)))].sort((a, b) => a.localeCompare(b, 'ru')), [dir.folders])
  const pinned = notes.filter((n) => n.pinned)
  const edges = useMemo(() => {
    const out: { from: string; to: string }[] = []
    const ids = new Set(notes.map((n) => n.id))
    for (const n of notes) {
      for (const l of linksOf(n.body)) {
        const t = byTitle.get(l)
        if (t && t.id !== n.id) out.push({ from: n.id, to: t.id })
      }
      // @Embed[page:id] — тоже связь
      for (const e of embedsOf(n.body)) if (e.kind === 'page' && e.id !== n.id && ids.has(e.id)) out.push({ from: n.id, to: e.id })
    }
    return out
  }, [notes, byTitle])
  const backlinks = current ? notes.filter((n) => n.id !== current.id && linksOf(n.body).includes(norm(current.title))) : []

  /** Поиск по названию и тексту, «#тег» — по тегам */
  const match = useCallback((n: ScreenNote, query: string) => {
    const s = query.trim().toLowerCase()
    if (s.startsWith('#')) return tagsOf(n.body).includes(s.slice(1))
    return n.title.toLowerCase().includes(s) || n.body.toLowerCase().includes(s)
  }, [])

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
    const typed = tpl.type ? typePatch({}, tpl.type) : {}
    const n = await kb.create({ title: tpl.name === 'Пустая страница' ? 'Новая страница' : tpl.name, folder: folder ?? (tpl.folder || current?.folder || null), body, order: notes.length, ...typed })
    if (n) kb.setCurrent(n.id)
    setGraph(false)
    setQuests(false)
  }

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
          <div className="kb-tree">
            {kb.notes == null && !kb.error && <p className="kb-hint">Открываем архив…</p>}
            {kb.error && <p className="tb-err">{kb.error}</p>}
            {pinned.length > 0 && !q.trim() && (
              <section className="kb-pinned">
                <h4>
                  <Pin aria-hidden="true" /> Закреплено
                </h4>
                {pinned.map((n) => (
                  <PageRow key={n.id} n={n} current={current?.id === n.id} onOpen={() => (kb.setCurrent(n.id), closeViews())} />
                ))}
              </section>
            )}
            <DirectoryList
              listId="kb"
              label="Страницы кодекса"
              items={entries}
              folders={dir.folders}
              ops={dir.ops}
              selectedId={current?.id ?? null}
              query={q}
              onQueryChange={setQ}
              match={match}
              searchPlaceholder="Поиск или #тег"
              defaultSort="manual"
              onCreate={(folderId) => void newPage(TEMPLATES[0], folderPath(dir.folders, folderId) || undefined)}
              createLabel="Страница"
              createInHeader={false}
              toolbar={
                <>
                  <span className="kb-new-wrap">
                    <button type="button" className="dir-btn is-main" onClick={() => setNewMenu((v) => !v)} aria-expanded={newMenu}>
                      <FilePlus2 aria-hidden="true" /> Страница
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
                  <button type="button" className={`dir-icon-btn${graph ? ' is-on' : ''}`} aria-pressed={graph} onClick={() => (setGraph((v) => !v), setQuests(false))} title="Граф связей" aria-label="Граф связей">
                    <Network aria-hidden="true" />
                  </button>
                  <button type="button" className={`dir-icon-btn${quests ? ' is-on' : ''}`} aria-pressed={quests} onClick={() => (setQuests((v) => !v), setGraph(false))} title="Квесты" aria-label="Квесты">
                    <ScrollText aria-hidden="true" />
                  </button>
                </>
              }
              renderItem={(n) => (
                <>
                  <span className="kb-row-icon">{iconOf(n) ?? <FileText aria-hidden="true" />}</span>
                  <span className="dir-name">{n.name}</span>
                  {n.shared && <Eye className="kb-row-mark" aria-label="видят игроки" />}
                  {n.pinned && <Pin className="kb-row-mark" aria-label="закреплена" />}
                </>
              )}
              onItemDragStart={(n, e) => {
                e.dataTransfer.setData('text/x-kb-page', n.id)
                // в текст страницы падает ссылка [[…]]
                e.dataTransfer.setData('text/plain', `[[${n.title}]]`)
              }}
              actions={{
                open: (n) => (kb.setCurrent(n.id), closeViews()),
                extra: (n) => [
                  { id: 'pin', label: n.pinned ? 'Открепить' : 'Закрепить', icon: n.pinned ? <PinOff /> : <Pin />, run: () => void kb.update(n.id, { pinned: !n.pinned }).catch(() => undefined) },
                ],
                rename: (n, title) => kb.update(n.id, { title }),
                duplicate: async (n) => {
                  const copy = await kb.create({
                    title: `${n.title} (копия)`,
                    body: n.body,
                    folder: n.folder,
                    order: n.order + 1,
                    page_type: n.page_type,
                    quest: n.quest,
                    npc: n.npc,
                    shop: n.shop,
                  })
                  if (copy) kb.setCurrent(copy.id)
                },
                permissions: 'notes',
                exportJson: (n) => notes.find((y) => y.id === n.id) ?? n,
                remove: (n) => kb.remove(n.id),
              }}
              empty={notes.length === 0 && kb.notes != null ? <p className="kb-hint">Архив пуст. Начните с шаблона: «Страница» → «Локация».</p> : null}
            />
            {dir.error && <p className="tb-err">{dir.error}</p>}
          </div>
        </aside>
        <main className="kb-stage">
          {quests ? (
            <div className="kb-quests-stage">
              <h2>Квесты</h2>
              <QuestLog notes={notes} onOpen={(id) => (kb.setCurrent(id), setQuests(false))} empty="Квестов пока нет: «страница» → «Квест»." />
            </div>
          ) : graph ? (
            <KnowledgeGraph
              nodes={notes.map((n) => ({ id: n.id, title: n.title, folder: n.folder ?? '', icon: iconOf(n) }))}
              edges={edges}
              current={current?.id ?? null}
              onOpen={(id) => (kb.setCurrent(id), closeViews())}
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
