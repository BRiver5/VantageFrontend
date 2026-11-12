import { isValidElement } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookMarked,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  splitTitle,
} from '../../api'
import type {
  Book,
} from '../../api'
import { type VTDocument, runHeroMorph, whenRouteCommitted } from './transitions'

/* ---------- Мелкие детали карточек ---------- */

export function Chip({ icon, children }: { icon: LucideIcon | ReactNode; children: ReactNode }) {
  // icon может быть готовым элементом (<DieChipIcon/>) ИЛИ компонентом-иконкой.
  // lucide-иконки — это forwardRef-объекты (typeof === 'object', НЕ 'function'),
  // поэтому различаем по isValidElement, а не по typeof — иначе объект уходит в
  // дети и React падает: «Objects are not valid as a React child».
  const Icon = icon as LucideIcon
  return (
    <span className="chip">
      {isValidElement(icon) ? icon : <Icon aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Гекс-жетон со значением (уровень заклинания, CR существа) */
export function HexBadge({ value, label }: { value: string; label: string }) {
  return (
    <span className="hex-badge" title={label}>
      <span className="hex-badge-inner">
        <b>{value}</b>
        <i>{label}</i>
      </span>
    </span>
  )
}

/** Аббревиатура книги-источника; полное название всплывает при наведении */
/** `link` — только вне карточек-ссылок: вложенный <a> в <a> недопустим */
export function SourceBadge({ book, link }: { book: Book | undefined; link?: boolean }) {
  if (!book) return null
  const { ru, en } = splitTitle(book.title)
  const title = en ? `${ru} — ${en}` : ru
  const content = (
    <>
      <BookMarked aria-hidden="true" />
      {book.book_code}
    </>
  )
  return link ? (
    <Link to={`/books/${book.id}`} className="chip source-chip chip--link" title={title}>
      {content}
    </Link>
  ) : (
    <span className="chip source-chip" title={title}>
      {content}
    </span>
  )
}

/**
 * Ссылка-карточка с плавным переходом в детальную (View Transitions API).
 * Пока идёт переход именно к ЭТОЙ карточке — вешаем на неё view-transition-name,
 * и браузер морфит её в «герой» детальной страницы (у которого то же имя),
 * а остальные карточки уезжают влево (см. ::view-transition-* в CSS).
 */
/**
 * Карточка-ссылка. Если задан `onOpen` — раскрываем деталь в оболочке
 * (предметы / path-inline классы); href остаётся для средней/ctrl-кнопки.
 */
export function CardLink({
  to,
  vtName,
  onOpen,
  heroNav,
  children,
}: {
  to: string
  vtName?: string
  onOpen?: (slot: HTMLElement) => void
  /** FLIP-переход на отдельную страницу (расы), пока нет path-inline */
  heroNav?: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()

  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    // модификаторы/средняя кнопка — обычное открытие ссылки (новая вкладка и т.п.)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    // раскрытие на месте: onOpen сам заводит переход, расставив роли до снимка
    if (onOpen) {
      onOpen(e.currentTarget)
      return
    }
    const slot = e.currentTarget
    if (heroNav) {
      // единый принцип «портрет летит в деталь» — общий для рас и классов
      runHeroMorph(slot, () => navigate(to))
      return
    }
    // остальные разделы — обычный кросс-фейд, но с ожиданием коммита навигации
    const doc = document as VTDocument
    if (!doc.startViewTransition) {
      navigate(to)
      return
    }
    document.documentElement.dataset.nav = '1'
    const t = doc.startViewTransition(() => {
      navigate(to)
      return whenRouteCommitted(() => !slot.isConnected)
    })
    const done = () => delete document.documentElement.dataset.nav
    t.finished.then(done, done)
  }

  return (
    <Link
      to={to}
      className="card-slot"
      style={vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
