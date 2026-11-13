import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import { uploadMedia } from '../../api'
import { Img } from '../../media'
import type { ScreenNote } from '../../types/rooms'
import { MarkdownBody, type PageLookup } from './Markdown'
import { linksOf, parseBlocks, parsePage, plainText, renameLinks, writePage, type PageMeta } from './mdparse'
import { NoteConflict, norm, useKnowledge } from './context'
import { iconOf } from './tree'
import { ICONS } from './templates'
import { Editor } from './Editor'
import { PageMapChips } from '../../maps/notes/PageMapChips'

/* ---------- страница ---------- */

export function PageView({ note, lookup, folders, onOpenTitle, onTag, backlinks }: { note: ScreenNote; lookup: PageLookup; folders: string[]; onOpenTitle: (t: string) => void; onTag: (t: string) => void; backlinks: ScreenNote[] }) {
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
          <PageMapChips pageId={note.id} title={note.title} onClose={kb.close} />
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
