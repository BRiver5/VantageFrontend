import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gem,
  Landmark,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Users,
  VenetianMask,
} from 'lucide-react'
import { getBooks, getClasses, getSettings, settingArt, splitTitle, totalsOf } from './api'
import type { Book, ContentTotals, GameClass, Setting } from './api'
import { Corners, D20Logo, Divider } from './ornaments'
import { DieImage } from './dice/diceAssets'
import { BestiaryPage, ClassesPage, FeatsPage, ItemsPage, RacesPage, SpellsPage } from './pages/CatalogPage'
import BookPage from './pages/BookPage'
import SettingPage from './pages/SettingPage'
import {
  ClassDetailPage,
  CreatureDetailPage,
  FeatDetailPage,
  ItemDetailPage,
  RaceDetailPage,
  SpellDetailPage,
  SubclassDetailPage,
  SubraceDetailPage,
} from './pages/DetailPages'
import DiceRoller from './dice/DiceRoller'
import RouteReadyGate from './RouteReadyGate'

/* ---------- Разделы каталога ---------- */

const CATEGORIES = [
  { path: '/classes', label: 'Классы', icon: Swords },
  { path: '/races', label: 'Расы и виды', icon: VenetianMask },
  { path: '/feats', label: 'Черты', icon: Award },
  { path: '/spells', label: 'Заклинания', icon: Sparkles },
  { path: '/items', label: 'Магические предметы', icon: Gem },
  { path: '/bestiary', label: 'Бестиарий', icon: Skull },
] as const

/**
 * «Классы» в шапке — наведение раскрывает свиток со списком классов
 * (можно выбрать конкретный класс, не заходя на страницу каталога).
 */
function ClassesNavItem() {
  const [classes, setClasses] = useState<GameClass[]>([])

  useEffect(() => {
    getClasses().then(setClasses).catch(() => {})
  }, [])

  return (
    <div className="nav-scroll">
      <NavLink to="/classes" className={({ isActive }) => `cat-btn${isActive ? ' is-active' : ''}`}>
        <span className="cat-btn-inner">
          <Swords aria-hidden="true" />
          Классы
        </span>
      </NavLink>
      <div className="nav-scroll-panel" role="menu" aria-label="Быстрый выбор класса">
        <span className="nav-scroll-rod" aria-hidden="true" />
        <div className="nav-scroll-list">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`} className="nav-scroll-item" role="menuitem">
              {c.class_name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function Masthead() {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <Link to="/" className="brand">
          <D20Logo size={42} />
          <div>
            <span className="brand-name gold-text">VANTAGE</span>
            <span className="brand-tag">Кодекс приключений</span>
          </div>
        </Link>
        <nav className="cat-nav" aria-label="Разделы каталога">
          {CATEGORIES.map(({ path, label, icon: Icon }) =>
            path === '/classes' ? (
              <ClassesNavItem key={path} />
            ) : (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) => `cat-btn${isActive ? ' is-active' : ''}`}
              >
                <span className="cat-btn-inner">
                  <Icon aria-hidden="true" />
                  {label}
                </span>
              </NavLink>
            ),
          )}
        </nav>
      </div>
    </header>
  )
}

/* ---------- Кнопка «Играть» — вытянутый гексагон (бросок кубика — кнопка в углу, см. DiceRoller) ---------- */

function PlayButton() {
  return (
    <div className="play-wrap">
      <button type="button" className="play-btn" title="Скоро в игре">
        <span className="play-btn-inner">
          <DieImage type={20} size={26} className="die-play-icon" />
          <span className="gold-text">Играть</span>
          <DieImage type={20} size={26} className="die-play-icon die-play-icon--flip" />
        </span>
      </button>
      <span className="play-hint">— врата откроются вскоре —</span>
    </div>
  )
}

/* ---------- Карусель сеттингов ---------- */

/** Псевдо-сеттинг для книг без привязки */
const BASIC_ID = '__basic'

interface Realm {
  id: string
  title: string
  desc: string | null
  books: Book[]
}

const ACCENTS = [
  'rgba(196, 154, 60, 0.3)', // золото — базовые правила
  'rgba(96, 62, 148, 0.36)', // аметист
  'rgba(30, 100, 136, 0.36)', // морская сталь
  'rgba(148, 48, 48, 0.34)', // драконья кровь
  'rgba(36, 108, 84, 0.34)', // малахит
  'rgba(140, 80, 32, 0.34)', // янтарь
  'rgba(62, 70, 144, 0.38)', // сапфир
  'rgba(116, 40, 88, 0.36)', // фей-роза
]

function tomes(n: number): string {
  const d10 = n % 10
  const d100 = n % 100
  if (d10 === 1 && d100 !== 11) return `${n} том`
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} тома`
  return `${n} томов`
}

function SettingsCarousel({
  realms,
  activeId,
  onSelect,
}: {
  realms: Realm[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const track = useRef<HTMLDivElement>(null)

  const scroll = (dir: -1 | 1) => {
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="carousel-shell">
      <button type="button" className="car-arrow car-arrow--left" onClick={() => scroll(-1)} aria-label="Назад">
        <span><ChevronLeft /></span>
      </button>
      <div className="carousel" ref={track}>
        {realms.map((realm, i) => {
          const { ru, en } = splitTitle(realm.title)
          const art =
            realm.id === BASIC_ID
              ? settingArt('core rulebooks collection', ru)
              : settingArt(en, ru)
          return (
            <div
              key={realm.id}
              role="button"
              tabIndex={0}
              className={`setting-card${realm.id === activeId ? ' is-active' : ''}`}
              onClick={() => onSelect(realm.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(realm.id)
                }
              }}
            >
              <span
                className="setting-card-inner"
                style={{ '--accent': ACCENTS[i % ACCENTS.length] } as React.CSSProperties}
              >
                <span className="setting-art" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />
                <span className="setting-kicker">{realm.id === BASIC_ID ? 'Основа' : 'Сеттинг'}</span>
                <span className="setting-seal" aria-hidden="true">
                  <span className="setting-seal-inner">{ru.charAt(0)}</span>
                </span>
                <span className="setting-name">
                  {ru}
                  {en && <span className="setting-name-en">{en}</span>}
                </span>
                {realm.desc && <span className="setting-desc">{realm.desc}</span>}
                <span className="setting-meta">
                  <BookOpen aria-hidden="true" />
                  {tomes(realm.books.length)}
                </span>
                {realm.id !== BASIC_ID && (
                  <Link
                    to={`/settings/${realm.id}`}
                    className="setting-open"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Открыть мир ⟶
                  </Link>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <button type="button" className="car-arrow car-arrow--right" onClick={() => scroll(1)} aria-label="Вперёд">
        <span><ChevronRight /></span>
      </button>
    </div>
  )
}

/* ---------- Сводка нововведений выбранного сеттинга ---------- */

const LOOT_ROWS: { key: keyof ContentTotals; label: string; icon: typeof Swords }[] = [
  { key: 'classes', label: 'классов', icon: Swords },
  { key: 'subclasses', label: 'подклассов', icon: Shield },
  { key: 'races', label: 'рас', icon: VenetianMask },
  { key: 'subraces', label: 'подрас', icon: Users },
  { key: 'feats', label: 'черт', icon: Star },
  { key: 'backgrounds', label: 'предысторий', icon: Landmark },
  { key: 'spells', label: 'заклинаний', icon: Sparkles },
  { key: 'items', label: 'предметов', icon: Gem },
]

/** Сетка жетонов со счётчиками нововведений (используется и на странице сеттинга) */
export function LootChips({ totals }: { totals: ContentTotals }) {
  return (
    <div className="loot-grid">
      {LOOT_ROWS.map(({ key, label, icon: Icon }) => (
        <span key={key} className={`loot-chip${totals[key] === 0 ? ' is-zero' : ''}`}>
          <Icon aria-hidden="true" />
          <span className="loot-num">{totals[key]}</span> {label}
        </span>
      ))}
    </div>
  )
}

function LootBar({ realm }: { realm: Realm }) {
  const totals = useMemo(() => totalsOf(realm.books), [realm])
  return (
    <div className="loot-bar">
      <Corners size={38} />
      <div className="loot-title">Нововведения — {splitTitle(realm.title).ru}</div>
      <LootChips totals={totals} />
    </div>
  )
}

/* ---------- Соты книг ---------- */

/** Обложка книги в соте; если ссылки нет или она битая — книжная иконка вместо провала */
function HexCover({ book }: { book: Book }) {
  const [broken, setBroken] = useState(false)
  if (!book.book_cover_url || broken) {
    return (
      <span className="hex-cover hex-cover--empty">
        <BookOpen aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      className="hex-cover"
      src={book.book_cover_url}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
    />
  )
}

function BookHex({ book, index }: { book: Book; index: number }) {
  const { ru } = splitTitle(book.title)
  const spells = book.new_spells?.length ?? 0
  const items = book.new_items?.length ?? 0
  const classes = book.new_classes?.length ?? 0
  const races = book.new_races?.length ?? 0

  return (
    <Link
      to={`/books/${book.id}`}
      className="hex-cell"
      style={{ animationDelay: `${Math.min(index * 45, 700)}ms` }}
    >
      <span className="hex-inner">
        <HexCover book={book} />
        <span className="hex-shade" />
        <span className="hex-code">{book.book_code}</span>
        <span className="hex-body">
          <span className="hex-title" title={book.title}>{ru}</span>
          <span className="hex-loot">
            {classes > 0 && <span><Swords aria-hidden="true" />{classes}</span>}
            {races > 0 && <span><VenetianMask aria-hidden="true" />{races}</span>}
            {spells > 0 && <span><Sparkles aria-hidden="true" />{spells}</span>}
            {items > 0 && <span><Gem aria-hidden="true" />{items}</span>}
          </span>
        </span>
      </span>
    </Link>
  )
}

/**
 * Раскладывает произвольное число ячеек по рядам гексагонального улья с шахматным
 * чередованием ширины (полный ряд / на одну соту короче). Каждый ряд после первого
 * стыкуется внахлёст с предыдущим (гексагоны входят в вырезы). Чтобы стыковка
 * работала при ЛЮБОМ числе книг (в т.ч. на «хвосте», где остаток не заполняет ряд
 * целиком), короткие ряды добиваются НЕВИДИМЫМИ ячейками-распорками (`pad`) до
 * своей целевой ширины. Тогда центрирование всегда сдвигает ряд ровно на полсоты
 * относительно соседа, и вырезы совпадают — без «висящих» ровно снизу рядов, как
 * было раньше, когда стыковку отключали при равной/чётно-отличной ширине.
 */
function layoutHive<T>(
  items: T[],
  cols: number,
): { items: T[]; pad: number; nested: boolean }[] {
  const c = Math.max(1, cols)
  const target = (r: number) => (c <= 1 ? 1 : r % 2 === 0 ? c : c - 1)
  const rows: T[][] = []
  for (let i = 0, r = 0; i < items.length; r++) {
    const n = target(r)
    rows.push(items.slice(i, i + n))
    i += n
  }
  return rows.map((row, i) => ({
    items: row,
    // первый ряд не добиваем (стыковать сверху нечего); остальные добиваем
    // распорками до целевой ширины — так центрирование даёт верный полусотовый сдвиг
    pad: i === 0 ? 0 : Math.max(0, target(i) - row.length),
    nested: i > 0 && c > 1,
  }))
}

function BookHive({ books, loading }: { books: Book[]; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ s: 196, cols: 5 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === 0) return
      const s = w < 620 ? 150 : w < 980 ? 172 : 196
      const cols = Math.max(1, Math.floor(w / (s + 14)))
      setLayout((prev) => (prev.s === s && prev.cols === cols ? prev : { s, cols }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!loading && books.length === 0) {
    return <p className="hive-empty">В архивах этого мира пока не найдено ни одного тома…</p>
  }

  const cells: (Book | null)[] = loading ? Array.from({ length: 8 }, () => null) : books
  const rows = layoutHive(cells, layout.cols)

  return (
    <div className="hive" ref={ref} style={{ '--s': `${layout.s}px` } as React.CSSProperties}>
      {rows.map(({ items: row, pad, nested }, ri) => (
        <div key={ri} className={`hive-row${nested ? ' hive-row--nest' : ''}`}>
          {row.map((b, ci) =>
            b ? (
              <BookHex key={b.id} book={b} index={ri * layout.cols + ci} />
            ) : (
              <span key={ci} className="hex-cell is-ghost"><span className="hex-inner" /></span>
            ),
          )}
          {/* невидимые распорки добивают короткий ряд до целевой ширины,
              чтобы центрирование дало верный сдвиг и ряд вклинился в вырезы */}
          {Array.from({ length: pad }, (_, pi) => (
            <span key={`pad-${pi}`} className="hex-cell hex-cell--spacer" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ---------- Главная ---------- */

function HomePage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeRealm, setActiveRealm] = useState<string>(BASIC_ID)

  useEffect(() => {
    Promise.all([getSettings(), getBooks()])
      .then(([s, b]) => {
        setSettings(s)
        setBooks(b)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const realms = useMemo<Realm[]>(() => {
    const basic: Realm = {
      id: BASIC_ID,
      title: 'Базовые правила [Core Rules]',
      desc: 'Общие тома мультивселенной: правила, монстры и сокровища, не привязанные к одному миру.',
      books: books.filter((b) => !b.settings_id),
    }
    const rest = settings.map((s) => ({
      id: s.id,
      title: s.settings_title,
      desc: s.settings_description,
      books: books.filter((b) => b.settings_id === s.id),
    }))
    // миры с книгами — вперёд
    rest.sort((a, b) => b.books.length - a.books.length)
    return [basic, ...rest]
  }, [settings, books])

  const realm = realms.find((r) => r.id === activeRealm) ?? realms[0]

  return (
    <>
      <section className="hero">
        <h1 className="hero-title gold-text">Кодекс Приключений</h1>
        <p className="hero-sub">
          Хроники миров, бестиарии, гримуары и реликвии — всё знание мультивселенной, переплетённое в золото.
        </p>
        <PlayButton />
      </section>

      <Divider />

      <section aria-label="Сеттинги">
        <h2 className="section-title gold-text">Миры и Сеттинги</h2>
        <p className="section-sub">Изберите мир — и соты архива раскроют его тома</p>
        {error ? (
          <p className="status-line is-error">Архив недоступен: {error}</p>
        ) : (
          <SettingsCarousel realms={realms} activeId={realm.id} onSelect={setActiveRealm} />
        )}
      </section>

      <Divider />

      <section aria-label="Книги сеттинга">
        <h2 className="section-title gold-text">Тома Архива</h2>
        <p className="section-sub">Каждая сота — книга избранного мира, нажмите — и том раскроется</p>
        {!loading && !error && <LootBar realm={realm} />}
        {!error && <BookHive books={realm.books} loading={loading} />}
      </section>
    </>
  )
}

/* ---------- Приложение ---------- */

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Masthead />
      <main className="page">
        <RouteReadyGate>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/classes/:id" element={<ClassDetailPage />} />
            <Route path="/subclasses/:id" element={<SubclassDetailPage />} />
            <Route path="/races" element={<RacesPage />} />
            <Route path="/races/:id" element={<RaceDetailPage />} />
            <Route path="/subraces/:id" element={<SubraceDetailPage />} />
            <Route path="/feats" element={<FeatsPage />} />
            <Route path="/feats/:id" element={<FeatDetailPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/spells/:id" element={<SpellDetailPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/bestiary" element={<BestiaryPage />} />
            <Route path="/bestiary/:id" element={<CreatureDetailPage />} />
            <Route path="/books/:id" element={<BookPage />} />
            <Route path="/settings/:id" element={<SettingPage />} />
          </Routes>
        </RouteReadyGate>
        <footer className="footer">Vantage · Codex Adventurae · MMXXVI</footer>
      </main>
      <DiceRoller />
    </>
  )
}
