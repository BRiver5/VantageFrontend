import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gem,
  Landmark,
  Menu,
  Sparkles,
  Skull,
  Swords,
  VenetianMask,
  X,
} from 'lucide-react'
import { getBookContents, getBooks, getClasses, getSettings, settingArt, splitTitle, totalsOf } from './api'
import type { Book, BookContents, ContentTotals, GameClass, Setting } from './api'
import { Corners, VantageLogo, Divider } from './ornaments'
import { DieImage } from './dice/diceAssets'
import { BestiaryPage, BackgroundsPage, ClassesPage, FeatsPage, ItemsPage, RacesPage, SpellsPage, TerminsPage } from './pages/CatalogPage'
import BookPage from './pages/BookPage'
import SettingPage from './pages/SettingPage'
import {
  BackgroundDetailPage,
  ClassDetailPage,
  CreatureDetailPage,
  FeatDetailPage,
  ItemDetailPage,
  RaceDetailPage,
  SpellDetailPage,
  SubclassDetailPage,
  SubraceDetailPage,
  TerminDetailPage,
} from './pages/DetailPages'
import DiceRoller from './dice/DiceRoller'
import RouteReadyGate from './RouteReadyGate'
import { bookSectionEntries, contentEntryLink, HEX_EXPAND_ROWS, LOOT_CHIP_ROWS } from './contentSections'

/* ---------- Разделы каталога ---------- */

const CATEGORIES = [
  { path: '/classes', label: 'Классы', icon: Swords },
  { path: '/races', label: 'Расы', icon: VenetianMask },
  { path: '/backgrounds', label: 'Предыстории', icon: Landmark },
  { path: '/feats', label: 'Черты', icon: Award },
  { path: '/spells', label: 'Заклинания', icon: Sparkles },
  { path: '/items', label: 'Предметы', icon: Gem },
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
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // закрываем бургер-меню при переходе на другую страницу
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <Link to="/" className="brand">
          <VantageLogo size={42} />
          <div>
            <span className="brand-name gold-text">VANTAGE</span>
            <span className="brand-tag">Кодекс приключений</span>
          </div>
        </Link>
        <button
          type="button"
          className="nav-burger"
          aria-label={menuOpen ? 'Закрыть меню' : 'Меню разделов'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav className={`cat-nav${menuOpen ? ' is-open' : ''}`} aria-label="Разделы каталога">
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
const CORE_RULES_ART = '/assets/covers/dnd_landskapes.jpg'

interface Realm {
  id: string
  title: string
  desc: string | null
  pictureUrl: string | null
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
            realm.pictureUrl ??
            (realm.id === BASIC_ID ? CORE_RULES_ART : settingArt(en, ru))
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

const LOOT_ROWS = LOOT_CHIP_ROWS

/** Сетка жетонов со счётчиками нововведений (используется и на странице сеттинга) */
export function LootChips({
  totals,
  onSelect,
}: {
  totals: ContentTotals
  onSelect?: (key: keyof ContentTotals) => void
}) {
  return (
    <div className="loot-grid">
      {LOOT_ROWS.map(({ key, label, icon: Icon }) => {
        const count = totals[key]
        const clickable = !!onSelect && count > 0
        const Tag = clickable ? 'button' : 'span'
        return (
          <Tag
            key={key}
            type={clickable ? 'button' : undefined}
            className={`loot-chip${count === 0 ? ' is-zero' : ''}${clickable ? ' loot-chip--clickable' : ''}`}
            onClick={clickable ? () => onSelect(key) : undefined}
            title={clickable ? `Показать: ${label}` : undefined}
          >
            <Icon aria-hidden="true" />
            <span className="loot-num">{count}</span> {label}
          </Tag>
        )
      })}
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

function HexLootExpand({ book, contents }: { book: Book; contents: BookContents | null }) {
  const rows = HEX_EXPAND_ROWS.map(({ key, label, icon: Icon, base }) => {
    const { ids, count } = bookSectionEntries(book, key, contents)
    const href = contentEntryLink(book.id, key, base, ids)
    return { key, label, Icon, count, href }
  })
  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div
      className="hex-expand"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="hex-expand-inner">
        <Corners size={20} />
        <div className="hex-expand-title">
          <span className="hex-expand-title-text">Нововведения</span>
          <span className="hex-expand-total">{total}</span>
        </div>
        <ul className="hex-expand-list">
          {rows.map(({ key, label, Icon, count, href }) => {
            const inner = (
              <>
                <Icon aria-hidden="true" />
                <span className="hex-expand-label">{label}</span>
                <span className="hex-expand-count">{count}</span>
              </>
            )
            return (
              <li key={key} className={`hex-expand-row${count === 0 ? ' is-zero' : ''}`}>
                {href ? (
                  <Link to={href} className="hex-expand-link" title={`${label}: ${count}`}>
                    {inner}
                  </Link>
                ) : (
                  <span className="hex-expand-link is-static">{inner}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// сколько курсор должен «задержаться» на соте, прежде чем она раскроется
const HEX_DWELL_MS = 700

function BookHex({ book, index }: { book: Book; index: number }) {
  const navigate = useNavigate()
  const { ru } = splitTitle(book.title)
  const [contents, setContents] = useState<BookContents | null>(null)
  const [expanded, setExpanded] = useState(false)
  const loadingContents = useRef(false)
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ensureContents = () => {
    if (contents || loadingContents.current) return
    loadingContents.current = true
    getBookContents(book.id)
      .then(setContents)
      .catch(() => {})
      .finally(() => { loadingContents.current = false })
  }

  // раскрытие только если курсор задержался на соте HEX_DWELL_MS
  const startDwell = () => {
    ensureContents() // данные подгружаем сразу, чтобы к раскрытию были готовы
    if (dwellTimer.current) clearTimeout(dwellTimer.current)
    dwellTimer.current = setTimeout(() => setExpanded(true), HEX_DWELL_MS)
  }
  const cancelDwell = () => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current)
      dwellTimer.current = null
    }
    setExpanded(false)
  }
  useEffect(() => () => {
    if (dwellTimer.current) clearTimeout(dwellTimer.current)
  }, [])

  const openBook = () => navigate(`/books/${book.id}`)

  return (
    <div
      className={`hex-cell-wrap${expanded ? ' is-expanded' : ''}`}
      style={{ animationDelay: `${Math.min(index * 45, 700)}ms` }}
      onMouseEnter={startDwell}
      onMouseLeave={cancelDwell}
      onFocus={ensureContents}
    >
      <div className="hex-unit">
        <div className="hex-unit-fill">
        <div
          className="hex-cell"
          role="link"
          tabIndex={0}
          onClick={openBook}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openBook()
            }
          }}
        >
          <span className="hex-inner">
            <HexCover book={book} />
            <span className="hex-shade" />
            <span className="hex-code">{book.book_code}</span>
            <span className="hex-body">
              <span className="hex-title" title={book.title}>{ru}</span>
            </span>
          </span>
        </div>
        <HexLootExpand book={book} contents={contents} />
        </div>
      </div>
    </div>
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
              <span key={ci} className="hex-cell-wrap hex-cell-wrap--static">
                <div className="hex-unit">
                  <span className="hex-cell is-ghost"><span className="hex-inner" /></span>
                </div>
              </span>
            ),
          )}
          {/* невидимые распорки добивают короткий ряд до целевой ширины,
              чтобы центрирование дало верный сдвиг и ряд вклинился в вырезы */}
          {Array.from({ length: pad }, (_, pi) => (
            <span key={`pad-${pi}`} className="hex-cell-wrap hex-cell-wrap--spacer" aria-hidden="true" />
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
      pictureUrl: CORE_RULES_ART,
      books: books.filter((b) => !b.settings_id),
    }
    const rest = settings.map((s) => ({
      id: s.id,
      title: s.settings_title,
      desc: s.settings_description,
      pictureUrl: s.settings_picture_urls[0] ?? null,
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
  useEffect(() => {
    // ВАЖНО: тело в {} — иначе стрелка вернёт результат window.scrollTo, а React
    // примет его за cleanup-функцию. В браузерах, где расширение/плагин плавного
    // скролла заставляет scrollTo вернуть НЕ undefined, при следующей навигации
    // React зовёт этот «cleanup» → "destroy is not a function" → чёрный экран.
    window.scrollTo(0, 0)
  }, [pathname])
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
            <Route path="/backgrounds" element={<BackgroundsPage />} />
            <Route path="/backgrounds/:id" element={<BackgroundDetailPage />} />
            <Route path="/feats" element={<FeatsPage />} />
            <Route path="/feats/:id" element={<FeatDetailPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/spells/:id" element={<SpellDetailPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/bestiary" element={<BestiaryPage />} />
            <Route path="/bestiary/:id" element={<CreatureDetailPage />} />
            <Route path="/termins" element={<TerminsPage />} />
            <Route path="/termins/:id" element={<TerminDetailPage />} />
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
