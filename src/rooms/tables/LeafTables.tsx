/**
 * Створка ширмы «Таблицы»: слева список по папкам с поиском, справа выбранная
 * таблица — в режиме броска или в редакторе. Новую таблицу можно собрать из
 * папки базы знаний, заготовок предметов с тегом или существ комнаты.
 */
import { useState } from 'react'
import { FolderInput, FolderOpen, Plus, Search, Table2 } from 'lucide-react'
import { useList } from '../table/dm/common'
import { useRoom } from '../RoomProvider'
import { errText } from '../table/parts'
import { createTable, deleteTable, listTables, patchTable, tableFromFolder, type FromFolderBody } from './api'
import { groupTables } from './logic'
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
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [folderForm, setFolderForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tables = list.items ?? []
  const current = tables.find((t) => t.id === pick) ?? null

  const upsert = (t: RollTable) => list.setItems((xs) => (xs?.some((x) => x.id === t.id) ? xs.map((x) => (x.id === t.id ? t : x)) : [...(xs ?? []), t]))

  const create = async () => {
    setError(null)
    try {
      const t = await createTable(roomId, { name: 'Новая таблица', results: [] })
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
        <label className="sc-search">
          <Search aria-hidden="true" />
          <input type="search" value={q} placeholder="Найти таблицу…" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="rt-side-bar">
          <button type="button" className="tb-linkbtn" onClick={() => void create()}>
            <Plus aria-hidden="true" /> новая
          </button>
          <button type="button" className={`tb-linkbtn${folderForm ? ' is-on' : ''}`} aria-pressed={folderForm} onClick={() => setFolderForm((v) => !v)}>
            <FolderInput aria-hidden="true" /> из папки
          </button>
        </div>
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
        {groupTables(tables, q).map((f) => (
          <div key={f.path || '-'} className="rt-group">
            {f.path && (
              <h4>
                <FolderOpen aria-hidden="true" /> {f.path}
              </h4>
            )}
            <ul>
              {f.tables.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={t.id === pick ? 'is-on' : ''}
                    aria-current={t.id === pick}
                    onClick={() => {
                      setPick(t.id)
                      setEditing(false)
                    }}
                  >
                    <Table2 aria-hidden="true" />
                    <span>{t.name}</span>
                    {t.visibility !== 'gm' && <i title="Открыта игрокам">●</i>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {list.items && tables.length === 0 && <p className="tb-hint">Сундуки, встречи, слухи: соберите первую таблицу.</p>}
        {(error || list.error) && <p className="tb-err">{error || list.error}</p>}
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
