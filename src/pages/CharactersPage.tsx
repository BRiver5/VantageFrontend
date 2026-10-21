import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, Globe, Lock, Plus, Trash2, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  createCharacter,
  deleteCharacter,
  listMyCharacters,
  realImage,
  type Character,
  type GameClass,
} from '../api'
import {
  hasLegacySheet,
  loadLegacySheet,
  markLegacyMigrated,
  sheetDataToCharacter,
} from '../characters/sheetMigration'
import { useCatalogList } from '../create/useCatalog'
import type { CharacterVisibility } from '../types/auth'

/** Сколько мест в «лобби» минимум: герои в центре, свободные слоты по бокам */
const MIN_SLOTS = 5

const VISIBILITY: Record<CharacterVisibility, { icon: LucideIcon; label: string }> = {
  private: { icon: Lock, label: 'Только вы' },
  unlisted: { icon: Eye, label: 'По ссылке' },
  public: { icon: Globe, label: 'Публичный' },
}

/** Пустой угловатый слот с «+» — ведёт в мастер создания */
function EmptySlot({ main = false }: { main?: boolean }) {
  return (
    <Link
      to="/characters/new"
      className={`lobby-slot${main ? ' lobby-slot--main' : ''}`}
      aria-label="Создать персонажа"
    >
      <span className="lobby-slot-inner">
        <Plus aria-hidden="true" />
        {main && <span className="lobby-slot-label">Новый герой</span>}
      </span>
    </Link>
  )
}

/** Знамя героя: портрет, плашка с именем, гекс уровня внизу */
function HeroBanner({
  c,
  fallbackArt,
  onDelete,
}: {
  c: Character
  fallbackArt: string | null
  onDelete: () => void
}) {
  const [broken, setBroken] = useState(false)
  const info = c.basic_info
  const art = info?.avatar_url?.trim() || fallbackArt
  const classes = info?.classes?.map((cl) => `${cl.name} ${cl.level}`).join(' / ')
  const vis = VISIBILITY[c.visibility] ?? VISIBILITY.private
  const VisIcon = vis.icon

  return (
    <div className="lobby-hero">
      <Link to={`/characters/${c.id}`} className="lobby-hero-link">
        <span className="lobby-hero-frame">
          <span className="lobby-hero-art">
            {art && !broken ? (
              <img src={art} alt="" loading="lazy" onError={() => setBroken(true)} />
            ) : (
              <UserRound className="lobby-hero-fallback" aria-hidden="true" />
            )}
          </span>
        </span>
        <span className="lobby-hero-vis" title={vis.label}>
          <VisIcon aria-hidden="true" />
        </span>
        <span className="lobby-hero-plate">
          <span className="lobby-hero-name">{info?.name || 'Без имени'}</span>
          <span className="lobby-hero-meta">
            {[classes, info?.race?.name].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="lobby-hero-level" title="Уровень">
          <span>{info?.total_level ?? 1}</span>
        </span>
      </Link>
      <button
        type="button"
        className="lobby-hero-del"
        aria-label={`Удалить «${info?.name || 'персонажа'}»`}
        title="Удалить"
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  )
}

export default function CharactersPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const { items: classes } = useCatalogList<GameClass>('classes')

  // арт класса — портрет знамени, если у героя нет своего аватара
  const classArt = useMemo(
    () => new Map(classes.map((c) => [c.class_name, realImage(c.image_gallery)])),
    [classes],
  )

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

  // свободные слоты — поровну слева и справа, хотя бы по одному с каждой стороны;
  // без героев центр занимает главный слот «Новый герой»
  const sideFree = isEmpty ? 2 : Math.max(1, Math.ceil((MIN_SLOTS - items.length) / 2))

  return (
    <section className="chars-page lobby">
      <header className="lobby-head">
        <h1 className="section-title gold-text">Мои персонажи</h1>
        <p className="lobby-sub">
          {isEmpty
            ? 'У вас нет ни одного персонажа — займите свободный слот'
            : items.length > 0
              ? `Героев в отряде: ${items.length}`
              : ' '}
        </p>
      </header>

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

      {error && <p className="auth-error">{error}</p>}

      {loading ? (
        <p className="muted lobby-loading">Загрузка…</p>
      ) : (
        <div className="lobby-stage">
          <div className="lobby-row">
            {Array.from({ length: sideFree }, (_, i) => (
              <EmptySlot key={`l${i}`} />
            ))}
            {isEmpty ? (
              <EmptySlot main />
            ) : (
              items.map((c) => (
                <HeroBanner
                  key={c.id}
                  c={c}
                  fallbackArt={classArt.get(c.basic_info?.classes?.[0]?.name ?? '') ?? null}
                  onDelete={() => void onDelete(c)}
                />
              ))
            )}
            {Array.from({ length: sideFree }, (_, i) => (
              <EmptySlot key={`r${i}`} />
            ))}
          </div>
        </div>
      )}

      <footer className="lobby-actions">
        <span className="lobby-actions-line" aria-hidden="true" />
        <Link to="/characters/new" className="lobby-start">
          <Plus aria-hidden="true" /> {isEmpty ? 'Создать первого' : 'Новый герой'}
        </Link>
        <span className="lobby-actions-line" aria-hidden="true" />
      </footer>
    </section>
  )
}
