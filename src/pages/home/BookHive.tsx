import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookOpen,
} from 'lucide-react'
import { getBookContents, splitTitle } from '../../api'
import type { Book, BookContents } from '../../api'
import { Corners } from '../../ornaments'
import { bookSectionEntries, contentEntryLink, HEX_EXPAND_ROWS } from '../../contentSections'
import { Img } from '../../media'
import { HEX_DWELL_MS, layoutHive } from '../../ui/hive'

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
    <Img
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
  }).filter((r) => r.count > 0)
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
          <span className="hex-expand-title-text">{total ? 'В книге' : 'Пока пусто'}</span>
          {total > 0 && <span className="hex-expand-total">{total}</span>}
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
              <li key={key} className="hex-expand-row">
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

export function BookHive({ books, loading }: { books: Book[]; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ s: 196, cols: 5 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === 0) return
      // на телефоне три соты в ряд: улей заметно короче
      const s = w < 330 ? 130 : w < 620 ? Math.min(150, Math.floor(w / 3) - 14) : w < 980 ? 172 : 196
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
