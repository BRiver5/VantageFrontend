import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpDown, ChevronLeft, Hexagon, Swords, VenetianMask, ChevronRight, Eye, FileUp, Globe, GripVertical, Lock, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  createCharacter,
  deleteCharacter,
  listMyCharacters,
  realImage,
  type Character,
  type GameClass,
  type Race,
} from '../api'
import {
  hasLegacySheet,
  loadLegacySheet,
  markLegacyMigrated,
  sheetDataToCharacter,
} from '../characters/sheetMigration'
import { parsePortrait } from '../characters/portrait'
import { parseLss, type LssHero } from '../characters/lssImport'
import { LssImportDialog } from '../characters/LssImportDialog'
import { useCatalogList } from '../create/useCatalog'
import type { CharacterVisibility } from '../types/auth'
import { Img } from '../media'
import { HexSelect } from '../hexSelect'

type SortKey = 'custom' | 'name' | 'level-desc' | 'level-asc' | 'new' | 'updated'
const SORT_KEY = 'vantage-heroes-sort'
const ORDER_KEY = 'vantage-heroes-order'
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим */
  }
}

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
  classById,
  race,
  onDelete,
  arrange,
}: {
  c: Character
  classById: Map<string, GameClass>
  race: Race | null
  onDelete: () => void
  /** режим «свой порядок»: стрелки и перетаскивание вместо перехода в лист */
  arrange?: { first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onDragStart: () => void; onDrop: () => void; dragging: boolean }
}) {
  const [broken, setBroken] = useState(false)
  const raceName = race?.race_name ?? null
  // в документе v2 только ссылки — названия и арт берём из каталога;
  // без своего портрета — арт расы, класс лишь запасной вариант
  const first = classById.get(c.classes?.[0]?.class_id ?? '')
  const art =
    parsePortrait(c.avatar_url).src || realImage(race?.image_gallery) || realImage(first?.image_gallery)
  const classes = (c.classes ?? [])
    .map((cl) => `${classById.get(cl.class_id)?.class_name ?? 'Класс'} ${cl.level}`)
    .join(' / ')
  const level = (c.classes ?? []).reduce((s, cl) => s + cl.level, 0) || 1
  const vis = VISIBILITY[c.visibility] ?? VISIBILITY.private
  const VisIcon = vis.icon

  const dragProps = arrange
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          e.dataTransfer.effectAllowed = 'move'
          arrange.onDragStart()
        },
        onDragOver: (e: DragEvent) => e.preventDefault(),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          arrange.onDrop()
        },
      }
    : {}
  return (
    <div className={`lobby-hero${arrange ? ' is-arrange' : ''}${arrange?.dragging ? ' is-dragging' : ''}`} {...dragProps}>
      {arrange && (
        <div className="lobby-arrange">
          <button type="button" disabled={arrange.first} onClick={() => arrange.onMove(-1)} aria-label={`Сдвинуть «${c.character_name}» левее`}>
            <ArrowLeft aria-hidden="true" />
          </button>
          <GripVertical aria-hidden="true" className="lobby-grip" />
          <button type="button" disabled={arrange.last} onClick={() => arrange.onMove(1)} aria-label={`Сдвинуть «${c.character_name}» правее`}>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      )}
      <Link to={`/characters/${c.id}`} className="lobby-hero-link" onClick={(e) => arrange && e.preventDefault()} draggable={false}>
        <span className="lobby-hero-frame">
          <span className="lobby-hero-art">
            {art && !broken ? (
              <Img src={art} alt="" loading="lazy" onError={() => setBroken(true)} />
            ) : (
              <UserRound className="lobby-hero-fallback" aria-hidden="true" />
            )}
          </span>
        </span>
        <span className="lobby-hero-vis" title={vis.label}>
          <VisIcon aria-hidden="true" />
        </span>
        <span className="lobby-hero-plate">
          <span className="lobby-hero-name">{c.character_name || 'Без имени'}</span>
          <span className="lobby-hero-meta">
            {[classes, raceName].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="lobby-hero-level" title="Уровень">
          <span>{level}</span>
        </span>
      </Link>
      <button
        type="button"
        className="lobby-hero-del"
        aria-label={`Удалить «${c.character_name || 'персонажа'}»`}
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
  const { items: races } = useCatalogList<Race>('races')

  // арт класса — портрет знамени, если у героя нет своего аватара
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races])

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
    if (!confirm(`Удалить «${c.character_name || 'персонажа'}»?`)) return
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
      const byName = (name: string) =>
        classes.find((c) => c.class_name.toLocaleLowerCase('ru') === name.trim().toLocaleLowerCase('ru'))?.id ?? null
      const created = await createCharacter(sheetDataToCharacter(data, byName))
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
  const [lss, setLss] = useState<LssHero[] | null>(null)

  // поиск, фильтры и порядок; сортировка и свой порядок — в браузере
  const [q, setQ] = useState('')
  const [classF, setClassF] = useState('')
  const [raceF, setRaceF] = useState('')
  const [levelF, setLevelF] = useState('')
  const [sort, setSort] = useState<SortKey>(() => readPref<SortKey>(SORT_KEY, 'custom'))
  const [order, setOrder] = useState<string[]>(() => readPref<string[]>(ORDER_KEY, []))
  const [arranging, setArranging] = useState(false)
  const dragId = useRef<string | null>(null)
  useEffect(() => savePref(SORT_KEY, sort), [sort])
  useEffect(() => savePref(ORDER_KEY, order), [order])

  const levelOf = (c: Character) => (c.classes ?? []).reduce((s, cl) => s + cl.level, 0) || 1
  /** все герои в своём порядке: сохранённые id сначала, новые — в конец */
  const custom = useMemo(() => {
    const pos = new Map(order.map((id, i) => [id, i]))
    return [...items].sort((a, b) => (pos.get(a.id) ?? 1e6 + Date.parse(a.created_at ?? '0') / 1e13) - (pos.get(b.id) ?? 1e6 + Date.parse(b.created_at ?? '0') / 1e13))
  }, [items, order])
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('ru')
    const [lo, hi] = levelF ? levelF.split('-').map(Number) : [0, 99]
    const list = custom.filter((c) => {
      if (needle) {
        const hay = [c.character_name, ...(c.classes ?? []).map((cl) => classById.get(cl.class_id)?.class_name), c.race_id ? raceById.get(c.race_id)?.race_name : ''].join(' ').toLocaleLowerCase('ru')
        if (!hay.includes(needle)) return false
      }
      if (classF && !(c.classes ?? []).some((cl) => cl.class_id === classF)) return false
      if (raceF && c.race_id !== raceF) return false
      const lv = levelOf(c)
      return lv >= lo && lv <= hi
    })
    const by: Record<SortKey, ((a: Character, b: Character) => number) | null> = {
      custom: null,
      name: (a, b) => (a.character_name || '').localeCompare(b.character_name || '', 'ru'),
      'level-desc': (a, b) => levelOf(b) - levelOf(a),
      'level-asc': (a, b) => levelOf(a) - levelOf(b),
      new: (a, b) => Date.parse(b.created_at ?? '0') - Date.parse(a.created_at ?? '0'),
      updated: (a, b) => Date.parse(b.updated_at ?? b.created_at ?? '0') - Date.parse(a.updated_at ?? a.created_at ?? '0'),
    }
    const cmp = by[sort]
    return cmp ? [...list].sort(cmp) : list
    // levelOf — чистая функция
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, q, classF, raceF, levelF, sort, classById, raceById])
  const filtered = !!(q.trim() || classF || raceF || levelF)

  // свой порядок: сдвиг стрелкой или перетаскиванием
  const move = (id: string, to: number) => {
    const ids = custom.map((c) => c.id).filter((x) => x !== id)
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id)
    setOrder(ids)
  }

  // прокрутка ряда кнопками, когда герои не помещаются
  const rowRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [])
  useEffect(() => {
    measure()
    const el = rowRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, shown.length, loading])
  const scrollBy = (dir: -1 | 1) => {
    const el = rowRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  const usedClasses = useMemo(() => [...new Set(items.flatMap((c) => (c.classes ?? []).map((cl) => cl.class_id)))].map((id) => classById.get(id)).filter((x): x is GameClass => !!x), [items, classById])
  const usedRaces = useMemo(() => [...new Set(items.map((c) => c.race_id).filter((x): x is string => !!x))].map((id) => raceById.get(id)).filter((x): x is Race => !!x), [items, raceById])

  // свободные слоты — поровну слева и справа, хотя бы по одному с каждой стороны;
  // без героев центр занимает главный слот «Новый герой»
  const sideFree = isEmpty ? 2 : filtered || arranging ? 0 : Math.max(1, Math.ceil((MIN_SLOTS - items.length) / 2))

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

      {items.length > 1 && (
        <div className="lobby-tools" role="search">
          <label className="lobby-search">
            <Search aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, класс или раса" aria-label="Поиск по персонажам" />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Очистить поиск">
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          {usedClasses.length > 1 && (
            <HexSelect label="Класс" icon={<Swords aria-hidden="true" />} value={classF} onChange={setClassF} options={[{ value: '', label: 'Все классы' }, ...usedClasses.map((c) => ({ value: c.id, label: c.class_name }))]} />
          )}
          {usedRaces.length > 1 && (
            <HexSelect label="Раса" icon={<VenetianMask aria-hidden="true" />} value={raceF} onChange={setRaceF} options={[{ value: '', label: 'Все расы' }, ...usedRaces.map((r) => ({ value: r.id, label: r.race_name }))]} />
          )}
          <HexSelect
            label="Уровень"
            icon={<Hexagon aria-hidden="true" />}
            value={levelF}
            onChange={setLevelF}
            options={[
              { value: '', label: 'Любой уровень' },
              { value: '1-4', label: 'Уровни 1–4' },
              { value: '5-10', label: 'Уровни 5–10' },
              { value: '11-16', label: 'Уровни 11–16' },
              { value: '17-20', label: 'Уровни 17–20' },
            ]}
          />
          <HexSelect
            label="Порядок"
            icon={<ArrowUpDown aria-hidden="true" />}
            value={sort}
            defaultValue="custom"
            onChange={(v) => {
              setSort(v as SortKey)
              setArranging(false)
            }}
            options={[
              { value: 'custom', label: 'Свой порядок' },
              { value: 'name', label: 'По имени' },
              { value: 'level-desc', label: 'Сначала старшие' },
              { value: 'level-asc', label: 'Сначала младшие' },
              { value: 'new', label: 'Сначала новые' },
              { value: 'updated', label: 'Недавно изменённые' },
            ]}
          />
          {sort === 'custom' && (
            <button type="button" className={`sort-btn lobby-arrange-btn${arranging ? ' is-active' : ''}`} onClick={() => setArranging((v) => !v)} aria-pressed={arranging} disabled={filtered}>
              <GripVertical aria-hidden="true" /> {arranging ? 'Готово' : 'Расставить'}
            </button>
          )}
        </div>
      )}
      {arranging && <p className="lobby-hint">Перетащите героев или двигайте стрелками. Порядок запомнится.</p>}

      {loading ? (
        <p className="muted lobby-loading">Загрузка…</p>
      ) : (
        <div className="lobby-stage">
          {edges.left && (
            <button type="button" className="lobby-scroll is-left" onClick={() => scrollBy(-1)} aria-label="Прокрутить влево">
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
          {edges.right && (
            <button type="button" className="lobby-scroll is-right" onClick={() => scrollBy(1)} aria-label="Прокрутить вправо">
              <ChevronRight aria-hidden="true" />
            </button>
          )}
          {filtered && shown.length === 0 && <p className="lobby-none">Никого не нашлось — попробуйте другие фильтры.</p>}
          <div
            className="lobby-row"
            ref={rowRef}
            onScroll={measure}
            onWheel={(e) => {
              // колесо мыши крутит ряд вбок, пока есть куда
              const el = e.currentTarget
              if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
              const can = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0
              if (can) el.scrollLeft += e.deltaY
            }}
          >
            {Array.from({ length: sideFree }, (_, i) => (
              <EmptySlot key={`l${i}`} />
            ))}
            {isEmpty ? (
              <EmptySlot main />
            ) : (
              shown.map((c, i) => (
                <HeroBanner
                  key={c.id}
                  c={c}
                  classById={classById}
                  race={c.race_id ? (raceById.get(c.race_id) ?? null) : null}
                  onDelete={() => void onDelete(c)}
                  arrange={
                    arranging
                      ? {
                          first: i === 0,
                          last: i === shown.length - 1,
                          onMove: (d) => move(c.id, i + d),
                          onDragStart: () => (dragId.current = c.id),
                          onDrop: () => {
                            if (dragId.current && dragId.current !== c.id) move(dragId.current, i)
                            dragId.current = null
                          },
                          dragging: false,
                        }
                      : undefined
                  }
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
      <div className="lobby-import">
        <label className="lobby-import-btn" title="Файл из «Мои персонажи» → экспорт в Long Story Short">
          <FileUp aria-hidden="true" /> Импорт из Long Story Short
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const heroes = parseLss(await f.text())
                if (heroes.length === 0) throw new Error('В файле нет персонажей')
                setLss(heroes)
              } catch (err) {
                alert(`Не похоже на экспорт Long Story Short: ${err instanceof Error ? err.message : 'файл не читается'}`)
              }
            }}
          />
        </label>
      </div>
      {lss && <LssImportDialog heroes={lss} onClose={() => setLss(null)} onDone={() => void reload()} />}
    </section>
  )
}
