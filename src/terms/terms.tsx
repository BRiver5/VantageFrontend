/**
 * Термины D&D в текстах. Сервер находит их сам и присылает позиции
 * (`term_links` деталей каталога, `POST /terms/link` для своих текстов) —
 * клиент только режет строку и ставит ссылки на /terms/{slug}. Регулярками на
 * клиенте не ищем: в JS `\b` не понимает кириллицу, результат разошёлся бы с
 * сервером. Запасной путь — только точные названия и сокращения, и только там,
 * где серверных ссылок нет (краткие описания в карточках списков).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cleanDescription, request } from '../api'
import { termLinksFor, type TermLink } from './registry'

export type { TermLink }

export interface TermSummary {
  slug: string
  title: string
  category: string
  short: string
  aliases: string[]
  link: 'all' | 'first'
  mentions?: number
  documents?: number
  icon_url?: string | null
}
export interface TermPage extends TermSummary {
  icon_attribution: string | null
  body: string
  related: TermSummary[]
  mentioned_on: TermSummary[]
}

export interface TermIndex {
  /** название или сокращение → slug: запасной поиск */
  byName: Map<string, string>
  regex: RegExp | null
  /** slug → термин: подсказка при наведении, режим ссылок */
  bySlug: Map<string, TermSummary>
}

const EMPTY_INDEX: TermIndex = { byName: new Map(), regex: null, bySlug: new Map() }
const TermsContext = createContext<TermIndex>(EMPTY_INDEX)

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** «Сложность (Сл)» → «Сложность» и «Сл»; плюс синонимы. Длинные первыми */
export function buildTermIndex(terms: TermSummary[]): TermIndex {
  const byName = new Map<string, string>()
  const bySlug = new Map<string, TermSummary>()
  for (const t of terms) {
    bySlug.set(t.slug, t)
    const m = t.title.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    const names = m ? [m[1].trim(), m[2].trim()] : [t.title]
    for (const n of [...names, ...(t.aliases ?? [])]) if (n && n.length > 1 && !/\d/.test(n)) byName.set(n, t.slug)
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  // границы слова для кириллицы: ни буквы, ни цифры по бокам
  const regex = names.length ? new RegExp(`(?<![\\p{L}\\d])(${names.map(escapeRegex).join('|')})(?![\\p{L}\\d])`, 'gu') : null
  return { byName, regex, bySlug }
}

let listPromise: Promise<TermSummary[]> | null = null
export function loadTerms(): Promise<TermSummary[]> {
  listPromise ??= request<{ items: TermSummary[] }>('/terms').then(
    (r) => r?.items ?? [],
    () => ((listPromise = null), []),
  )
  return listPromise
}

export function TermsProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<TermIndex>(EMPTY_INDEX)
  useEffect(() => {
    void loadTerms().then((items) => items.length && setIndex(buildTermIndex(items)))
  }, [])
  return <TermsContext.Provider value={index}>{children}</TermsContext.Provider>
}

export function useTermIndex(): TermIndex {
  return useContext(TermsContext)
}

/** Ссылка на термин с карточкой при наведении */
export function TermRef({ slug, children, plain = false }: { slug: string; children: ReactNode; plain?: boolean }) {
  const { bySlug } = useTermIndex()
  const t = bySlug.get(slug)
  const tip = t ? (
    <span className="term-tip" role="tooltip">
      <b>{t.title}</b>
      {t.short}
    </span>
  ) : null
  // внутри карточек-ссылок вложенный <a> нельзя — тогда просто подсветка
  if (plain) {
    return (
      <span className="term-link term-link--plain">
        {children}
        {tip}
      </span>
    )
  }
  return (
    <Link to={`/terms/${slug}`} className="term-link">
      {children}
      {tip}
    </Link>
  )
}

/**
 * Запасной путь: точные названия. Оставлен для текстов без серверных ссылок
 * (карточки списков, способности). asLinks=false — без <a>: внутри карточек,
 * которые сами ссылки.
 */
export function highlightTerms(text: string, index: TermIndex, keyPrefix = '', asLinks = true): ReactNode[] {
  if (!text) return []
  if (!index.regex) return [text]
  const parts = text.split(index.regex)
  const out: ReactNode[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    const slug = i % 2 === 1 ? index.byName.get(part) : undefined
    if (slug) {
      out.push(
        <TermRef key={`${keyPrefix}${i}-${part}`} slug={slug} plain={!asLinks}>
          {part}
        </TermRef>,
      )
    } else out.push(part)
  }
  return out
}

/* ---------- ссылки по позициям сервера ---------- */

// метки в тексте: переживают очистку HTML и разбивку на абзацы
const OPEN = ''
const MID = ''
const CLOSE = ''
const MARK = /([^]*)([^]*)/g

/** Вставить метки ссылок в исходную строку. Частые слова — только первое упоминание */
export function markLinks(text: string, links: TermLink[], index: TermIndex): string {
  const use = links
    .filter((l) => l.end > l.start && l.end <= text.length && (l.first || (index.bySlug.get(l.slug)?.link ?? 'all') !== 'first'))
    .sort((a, b) => b.start - a.start)
  let out = text
  let guard = Infinity
  for (const l of use) {
    if (l.end > guard) continue // пересечения сервер уже снял, но на всякий случай
    out = out.slice(0, l.start) + OPEN + l.slug + MID + out.slice(l.start, l.end) + CLOSE + out.slice(l.end)
    guard = l.start
  }
  return out
}

/** Кусок текста с метками → узлы со ссылками */
function renderMarked(text: string, keyPrefix: string, asLinks: boolean): ReactNode[] {
  if (!text.includes(OPEN)) return [text.replace(/[]/g, '')]
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MARK)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <TermRef key={`${keyPrefix}${at}`} slug={m[1]} plain={!asLinks}>
        {m[2]}
      </TermRef>,
    )
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  // осиротевшие метки (ссылку разрезал абзац или жирный) — убрать
  return out.map((n) => (typeof n === 'string' ? n.replace(/[^]*/g, '').replace(/[-]/g, '') : n))
}

/** Строка с серверными ссылками, если они есть, иначе — запасная подсветка */
function linked(part: string, marked: boolean, index: TermIndex, key: string, asLinks = true): ReactNode[] {
  return marked ? renderMarked(part, key, asLinks) : highlightTerms(part, index, key, asLinks)
}

/** Абзацы + **жирный** + ссылки на термины */
export function RichText({ text, links }: { text: string | null | undefined; links?: TermLink[] | null }) {
  const index = useTermIndex()
  if (!text) return null
  const server = links ?? termLinksFor(text)
  const marked = !!server?.length
  const clean = cleanDescription(marked ? markLinks(text, server!, index) : text)
  if (!clean) return null
  return (
    <div className="rich">
      {clean.split(/\n+/).map((para, i) => (
        <p key={i}>
          {para.split(/\*{2,3}([^*]+)\*{2,3}/g).map((part, j) => {
            const nodes = linked(part, marked, index, `${i}-${j}-`)
            return j % 2 ? <b key={j}>{nodes}</b> : nodes
          })}
        </p>
      ))}
    </div>
  )
}

/** Краткое описание в карточках каталога: без вложенных ссылок */
export function TermDesc({ text, className = 'card-desc' }: { text: string | null | undefined; className?: string }) {
  const index = useTermIndex()
  if (!text) return null
  const server = termLinksFor(text)
  const marked = !!server?.length
  const clean = cleanDescription(marked ? markLinks(text, server!, index) : text)
  if (!clean) return null
  return <p className={className}>{linked(clean, marked, index, '', false)}</p>
}

/* ---------- свои тексты: POST /terms/link ---------- */

const linkCache = new Map<string, Promise<TermLink[]>>()
/** Ссылки для произвольного текста (заметки, чат, свои описания) */
export function linkTerms(text: string): Promise<TermLink[]> {
  let p = linkCache.get(text)
  if (!p) {
    p = request<{ links: TermLink[] }>('/terms/link', { method: 'POST', body: { text } }).then(
      (r) => r?.links ?? [],
      () => (linkCache.delete(text), []),
    )
    linkCache.set(text, p)
    if (linkCache.size > 400) linkCache.delete(linkCache.keys().next().value as string)
  }
  return p
}

/** Текст со ссылками, которые сервер нашёл в нём на лету */
export function useLinkedText(text: string | null | undefined): TermLink[] | null {
  const [links, setLinks] = useState<{ for: string; list: TermLink[] } | null>(null)
  useEffect(() => {
    if (!text || termLinksFor(text)) return
    let on = true
    void linkTerms(text).then((list) => on && setLinks({ for: text, list }))
    return () => {
      on = false
    }
  }, [text])
  return text && links?.for === text ? links.list : null
}

export const getTerm = (slug: string) => request<TermPage>(`/terms/${encodeURIComponent(slug)}`)
