import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Feather,
  ScrollText,
  Star,
} from 'lucide-react'
import { enrichBookContents, getBookContents, getBookFull, getOne, settingPictureUrl, splitTitle } from '../api'
import type { BookContents, BookFull, Setting } from '../api'
import { CONTENT_SECTIONS, scrollToTomeSection } from '../contentSections'
import { Corners, CoverImage, Divider } from '../ornaments'
import { TomeSections } from './bookContentsUi'
import { bgUrl } from '../media'


export default function BookPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [book, setBook] = useState<BookFull | null>(null)
  const [contents, setContents] = useState<BookContents | null>(null)
  const [setting, setSetting] = useState<Setting | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setBook(null)
    setContents(null)
    setSetting(null)
    Promise.all([getBookFull(id), getBookContents(id)])
      .then(async ([b, c]) => {
        setBook(b)
        setContents(await enrichBookContents(c, b))
        // обои мира книги — для hero-фона
        if (b.settings_id) {
          getOne<Setting>('settings', b.settings_id).then(setSetting).catch(() => {})
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  // только то, что в книге действительно есть, и существа тоже
  const present = useMemo(() => (contents ? CONTENT_SECTIONS.map((s) => ({ ...s, count: contents[s.key]?.length ?? 0 })).filter((s) => s.count > 0) : []), [contents])

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
  const heroArt = setting ? settingPictureUrl(setting, 1600, 720) : null
  // у книг вне сеттинга обоев мира нет — тогда фоном шапки идёт размытая обложка
  const bleedArt = heroArt ?? book.book_cover_url

  return (
    <section className="book-page">
      <Link to={book.settings_id ? `/settings/${book.settings_id}` : '/'} className="back-link">
        <ArrowLeft aria-hidden="true" /> {book.settings_id ? 'к миру' : 'назад к сеттингам'}
      </Link>

      <div className={`world-hero${bleedArt ? '' : ' world-hero--plain'}`}>
        {bleedArt && (
          <span
            className={`world-hero-bg${heroArt ? '' : ' world-hero-bg--cover'}`}
            style={{ backgroundImage: `url("${bgUrl(bleedArt)}")` }}
            aria-hidden="true"
          />
        )}
        <div className="world-hero-inner book-hero-inner">
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
      </div>

      <Divider />

      {contents && (
        <div className="loot-bar">
          <Corners size={38} />
          <div className="loot-title">{present.length ? 'Что добавляет книга' : 'В книге пока ничего не отмечено'}</div>
          {present.length > 0 && (
            <div className="loot-grid">
              {present.map(({ key, label, icon: Icon, count }) => (
                <button key={key} type="button" className="loot-chip loot-chip--clickable" onClick={() => scrollToTomeSection(key)} title={`Показать: ${label}`}>
                  <Icon aria-hidden="true" />
                  <span className="loot-num">{count}</span> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {contents && <TomeSections contents={contents} />}
    </section>
  )
}
