import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getBooks, getSettings } from '../../api'
import type { Book, Setting } from '../../api'
import { DieImage } from '../../dice/diceAssets'
import { SearchBar } from '../../search/GlobalSearch'
import { ContinueRoom } from '../../rooms/ContinueRoom'
import { LootBar } from './LootChips'
import { BookHive } from './BookHive'
import { BASIC_ID, CORE_RULES_ART, type Realm, SettingsCarousel } from './SettingsCarousel'

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
        <Link to={user ? '/rooms' : '/login'} className="play-btn">
          <span className="play-btn-inner">
            <DieImage type={20} size={26} className="die-play-icon" />
            <span className="gold-text">Играть</span>
            <DieImage type={20} size={26} className="die-play-icon die-play-icon--flip" />
          </span>
        </Link>
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
