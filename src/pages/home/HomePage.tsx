import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Backpack, BookMarked, DoorOpen, Gem, Landmark, ScrollText, Skull, Sparkles, Swords, VenetianMask } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { getBooks, getSettings } from '../../api'
import type { Book, Setting } from '../../api'
import { DieImage } from '../../dice/diceAssets'
import { SearchBar } from '../../search/GlobalSearch'
import { ContinueRoom } from '../../rooms/ContinueRoom'
import { LootBar } from './LootChips'
import { BookHive } from './BookHive'
import { BASIC_ID, CORE_RULES_ART, type Realm, SettingsCarousel } from './SettingsCarousel'

/** Справочник под поиском на главной */
const HOME_SECTIONS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/classes', label: 'Классы', icon: Swords },
  { to: '/races', label: 'Расы', icon: VenetianMask },
  { to: '/backgrounds', label: 'Предыстории', icon: Landmark },
  { to: '/feats', label: 'Черты', icon: Award },
  { to: '/spells', label: 'Заклинания', icon: Sparkles },
  { to: '/equipment', label: 'Снаряжение', icon: Backpack },
  { to: '/items', label: 'Предметы', icon: Gem },
  { to: '/bestiary', label: 'Бестиарий', icon: Skull },
  { to: '/terms', label: 'Термины', icon: BookMarked },
]

/* ---------- Главная ---------- */

export function HomePage() {
  const { user } = useAuth()
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
      desc: 'Общие тома: правила, монстры и сокровища, не привязанные к одному миру.',
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
      <section className="home-top">
        <h1 className="home-title gold-text">Vantage</h1>
        <SearchBar />
        {/* разделы сайта плитками на общей подложке; последняя — «Играть» с выбором внутри */}
        <nav className="home-tiles" aria-label="Разделы">
          <div className="home-tiles-board">
            {HOME_SECTIONS.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="home-tile">
                <span className="home-tile-ico" aria-hidden="true">
                  <Icon />
                </span>
                <span className="home-tile-label">{label}</span>
              </Link>
            ))}
            <PlayTile signedIn={!!user} />
          </div>
        </nav>
        <ContinueRoom />
      </section>

      <section className="home-section" aria-label="Миры">
        <h2 className="home-h2">Миры</h2>
        {error ? (
          <p className="status-line is-error">Архив недоступен: {error}</p>
        ) : (
          <SettingsCarousel realms={realms} activeId={realm.id} onSelect={setActiveRealm} />
        )}
      </section>

      <section className="home-section" aria-label="Книги мира">
        <h2 className="home-h2">Книги</h2>
        {!loading && !error && <LootBar realm={realm} />}
        {!error && <BookHive books={realm.books} loading={loading} />}
      </section>
    </>
  )
}

/**
 * Плитка «Играть»: сверху кубик и надпись, под ними — выбор, куда идти: герои или комнаты.
 * На наведении надпись уходит вверх, а половинки выбора разъезжаются шире.
 */
function PlayTile({ signedIn }: { signedIn: boolean }) {
  const to = (path: string) => (signedIn ? path : '/login')
  return (
    <div className="home-tile home-tile--play" role="group" aria-label="Играть">
      <span className="home-play-head">
        <DieImage type={20} size={26} className="die-play-icon" />
        <span className="gold-text">Играть</span>
      </span>
      <span className="home-play-choice">
        <Link to={to('/characters')} className="home-play-opt">
          <ScrollText aria-hidden="true" />
          <span>Персонажи</span>
        </Link>
        <Link to={to('/rooms')} className="home-play-opt">
          <DoorOpen aria-hidden="true" />
          <span>Комнаты</span>
        </Link>
      </span>
    </div>
  )
}
