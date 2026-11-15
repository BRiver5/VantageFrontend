/**
 * Створка ширмы «Таблицы»: слева директория (src/ui/directory) — папки, поиск,
 * перетаскивание, меню; справа выбранная
 * таблица — в режиме броска или в редакторе. Новую таблицу можно собрать из
 * папки базы знаний, заготовок предметов с тегом или существ комнаты.
 */
import { useMemo, useState } from 'react'
import { Eye, FolderInput, PenLine, Table2 } from 'lucide-react'
import { DirectoryList } from '../../ui/directory/DirectoryList'
import { folderPath } from '../../ui/directory/model'
import { useDirectory } from '../../ui/directory/useDirectory'
import { useList } from '../table/dm/common'
import { useRoom } from '../RoomProvider'
import { errText } from '../table/parts'
import { createTable, deleteTable, listTables, patchTable, tableFromFolder, type FromFolderBody } from './api'
import { TableEditor } from './TableEditor'
import { TableView } from './TableView'
import type { RollTable } from './types'

const SOURCE_RU: Record<FromFolderBody['source'], string> = { kb_page: 'Страницы базы знаний', item: 'Заготовки предметов', creature: 'Существа комнаты' }

function FromFolder({ onCreated, onClose }: { onCreated: (t: RollTable) => void; onClose: () => void }) {
  const { roomId } = useRoom()
  const [source, setSource] = useState<FromFolderBody['source']>('kb_page')
  const [folder, setFolder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="rt-folder"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          onCreated(await tableFromFolder(roomId, { source, folder: folder.trim() || null }))
          onClose()
        } catch (err) {
          setError(errText(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label>
        Откуда
        <select value={source} onChange={(e) => setSource(e.target.value as FromFolderBody['source'])}>
          {(Object.keys(SOURCE_RU) as FromFolderBody['source'][]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_RU[s]}
            </option>
          ))}
        </select>
      </label>
      {source !== 'creature' && (
        <label>
          {source === 'kb_page' ? 'Папка' : 'Тег'}
          <input value={folder} placeholder={source === 'kb_page' ? 'Город/Таверны (пусто — все)' : 'пусто — все'} onChange={(e) => setFolder(e.target.value)} />
        </label>
      )}
      <footer>
        <button type="button" className="tb-linkbtn" onClick={onClose}>
          отмена
        </button>
        <button type="submit" className="tb-goldbtn" disabled={busy}>
          Собрать
        </button>
      </footer>
      {error && <p className="tb-err">{error}</p>}
    </form>
  )
}

export function LeafTables() {
  const { roomId } = useRoom()
  const list = useList<RollTable>(listTables)
  const [pick, setPick] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [folderForm, setFolderForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tables = list.items ?? []
  const current = tables.find((t) => t.id === pick) ?? null

  const upsert = (t: RollTable) => list.setItems((xs) => (xs?.some((x) => x.id === t.id) ? xs.map((x) => (x.id === t.id ? t : x)) : [...(xs ?? []), t]))

  const dir = useDirectory('tables', { paths: tables.map((t) => t.folder), onChanged: list.reload })
  const entries = useMemo(() => tables.map((t) => ({ ...t, folderId: dir.folderOf(t), sortOrder: dir.sortOf(t.id) })), [tables, dir.folderOf, dir.sortOf])

  const create = async (folderId: string | null = null) => {
    setError(null)
    try {
      const t = await createTable(roomId, { name: 'Новая таблица', results: [], folder: folderPath(dir.folders, folderId) || null })
      upsert(t)
      setPick(t.id)
      setEditing(true)
    } catch (e) {
      setError(errText(e))
    }
  }

  return (
    <div className="rt-leaf">
      <nav className="rt-side" aria-label="Таблицы">
        <DirectoryList
          listId="tables"
          label="Таблицы"
          items={entries}
          folders={dir.folders}
          ops={dir.ops}
          selectedId={pick}
          onCreate={(folderId) => void create(folderId)}
          searchPlaceholder="Найти таблицу…"
          match={(t, q) => {
            const needle = q.trim().toLocaleLowerCase('ru')
            return t.name.toLocaleLowerCase('ru').includes(needle) || (t.folder ?? '').toLocaleLowerCase('ru').includes(needle) || t.results.some((r) => r.text.toLocaleLowerCase('ru').includes(needle))
          }}
          renderItem={(t) => (
            <>
              <span className="dir-icon" aria-hidden="true">
                <Table2 />
              </span>
              <span className="dir-name">{t.name}</span>
              {t.visibility !== 'gm' && <Eye className="dir-state" aria-label="Открыта игрокам" />}
            </>
          )}
          toolbar={
            <button type="button" className={`dir-btn${folderForm ? ' is-on' : ''}`} aria-pressed={folderForm} onClick={() => setFolderForm((v) => !v)}>
              <FolderInput aria-hidden="true" /> Из папки
            </button>
          }
          actions={{
            open: (t) => {
              setPick(t.id)
              setEditing(false)
            },
            extra: (t) => [
              {
                id: 'edit',
                label: 'Редактировать',
                icon: <PenLine />,
                run: () => {
                  setPick(t.id)
                  setEditing(true)
                },
              },
            ],
            rename: async (t, name) => upsert(await patchTable(roomId, t.id, { name })),
            duplicate: async (t) => {
              const copy = await createTable(roomId, {
                name: `${t.name} (копия)`.slice(0, 200),
                description: t.description,
                formula: t.formula,
                replacement: t.replacement,
                results: t.results.map((r) => ({ ...r, drawn: false })),
                folder: t.folder,
                visibility: t.visibility,
                shared_with: t.shared_with ?? [],
                image: t.image,
              })
              upsert(copy)
              setPick(copy.id)
            },
            exportJson: (t) => tables.find((x) => x.id === t.id) ?? t,
            remove: async (t) => {
              await deleteTable(roomId, t.id)
              list.setItems((xs) => xs?.filter((x) => x.id !== t.id) ?? null)
              if (pick === t.id) {
                setPick(null)
                setEditing(false)
              }
            },
          }}
          empty={list.items ? <p className="tb-hint">Сундуки, встречи, слухи: соберите первую таблицу.</p> : null}
        />
        {folderForm && (
          <FromFolder
            onCreated={(t) => {
              upsert(t)
              setPick(t.id)
              setEditing(false)
            }}
            onClose={() => setFolderForm(false)}
          />
        )}
        {(error || list.error || dir.error) && <p className="tb-err">{error || list.error || dir.error}</p>}
      </nav>
      <div className="rt-main">
        {!current ? (
          <p className="tb-hint">Выберите таблицу слева.</p>
        ) : editing ? (
          <TableEditor
            key={`${current.id}-${current.updated_at ?? ''}`}
            table={current}
            tables={tables}
            onSave={async (body) => {
              upsert(await patchTable(roomId, current.id, body))
              setEditing(false)
            }}
            onDelete={async () => {
              await deleteTable(roomId, current.id)
              list.setItems((xs) => xs?.filter((x) => x.id !== current.id) ?? null)
              setPick(null)
              setEditing(false)
            }}
            onClose={() => setEditing(false)}
          />
        ) : (
          <TableView key={current.id} table={current} onChange={upsert} onEdit={() => setEditing(true)} />
        )}
      </div>
    </div>
  )
}
