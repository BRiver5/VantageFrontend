/**
 * Ширма мастера (только мастеру): заметки, свои предметы-шаблоны, карты.
 * Всё это хранится на сервере комнаты и никому, кроме мастера, не приходит.
 * Карты пока только хранятся: бой на карте — позже.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Map as MapIcon, NotebookPen, Package, Pin, PinOff, Plus, Presentation, Star, Trash2, Upload } from 'lucide-react'
import { ApiError, uploadMedia } from '../api'
import { SheetModal } from '../characters/SheetModal'
import type { BattleMap, ItemKind, ItemTarget, ScreenItemTemplate, ScreenNote } from '../types/rooms'
import { showToAll } from './Content'
import { useRoom } from './RoomProvider'
import { createMap, createNote, createTemplate, deleteMap, deleteNote, deleteTemplate, issueTemplate, listMaps, listNotes, listTemplates, patchMap, patchNote, patchTemplate } from './roomsApi'
import { Field } from './ui'

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Ошибка сервера')

/** Список из REST с перечитыванием после своих правок (событий у ширмы нет — она только у мастера) */
function useScreenList<T>(load: (roomId: string) => Promise<T[]>) {
  const { roomId } = useRoom()
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setItems(await load(roomId))
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [load, roomId])
  useEffect(() => {
    // загрузка при входе: setState внутри reload идёт после await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])
  return { items, error, reload, setError }
}

/* ---------- заметки ---------- */

function NoteDialog({ note, onClose, onSaved }: { note: ScreenNote | null; onClose: () => void; onSaved: () => void }) {
  const { roomId } = useRoom()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [folder, setFolder] = useState(note?.folder ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = { title: title.trim() || 'Без названия', body, folder: folder.trim() || null }
      if (note) await patchNote(roomId, note.id, data)
      else await createNote(roomId, data)
      onSaved()
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }
  return (
    <SheetModal
      title={note ? 'Заметка' : 'Новая заметка'}
      kicker="ширма"
      tone="action"
      visual={<NotebookPen className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="rm-form">
        <Field label="Название">
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Папка" hint="Например: Сюжет, Города, Враги. Пусто — без папки">
          <input value={folder} maxLength={60} onChange={(e) => setFolder(e.target.value)} />
        </Field>
        <Field label="Текст">
          <textarea className="rm-textarea" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

export function NotesPanel({ bare = false, readOnly = false }: { bare?: boolean; readOnly?: boolean }) {
  const { roomId } = useRoom()
  const { items, error, reload, setError } = useScreenList(listNotes)
  const [edit, setEdit] = useState<ScreenNote | 'new' | null>(null)

  const sorted = [...(items ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.folder ?? '').localeCompare(b.folder ?? '') || a.order - b.order)
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(errText(e))
    }
  }
  const move = (n: ScreenNote, dir: -1 | 1) => {
    const peers = sorted.filter((x) => x.pinned === n.pinned && (x.folder ?? '') === (n.folder ?? ''))
    const i = peers.findIndex((x) => x.id === n.id)
    const other = peers[i + dir]
    if (!other) return
    void run(() => Promise.all([patchNote(roomId, n.id, { order: other.order }), patchNote(roomId, other.id, { order: n.order })]))
  }

  let lastFolder: string | null | undefined
  return (
    <div className={bare ? 'rm-notes' : 'rm-panel rm-notes'}>
      <h3 className="rm-panel-title">
        <NotebookPen aria-hidden="true" /> Заметки{items ? ` · ${items.length}` : ''}
        {!readOnly && (
          <button type="button" className="cw-mini-btn rm-title-act" onClick={() => setEdit('new')}>
            <Plus aria-hidden="true" /> заметка
          </button>
        )}
      </h3>
      {items && items.length === 0 && <p className="rm-hint">Пока пусто. Здесь удобно держать сюжет, имена NPC и подсказки — игроки их не видят.</p>}
      <ul className="rm-note-list">
        {sorted.map((n) => {
          const head = n.pinned ? null : (n.folder ?? 'Без папки')
          const showHead = head !== lastFolder && head !== null
          lastFolder = n.pinned ? lastFolder : head
          return (
            <li key={n.id}>
              {showHead && <h4 className="rm-folder">{head}</h4>}
              <details className="rm-note">
                <summary>
                  {n.pinned && <Pin aria-label="закреплена" />}
                  <b>{n.title}</b>
                </summary>
                <p>{n.body || <i>Пустая заметка</i>}</p>
                {!readOnly && (
                  <span className="rm-note-acts">
                    <button type="button" className="cw-mini-btn" onClick={() => setEdit(n)}>
                      править
                    </button>
                    <button type="button" className="cw-mini-btn" onClick={() => void run(() => patchNote(roomId, n.id, { pinned: !n.pinned }))} aria-label={n.pinned ? 'Открепить' : 'Закрепить'}>
                      {n.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                    </button>
                    <button type="button" className="cw-mini-btn" onClick={() => move(n, -1)} aria-label="Выше">
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className="cw-mini-btn" onClick={() => move(n, 1)} aria-label="Ниже">
                      <ArrowDown aria-hidden="true" />
                    </button>
                    <button type="button" className="cw-mini-btn cw-mini-btn--danger" onClick={() => confirm(`Удалить «${n.title}»?`) && void run(() => deleteNote(roomId, n.id))} aria-label="Удалить">
                      <Trash2 aria-hidden="true" />
                    </button>
                  </span>
                )}
              </details>
            </li>
          )
        })}
      </ul>
      {error && <p className="auth-error">{error}</p>}
      {edit && <NoteDialog note={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => void reload()} />}
    </div>
  )
}

/* ---------- шаблоны предметов ---------- */

const KINDS: { key: ItemKind; label: string }[] = [
  { key: 'equipment', label: 'Снаряжение' },
  { key: 'magic_item', label: 'Магический предмет' },
]

function TemplateDialog({ tpl, onClose, onSaved }: { tpl: ScreenItemTemplate | null; onClose: () => void; onSaved: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState(tpl?.name ?? '')
  const [description, setDescription] = useState(tpl?.description ?? '')
  const [kind, setKind] = useState<ItemKind>(tpl?.base_kind ?? 'equipment')
  const [tags, setTags] = useState(tpl?.tags.join(', ') ?? '')
  const [image, setImage] = useState<string | null>(tpl?.image_url ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!name.trim()) return setError('Назовите предмет')
    setBusy(true)
    setError(null)
    try {
      const data = { name: name.trim(), description, base_kind: kind, image_url: image, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }
      if (tpl) await patchTemplate(roomId, tpl.id, data)
      else await createTemplate(roomId, data)
      onSaved()
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }
  const upload = async (f: File | undefined) => {
    if (!f) return
    try {
      setImage((await uploadMedia(f)).url)
    } catch (e) {
      setError(errText(e))
    }
  }
  return (
    <SheetModal
      title={tpl ? 'Свой предмет' : 'Новый предмет'}
      kicker="шаблон ширмы"
      tone="action"
      visual={<Package className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="rm-form">
        <Field label="Название">
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Тип">
          <div className="rm-seg" role="radiogroup" aria-label="Тип предмета">
            {KINDS.map((k) => (
              <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} className={kind === k.key ? 'is-on' : ''} onClick={() => setKind(k.key)}>
                {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Описание">
          <textarea className="rm-textarea" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Метки" hint="Через запятую: оружие, квест, трофей">
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <label className="rm-upload">
          <Upload aria-hidden="true" /> {image ? 'Заменить картинку' : 'Добавить картинку'}
          <input type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
        {image && <img className="rm-upload-prev" src={image} alt="" />}
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

function IssueTemplateDialog({ tpl, onClose }: { tpl: ScreenItemTemplate; onClose: () => void }) {
  const { roomId, data } = useRoom()
  const [target, setTarget] = useState<ItemTarget>('table')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  return (
    <SheetModal
      title={tpl.name}
      kicker="выдать"
      tone="action"
      visual={<Package className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            {done ? 'Готово' : 'Отмена'}
          </button>
          <button
            type="button"
            className="cs-btn cw-next"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await issueTemplate(roomId, tpl.id, { quantity: qty, target })
                setDone(true)
              } catch (e) {
                setError(errText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Выдать ×{qty}
          </button>
        </>
      }
    >
      <div className="rm-form">
        <Field label="Кому">
          <select className="rm-select" value={target} onChange={(e) => setTarget(e.target.value as ItemTarget)}>
            <option value="table">На стол (все видят)</option>
            <option value="screen">За ширму (только вы)</option>
            {data?.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Количество">
          <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
        </Field>
        {done && <p className="auth-ok">Выдано: {tpl.name}</p>}
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

export function TemplatesPanel({ bare = false }: { bare?: boolean }) {
  const { roomId } = useRoom()
  const { items, error, reload, setError } = useScreenList(listTemplates)
  const [edit, setEdit] = useState<ScreenItemTemplate | 'new' | null>(null)
  const [issue, setIssue] = useState<ScreenItemTemplate | null>(null)
  return (
    <div className={bare ? 'rm-templates' : 'rm-panel rm-templates'}>
      <h3 className="rm-panel-title">
        <Package aria-hidden="true" /> Свои предметы{items ? ` · ${items.length}` : ''}
        <button type="button" className="cw-mini-btn rm-title-act" onClick={() => setEdit('new')}>
          <Plus aria-hidden="true" /> предмет
        </button>
      </h3>
      {items && items.length === 0 && <p className="rm-hint">Придумайте свой предмет один раз — выдавайте сколько угодно раз на стол, за ширму или герою.</p>}
      <ul className="rm-tpl-list">
        {(items ?? []).map((t) => (
          <li key={t.id}>
            <span className="rm-tpl-art">{t.image_url ? <img src={t.image_url} alt="" /> : <Package aria-hidden="true" />}</span>
            <span className="rm-tpl-body">
              <b>{t.name}</b>
              <i>{[KINDS.find((k) => k.key === t.base_kind)?.label, ...t.tags].filter(Boolean).join(' · ')}</i>
              {t.description && <small>{t.description.slice(0, 120)}</small>}
            </span>
            <span className="rm-tpl-acts">
              <button type="button" className="cs-btn" onClick={() => setIssue(t)}>
                Выдать
              </button>
              <button type="button" className="cw-mini-btn" onClick={() => setEdit(t)}>
                править
              </button>
              <button
                type="button"
                className="cw-mini-btn cw-mini-btn--danger"
                aria-label="Удалить"
                onClick={() => confirm(`Удалить «${t.name}»?`) && void deleteTemplate(roomId, t.id).then(reload, (e) => setError(errText(e)))}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="auth-error">{error}</p>}
      {edit && <TemplateDialog tpl={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => void reload()} />}
      {issue && <IssueTemplateDialog tpl={issue} onClose={() => setIssue(null)} />}
    </div>
  )
}

/* ---------- карты ---------- */

function MapDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [cols, setCols] = useState(30)
  const [rows, setRows] = useState(20)
  const [cell, setCell] = useState(50)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const upload = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      setImage((await uploadMedia(f)).url)
      setName((n) => n || f.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const clamp = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)))
  return (
    <SheetModal
      title="Новая карта"
      kicker="ширма"
      tone="action"
      visual={<MapIcon className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="cs-btn cw-next"
            disabled={busy || !image}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await createMap(roomId, { name: name.trim() || 'Карта', image_url: image, grid: { cols, rows, cell_px: cell, offset_x: 0, offset_y: 0 } })
                onSaved()
                onClose()
              } catch (e) {
                setError(errText(e))
                setBusy(false)
              }
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="rm-form">
        <label className="rm-upload">
          <Upload aria-hidden="true" /> {image ? 'Заменить картинку' : 'Загрузить картинку карты'}
          <input type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
        {image && <img className="rm-upload-prev" src={image} alt="" />}
        <Field label="Название">
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="rm-flags">
          <Field label="Клеток в ширину">
            <input type="number" value={cols} min={1} max={200} onChange={(e) => setCols(clamp(e.target.value, 1, 200))} />
          </Field>
          <Field label="Клеток в высоту">
            <input type="number" value={rows} min={1} max={200} onChange={(e) => setRows(clamp(e.target.value, 1, 200))} />
          </Field>
          <Field label="Размер клетки, px">
            <input type="number" value={cell} min={8} max={400} onChange={(e) => setCell(clamp(e.target.value, 8, 400))} />
          </Field>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

export function MapsPanel({ bare = false, onlyQuick = false }: { bare?: boolean; onlyQuick?: boolean }) {
  const { roomId } = useRoom()
  const { items, error, reload, setError } = useScreenList(listMaps)
  const [adding, setAdding] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const list = (items ?? []).filter((m) => !onlyQuick || m.quick_access)
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    try {
      await fn()
      after?.()
    } catch (e) {
      setError(errText(e))
    }
  }
  return (
    <div className={bare ? 'rm-maps' : 'rm-panel rm-maps'}>
      <h3 className="rm-panel-title">
        <MapIcon aria-hidden="true" /> Карты{items ? ` · ${list.length}` : ''}
        {!onlyQuick && (
          <button type="button" className="cw-mini-btn rm-title-act" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" /> карта
          </button>
        )}
      </h3>
      {items && list.length === 0 && <p className="rm-hint">{onlyQuick ? 'Отметьте карту звездой в разделе «Ширма → Карты».' : 'Загрузите карты подземелий и городов. Показать игрокам можно сразу из списка.'}</p>}
      <ul className="rm-map-list">
        {list.map((m: BattleMap) => (
          <li key={m.id}>
            <span className="rm-map-art">{m.image_url ? <img src={m.image_url} alt="" /> : <MapIcon aria-hidden="true" />}</span>
            <span className="rm-map-body">
              <b>{m.name}</b>
              <i>
                {m.grid.cols}×{m.grid.rows} клеток
              </i>
            </span>
            <span className="rm-map-acts">
              <button
                type="button"
                className="cs-btn"
                disabled={!m.image_url}
                onClick={() => void act(() => showToAll(roomId, m.image_url ?? '', m.name), () => setSent(m.id))}
                title="Загрузить всем и показать"
              >
                <Presentation aria-hidden="true" /> {sent === m.id ? 'Показано' : 'Показать'}
              </button>
              {!onlyQuick && (
                <>
                  <button type="button" className={`cw-mini-btn${m.quick_access ? ' is-on' : ''}`} aria-pressed={m.quick_access} aria-label="Быстрый доступ" title="Быстрый доступ" onClick={() => void act(() => patchMap(roomId, m.id, { quick_access: !m.quick_access }), () => void reload())}>
                    <Star aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="cw-mini-btn cw-mini-btn--danger"
                    aria-label="Удалить"
                    onClick={() => confirm(`Удалить «${m.name}»?`) && void act(() => deleteMap(roomId, m.id), () => void reload())}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="auth-error">{error}</p>}
      {adding && <MapDialog onClose={() => setAdding(false)} onSaved={() => void reload()} />}
    </div>
  )
}
