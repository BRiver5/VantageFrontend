import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Feather,
  ScrollText,
  Star,
} from 'lucide-react'
import { enrichBookContents, getBookContents, getBookFull, splitTitle } from '../api'
import type { BookContents, BookFull, ContentTotals } from '../api'
import { scrollToTomeSection } from '../contentSections'
import { Corners, CoverImage, Divider } from '../ornaments'
import { LootChips } from '../App'
import { TomeSections } from './bookContentsUi'

function totalsFromContents(contents: BookContents): ContentTotals {
  return {
    classes: contents.classes?.length ?? 0,
    subclasses: contents.subclasses?.length ?? 0,
    races: contents.races?.length ?? 0,
    subraces: contents.subraces?.length ?? 0,
    feats: contents.feats?.length ?? 0,
    backgrounds: contents.backgrounds?.length ?? 0,
    spells: contents.spells?.length ?? 0,
    items: contents.items?.length ?? 0,
  }
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [book, setBook] = useState<BookFull | null>(null)
  const [contents, setContents] = useState<BookContents | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setBook(null)
    setContents(null)
    Promise.all([getBookFull(id), getBookContents(id)])
      .then(async ([b, c]) => {
        setBook(b)
        setContents(await enrichBookContents(c, b))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  const totals = useMemo(() => (contents ? totalsFromContents(contents) : null), [contents])

  useEffect(() => {
    if (!contents) return
    const hash = location.hash.replace(/^#/, '')
    if (!hash.startsWith('tome-')) return
    const key = hash.slice(5)
    requestAnimationFrame(() => scrollToTomeSection(key))
  }, [contents, location.hash])

  if (error) return <p className="status-line is-error">Том не найден: {error}</p>
  if (!book) return <p className="status-line">Разворачиваем свиток…</p>

  const { ru, en } = splitTitle(book.title)
  const year = book.published_date ? new Date(book.published_date).getFullYear() : null

  return (
    <section className="book-page">
      <Link to={book.settings_id ? `/settings/${book.settings_id}` : '/'} className="back-link">
        <ArrowLeft aria-hidden="true" /> {book.settings_id ? 'к миру' : 'к сотам архива'}
      </Link>

      <div className="book-hero">
        <Corners size={40} />
        <div className="book-cover">
          <CoverImage src={book.book_cover_url} alt={book.title} />
        </div>
        <div className="book-meta">
          <span className="setting-kicker">{book.book_code}</span>
          <h1 className="book-title gold-text">{ru}</h1>
          {en && <span className="setting-name-en">{en}</span>}
          <div className="card-chips" style={{ marginTop: 14 }}>
            <span className="chip"><Feather aria-hidden="true" />{book.author}</span>
            {book.pages_count > 0 && <span className="chip"><BookOpen aria-hidden="true" />{book.pages_count} стр.</span>}
            {year && <span className="chip"><ScrollText aria-hidden="true" />{year}</span>}
            {book.supported_versions?.map((v) => (
              <span key={v} className="chip"><Star aria-hidden="true" />{v}</span>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {totals && (
        <div className="loot-bar">
          <Corners size={38} />
          <div className="loot-title">Нововведения тома — {ru}</div>
          <LootChips totals={totals} onSelect={(key) => scrollToTomeSection(key)} />
        </div>
      )}

      {contents && <TomeSections contents={contents} />}
    </section>
  )
}
