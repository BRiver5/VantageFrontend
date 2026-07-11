import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Feather,
  Gem,
  Landmark,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Users,
  VenetianMask,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { displayName, getBookContents, getBookFull, splitTitle } from '../api'
import type { BookContents, BookFull } from '../api'
import { Corners, CoverImage, Divider } from '../ornaments'

/** Разделы содержимого; base — маршрут детальной страницы, если она есть */
const SECTIONS: { key: string; label: string; icon: LucideIcon; base?: string }[] = [
  { key: 'classes', label: 'Классы', icon: Swords, base: '/classes' },
  { key: 'subclasses', label: 'Подклассы', icon: Shield },
  { key: 'races', label: 'Расы', icon: VenetianMask, base: '/races' },
  { key: 'subraces', label: 'Подрасы', icon: Users },
  { key: 'feats', label: 'Черты', icon: Star, base: '/feats' },
  { key: 'backgrounds', label: 'Предыстории', icon: Landmark },
  { key: 'spells', label: 'Заклинания', icon: Sparkles, base: '/spells' },
  { key: 'items', label: 'Предметы', icon: Gem, base: '/items' },
  { key: 'creatures', label: 'Существа', icon: Skull, base: '/bestiary' },
]

/** Раскрывающиеся разделы содержимого книги/сеттинга с ссылками на записи */
export function TomeSections({ contents }: { contents: BookContents }) {
  return (
    <div className="book-sections">
      {SECTIONS.map(({ key, label, icon: Icon, base }) => {
        const list = contents[key] ?? []
        if (list.length === 0) return null
        return (
          <details key={key} className="tome-section" open={list.length <= 30}>
            <summary>
              <Icon aria-hidden="true" />
              <span className="tome-section-name">{label}</span>
              <b className="loot-num">{list.length}</b>
            </summary>
            <div className="tome-entries">
              {list.map((entry, i) => {
                const eid = entry.id as string | undefined
                const name = displayName(entry)
                return base && eid ? (
                  <Link key={eid} className="tome-entry tome-entry--link" to={`${base}/${eid}`}>
                    {name}
                  </Link>
                ) : (
                  <span key={eid ?? i} className="tome-entry">{name}</span>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<BookFull | null>(null)
  const [contents, setContents] = useState<BookContents | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setBook(null)
    setContents(null)
    Promise.all([getBookFull(id), getBookContents(id)])
      .then(([b, c]) => {
        setBook(b)
        setContents(c)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

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

      {contents && <TomeSections contents={contents} />}
    </section>
  )
}
