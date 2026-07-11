import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Landmark } from 'lucide-react'
import {
  getBookContents,
  getBooks,
  getOne,
  settingArt,
  splitTitle,
  totalsOf,
} from '../api'
import type { Book, BookContents, ContentTotals, Setting } from '../api'
import { Corners, Divider } from '../ornaments'
import { TomeSections } from './BookPage'
import { LootChips } from '../App'

export default function SettingPage() {
  const { id } = useParams<{ id: string }>()
  const [setting, setSetting] = useState<Setting | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [contents, setContents] = useState<BookContents | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setSetting(null)
    setBooks([])
    setContents(null)
    Promise.all([getOne<Setting>('settings', id), getBooks()])
      .then(async ([s, allBooks]) => {
        const own = allBooks.filter((b) => b.settings_id === id)
        setSetting(s)
        setBooks(own)
        // сводим нововведения всех книг мира в один каталог
        const parts = await Promise.all(own.map((b) => getBookContents(b.id).catch(() => ({}) as BookContents)))
        const merged: BookContents = {}
        const seen = new Set<string>()
        for (const part of parts) {
          for (const [key, list] of Object.entries(part)) {
            merged[key] ??= []
            for (const entry of list) {
              const eid = entry.id as string | undefined
              const mark = `${key}:${eid ?? JSON.stringify(entry)}`
              if (seen.has(mark)) continue
              seen.add(mark)
              merged[key].push(entry)
            }
          }
        }
        setContents(merged)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  const totals = useMemo<ContentTotals>(() => totalsOf(books), [books])

  if (error) return <p className="status-line is-error">Мир не найден: {error}</p>
  if (!setting) return <p className="status-line">Открываем портал…</p>

  const { ru, en } = splitTitle(setting.settings_title)
  const art = setting.settings_picture_urls[0] ?? settingArt(en, ru, 900, 500)

  return (
    <section className="book-page">
      <Link to="/" className="back-link">
        <ArrowLeft aria-hidden="true" /> ко всем мирам
      </Link>

      <div className="book-hero setting-hero">
        <span className="setting-hero-art" style={{ backgroundImage: `url("${art}")` }} />
        <Corners size={40} />
        <div className="book-meta">
          <span className="setting-kicker">Сеттинг</span>
          <h1 className="book-title gold-text">{ru}</h1>
          {en && <span className="setting-name-en">{en}</span>}
          {setting.settings_description && (
            <p className="setting-hero-desc">{setting.settings_description}</p>
          )}
          <div className="card-chips" style={{ marginTop: 14 }}>
            <span className="chip"><BookOpen aria-hidden="true" />{books.length} книг</span>
            <span className="chip"><Landmark aria-hidden="true" />мир мультивселенной</span>
          </div>
        </div>
      </div>

      <Divider />

      <h2 className="section-title gold-text">Тома мира</h2>
      <p className="section-sub">Летописи и приключения, изданные для этого сеттинга</p>
      <div className="carousel tome-carousel">
        {books.map((b) => {
          const t = splitTitle(b.title)
          return (
            <Link key={b.id} to={`/books/${b.id}`} className="tome-card">
              <span className="tome-card-cover">
                {b.book_cover_url && <img src={b.book_cover_url} alt={b.title} loading="lazy" />}
              </span>
              <span className="hex-code">{b.book_code}</span>
              <span className="tome-card-name">{t.ru}</span>
            </Link>
          )
        })}
      </div>

      <Divider />

      <div className="loot-bar">
        <Corners size={38} />
        <div className="loot-title">Нововведения мира — {ru}</div>
        <LootChips totals={totals} />
      </div>

      {contents ? (
        <TomeSections contents={contents} />
      ) : (
        <p className="status-line">Сводим летописи всех томов…</p>
      )}
    </section>
  )
}
