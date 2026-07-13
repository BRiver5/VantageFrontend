import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cleanDescription, fetchAll } from '../api'
import type { Termin } from '../api'

export interface TermIndex {
  byName: Map<string, string>
  regex: RegExp | null
}

const EMPTY_INDEX: TermIndex = { byName: new Map(), regex: null }

const TermsContext = createContext<TermIndex>(EMPTY_INDEX)

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Индекс терминов: длинные названия первыми, чтобы «Бонусное действие» не резалось на «Действие». */
export function buildTermIndex(termins: { id: string; name: string }[]): TermIndex {
  const byName = new Map<string, string>()
  for (const t of termins) {
    byName.set(t.name, t.id)
    const m = t.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (m) byName.set(m[2].trim(), t.id)
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  if (names.length === 0) return EMPTY_INDEX
  const regex = new RegExp(`(${names.map(escapeRegex).join('|')})`, 'gu')
  return { byName, regex }
}

export function TermsProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<TermIndex>(EMPTY_INDEX)
  useEffect(() => {
    fetchAll<Termin>('termins')
      .then((items) => setIndex(buildTermIndex(items)))
      .catch(() => {})
  }, [])
  return <TermsContext.Provider value={index}>{children}</TermsContext.Provider>
}

export function useTermIndex(): TermIndex {
  return useContext(TermsContext)
}

/**
 * Оборачивает вхождения терминов в ссылки на статьи.
 * asLinks=false — рендерит термин как <span> (без <a>): нужно внутри карточек,
 * которые сами являются ссылкой (<a>), иначе получаются вложенные <a> в <a> —
 * невалидный HTML, браузер перестраивает DOM и ломает переходы React.
 */
export function highlightTerms(
  text: string,
  index: TermIndex,
  keyPrefix = '',
  asLinks = true,
): ReactNode[] {
  if (!text) return []
  if (!index.regex) return [text]
  const parts = text.split(index.regex)
  const out: ReactNode[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (i % 2 === 1) {
      const id = index.byName.get(part)
      if (id) {
        const key = `${keyPrefix}${i}-${part}`
        out.push(
          asLinks ? (
            <Link key={key} to={`/termins/${id}`} className="term-link">
              {part}
            </Link>
          ) : (
            <span key={key} className="term-link term-link--plain">
              {part}
            </span>
          ),
        )
        continue
      }
    }
    out.push(part)
  }
  return out
}

/** Абзацы + **жирный** + подсветка терминов */
export function RichText({ text }: { text: string | null | undefined }) {
  const index = useTermIndex()
  const clean = cleanDescription(text)
  if (!clean) return null
  return (
    <div className="rich">
      {clean.split(/\n+/).map((para, i) => (
        <p key={i}>
          {para.split(/\*{2,3}([^*]+)\*{2,3}/g).map((part, j) => {
            const nodes = highlightTerms(part, index, `${i}-${j}-`)
            return j % 2 ? <b key={j}>{nodes}</b> : nodes
          })}
        </p>
      ))}
    </div>
  )
}

/** Краткое описание в карточках каталога */
export function TermDesc({
  text,
  className = 'card-desc',
}: {
  text: string | null | undefined
  className?: string
}) {
  const index = useTermIndex()
  const clean = cleanDescription(text)
  if (!clean) return null
  // карточки каталога — сами ссылки, поэтому термины БЕЗ вложенных <a> (asLinks=false)
  return <p className={className}>{highlightTerms(clean, index, '', false)}</p>
}
