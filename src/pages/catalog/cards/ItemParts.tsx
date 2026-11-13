import { useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Gem,
} from 'lucide-react'
import {
  splitTitle,
} from '../../../api'
import type {
  Book,
} from '../../../api'
import { Img } from '../../../media'

/** Арт предмета в карточке сетки: прозрачная картинка со свечением редкости за ней. */
export function ItemCardArt({ src, alt, vtName }: { src: string | null; alt: string; vtName?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span
      className="item-card-art"
      style={vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined}
    >
      <span className="item-card-glow" aria-hidden="true" />
      {src && !broken ? (
        <Img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Gem className="item-card-fallback" aria-hidden="true" />
      )}
    </span>
  )
}

/** Код книги в углу карточки предмета — ведёт на страницу книги, не раскрывая карточку. */
export function ItemSourceLink({ book }: { book: Book | undefined }) {
  const navigate = useNavigate()
  if (!book) return null
  const { ru, en } = splitTitle(book.title)
  const go = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/books/${book.id}`)
  }
  return (
    <span
      className="item-card-source"
      role="link"
      tabIndex={0}
      title={en ? `${ru} — ${en}` : ru}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') go(e)
      }}
    >
      {book.book_code}
      <ArrowUpRight aria-hidden="true" />
    </span>
  )
}
