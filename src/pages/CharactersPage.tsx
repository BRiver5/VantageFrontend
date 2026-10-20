import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookCheck,
  ChevronsUp,
  Dices,
  Feather,
  Footprints,
  Plus,
  ScrollText,
  Swords,
  Trash2,
} from 'lucide-react'
import { Corners } from '../ornaments'
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

const EMPTY_STATS = ['СИЛ', 'ЛОВ', 'ТЕЛ', 'ИНТ', 'МДР', 'ХАР']

const CREATE_STEPS = [
  { label: 'Раса', icon: Footprints },
  { label: 'Класс', icon: Swords },
  { label: 'Уровень', icon: ChevronsUp },
  { label: 'Характеристики', icon: Dices },
  { label: 'Имя', icon: Feather },
  { label: 'Предыстория', icon: ScrollText },
  { label: 'Итог', icon: BookCheck },
]

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
          <Link to="/characters/new" className="hero-slot" aria-label="Создать персонажа">
            <Corners size={30} gold />
            <span className="hero-slot-level">Ур. 1</span>
            <span className="hero-slot-portrait">
              <Plus aria-hidden="true" />
            </span>
            <span className="hero-slot-name">Новый персонаж</span>
            <span className="hero-slot-meta">Раса и класс не выбраны</span>
            <span className="hero-slot-stats">
              {EMPTY_STATS.map((s) => (
                <span key={s} className="hero-slot-stat">
                  <b>—</b>
                  <i>{s}</i>
                </span>
              ))}
            </span>
          </Link>

          <div className="chars-empty-side">
            <h2 className="chars-empty-title">Персонажей пока нет</h2>
            <ol className="chars-path">
              {CREATE_STEPS.map(({ label, icon: Icon }, i) => (
                <li key={label} className="chars-path-step">
                  <span className="chars-path-num">{i + 1}</span>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            <Link to="/characters/new" className="cs-btn cs-btn--lg">
              <Plus aria-hidden="true" /> Создать персонажа
            </Link>
          </div>
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
