import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { settingArt, splitTitle } from '../../api'
import type { Book } from '../../api'
import { bgUrl } from '../../media'

/* ---------- Карусель сеттингов ---------- */

/** Псевдо-сеттинг для книг без привязки */
export const BASIC_ID = '__basic'

export const CORE_RULES_ART = '/assets/covers/dnd_landskapes.jpg'

export interface Realm {
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

export function SettingsCarousel({
  realms,
  activeId,
  onSelect,
}: {
  realms: Realm[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  // следим, докручена ли карусель до края — чтобы гасить лишнюю стрелку
  useEffect(() => {
    const el = track.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      setAtStart(el.scrollLeft <= 1)
      setAtEnd(max <= 1 || el.scrollLeft >= max - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [realms.length])

  const scroll = (dir: -1 | 1) => {
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="carousel-shell">
      <button
        type="button"
        className={`car-arrow car-arrow--left${atStart ? ' is-disabled' : ''}`}
        onClick={() => scroll(-1)}
        aria-label="Назад"
        disabled={atStart}
      >
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
                <span className="setting-art" style={{ backgroundImage: `url("${bgUrl(art, 1000)}")` }} aria-hidden="true" />
                <span className="setting-kicker">{realm.id === BASIC_ID ? 'Основа' : 'Сеттинг'}</span>
                <span className="setting-name">
                  {ru}
                  {en && <span className="setting-name-en">{en}</span>}
                </span>
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
      <button
        type="button"
        className={`car-arrow car-arrow--right${atEnd ? ' is-disabled' : ''}`}
        onClick={() => scroll(1)}
        aria-label="Вперёд"
        disabled={atEnd}
      >
        <span><ChevronRight /></span>
      </button>
    </div>
  )
}
