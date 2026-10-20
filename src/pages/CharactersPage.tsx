import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import {
  createCharacter,
  deleteCharacter,
  listMyCharacters,
  type Character,
} from '../api'
import {
  hasLegacySheet,
  loadLegacySheet,
  markLegacyMigrated,
  sheetDataToCharacter,
} from '../characters/sheetMigration'

export default function CharactersPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listMyCharacters()
      setItems(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить персонажей')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    setShowImport(hasLegacySheet())
  }, [reload])

  const onDelete = async (c: Character) => {
    if (!c.id) return
    if (!confirm(`Удалить «${c.basic_info?.name || 'персонажа'}»?`)) return
    try {
      await deleteCharacter(c.id)
      setItems((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить')
    }
  }

  const dismissImport = () => {
    markLegacyMigrated()
    setShowImport(false)
  }

  const runImport = async () => {
    const data = loadLegacySheet()
    if (!data) {
      dismissImport()
      return
    }
    setImporting(true)
    try {
      const created = await createCharacter(sheetDataToCharacter(data))
      markLegacyMigrated()
      setShowImport(false)
      if (created.id) navigate(`/characters/${created.id}`)
      else await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Импорт не удался')
    } finally {
      setImporting(false)
    }
  }

  const isEmpty = !loading && !error && items.length === 0

  return (
    <section className="chars-page">
      <div className="cs-toolbar">
        <h1 className="section-title gold-text">Мои персонажи</h1>
        {!isEmpty && (
          <div className="cs-toolbar-actions">
            <Link to="/characters/new" className="cs-btn">
              <Plus aria-hidden="true" /> Создать
            </Link>
          </div>
        )}
      </div>

      {showImport && (
        <div className="chars-banner">
          <div>
            <strong>Найден локальный лист</strong>
            <p>Импортировать его в облако как нового персонажа?</p>
          </div>
          <div className="chars-banner-actions">
            <button type="button" className="cs-btn" disabled={importing} onClick={() => void runImport()}>
              {importing ? 'Импорт…' : 'Импортировать'}
            </button>
            <button type="button" className="cs-btn cs-btn--ghost" onClick={dismissImport}>
              Не сейчас
            </button>
          </div>
        </div>
      )}

      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="auth-error">{error}</p>}

      {isEmpty && (
        <div className="chars-empty">
          <p className="chars-empty-title">У вас нет ни одного персонажа</p>
          <Link to="/characters/new" className="chars-empty-hex" aria-label="Создать персонажа">
            <Plus aria-hidden="true" />
          </Link>
          <Link to="/characters/new" className="cs-btn cs-btn--lg">
            Создать первого
          </Link>
        </div>
      )}

      <ul className="chars-list">
        {items.map((c) => (
          <li key={c.id} className="chars-card">
            <Link to={`/characters/${c.id}`} className="chars-card-main">
              <span className="chars-card-name">{c.basic_info?.name || 'Без имени'}</span>
              <span className="chars-card-meta">
                {[
                  c.basic_info?.classes?.map((cl) => `${cl.name} ${cl.level}`).join(' / '),
                  c.basic_info?.race?.name,
                  c.visibility,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Link>
            <button
              type="button"
              className="chars-card-del"
              aria-label="Удалить"
              onClick={() => void onDelete(c)}
            >
              <Trash2 aria-hidden="true" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
