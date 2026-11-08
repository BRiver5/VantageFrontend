/**
 * Термины D&D: список по разделам (GET /terms) и страница термина
 * (GET /terms/{slug}). Тело — Markdown со ссылками `[текст](term:slug)`;
 * при наведении на ссылку — карточка с кратким описанием.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookMarked, Search } from 'lucide-react'
import { request } from '../api'
import { parseBlocks, parseInline, type Block, type Inline } from '../rooms/kb/mdparse'
import { getTerm, loadTerms, TermRef, type TermPage, type TermSummary } from './terms'

const ORDER = ['Основы', 'Характеристики', 'Навыки', 'Бой', 'Урон', 'Состояния', 'Магия', 'Чувства', 'Окружение', 'Отдых', 'Существа', 'Снаряжение', 'Классы']

/* ---------- Markdown страницы термина ---------- */

function Inl({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <Fragment key={i}>{n.v}</Fragment>
          case 'b':
            return (
              <b key={i}>
                <Inl nodes={n.c} />
              </b>
            )
          case 'i':
            return (
              <i key={i}>
                <Inl nodes={n.c} />
              </i>
            )
          case 's':
            return (
              <s key={i}>
                <Inl nodes={n.c} />
              </s>
            )
          case 'code':
            return <code key={i}>{n.v}</code>
          case 'br':
            return <br key={i} />
          case 'img':
            return <img key={i} src={n.src} alt={n.alt} loading="lazy" className="tm-img" />
          case 'link':
            if (n.href.startsWith('term:')) {
              return (
                <TermRef key={i} slug={n.href.slice(5)}>
                  <Inl nodes={n.c} />
                </TermRef>
              )
            }
            return (
              <a key={i} href={n.href} target="_blank" rel="noreferrer">
                <Inl nodes={n.c} />
              </a>
            )
          case 'tag':
            return <Fragment key={i}>#{n.v}</Fragment>
          case 'wiki':
            return <Fragment key={i}>{n.label}</Fragment>
        }
        return null
      })}
    </>
  )
}
const line = (s: string) => <Inl nodes={parseInline(s)} />

function Blocks({ blocks }: { blocks: Block[] }): ReactNode {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'h': {
        const H = `h${Math.min(4, b.level + 1)}` as 'h2' | 'h3' | 'h4'
        return <H key={i}>{line(b.text)}</H>
      }
      case 'p':
        return <p key={i}>{line(b.text)}</p>
      case 'list': {
        const L = b.ordered ? 'ol' : 'ul'
        return (
          <L key={i}>
            {b.items.map((it, j) => (
              <li key={j} style={it.depth ? { marginLeft: it.depth * 18 } : undefined}>
                {line(it.text)}
              </li>
            ))}
          </L>
        )
      }
      case 'quote':
      case 'callout':
        return (
          <blockquote key={i}>
            <Blocks blocks={b.blocks} />
          </blockquote>
        )
      case 'code':
        return (
          <pre key={i}>
            <code>{b.text}</code>
          </pre>
        )
      case 'hr':
        return <hr key={i} />
      case 'table':
        return (
          <div key={i} className="tm-table">
            <table>
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j} style={{ textAlign: b.align[j] === 'c' ? 'center' : b.align[j] === 'r' ? 'right' : 'left' }}>
                      {line(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} style={{ textAlign: b.align[k] === 'c' ? 'center' : b.align[k] === 'r' ? 'right' : 'left' }}>
                        {line(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      default:
        return null
    }
  })
}

export function TermMarkdown({ src }: { src: string }) {
  const blocks = useMemo(() => parseBlocks(src), [src])
  return (
    <div className="tm-body">
      <Blocks blocks={blocks} />
    </div>
  )
}

/* ---------- список ---------- */

export function TermsIndexPage() {
  const [all, setAll] = useState<TermSummary[] | null>(null)
  const [cat, setCat] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<string[] | null>(null)

  useEffect(() => {
    void loadTerms().then(setAll)
  }, [])
  // нечёткий поиск сервера: опечатки, раскладка, текст страницы
  useEffect(() => {
    const query = q.trim()
    if (!query) return setFound(null)
    let on = true
    const t = setTimeout(() => {
      request<{ items: { id: string }[] }>(`/search/terms?q=${encodeURIComponent(query)}&limit=60`).then(
        (r) => on && setFound((r?.items ?? []).map((x) => x.id)),
        () => on && setFound([]),
      )
    }, 220)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])

  const cats = useMemo(() => {
    const set = new Set((all ?? []).map((t) => t.category))
    return [...ORDER.filter((c) => set.has(c)), ...[...set].filter((c) => !ORDER.includes(c))]
  }, [all])
  const bySlug = useMemo(() => new Map((all ?? []).map((t) => [t.slug, t])), [all])
  const list = found ? found.map((s) => bySlug.get(s)).filter((t): t is TermSummary => !!t) : (all ?? []).filter((t) => !cat || t.category === cat)
  const groups = found ? [{ cat: 'Найдено', items: list }] : cats.filter((c) => !cat || c === cat).map((c) => ({ cat: c, items: list.filter((t) => t.category === c) }))

  return (
    <section className="book-page tm-page">
      <header className="tm-head">
        <span className="setting-kicker">База знаний</span>
        <h1 className="book-title gold-text">Термины D&amp;D</h1>
        <p className="tm-lede">Правила одним абзацем: что такое Сл, преимущество, укрытие, состояния. Ссылки на них стоят во всех описаниях каталога.</p>
        <label className="tm-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Сл, укрытие, три успеха стабилизация…" aria-label="Поиск термина" />
        </label>
        {!q && (
          <nav className="tm-cats" aria-label="Разделы">
            <button type="button" className={!cat ? 'is-on' : ''} onClick={() => setCat(null)}>
              Все
            </button>
            {cats.map((c) => (
              <button key={c} type="button" className={cat === c ? 'is-on' : ''} onClick={() => setCat(cat === c ? null : c)}>
                {c}
              </button>
            ))}
          </nav>
        )}
      </header>
      {!all && <p className="status-line">Открываем глоссарий…</p>}
      {found && found.length === 0 && <p className="status-line">Ничего не нашлось.</p>}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.cat} className="tm-group">
            <h2 className="home-h2">{g.cat}</h2>
            <ul className="tm-grid">
              {g.items.map((t) => (
                <li key={t.slug}>
                  <Link to={`/terms/${t.slug}`} className="tm-card">
                    {t.icon_url ? <TermIcon url={t.icon_url} /> : <BookMarked aria-hidden="true" />}
                    <b>{t.title}</b>
                    <span>{t.short}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  )
}

/* ---------- страница термина ---------- */

export function TermDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [t, setT] = useState<TermPage | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    setT(null)
    setErr(null)
    getTerm(slug).then(
      (x) => on && setT(x),
      (e) => on && setErr(e instanceof Error ? e.message : 'Термин не найден'),
    )
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    return () => {
      on = false
    }
  }, [slug])

  return (
    <section className="book-page tm-page">
      <Link to="/terms" className="back-link">
        <ArrowLeft aria-hidden="true" /> ко всем терминам
      </Link>
      {err && <p className="status-line is-error">{err}</p>}
      {!t && !err && <p className="status-line">Открываем…</p>}
      {t && (
        <article className="tm-article">
          <header className="tm-art-head">
            {t.icon_url && (
              <span className="tm-icon">
                <TermIcon url={t.icon_url} />
              </span>
            )}
            <div>
              <span className="setting-kicker">{t.category}</span>
              <h1 className="book-title gold-text">{t.title}</h1>
              {t.aliases.length > 0 && <p className="tm-aliases">Ещё пишут: {t.aliases.join(', ')}</p>}
              <p className="tm-short">{t.short}</p>
            </div>
          </header>
          <TermMarkdown src={t.body} />
          {(t.documents ?? 0) > 0 && (
            <p className="tm-stat">
              Встречается в {t.documents} {plural(t.documents ?? 0, 'записи', 'записях', 'записях')} каталога
            </p>
          )}
          {t.related.length > 0 && (
            <div className="tm-rel">
              <h2>См. также</h2>
              <TermChips list={t.related} />
            </div>
          )}
          {t.mentioned_on.length > 0 && (
            <div className="tm-rel">
              <h2>Ссылаются на этот термин</h2>
              <TermChips list={t.mentioned_on} />
            </div>
          )}
          {t.icon_attribution && <p className="tm-credit">{t.icon_attribution}</p>}
        </article>
      )}
    </section>
  )
}

function TermChips({ list }: { list: TermSummary[] }) {
  return (
    <div className="card-chips">
      {list.map((r) => (
        <Link key={r.slug} to={`/terms/${r.slug}`} className="chip" title={r.short}>
          {r.title}
        </Link>
      ))}
    </div>
  )
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** Иконка game-icons: белый знак на чёрном. Наложение «screen» убирает чёрный фон, фильтр красит знак в золото */
function TermIcon({ url }: { url: string }) {
  return <img className="tm-glyph" src={url} alt="" loading="lazy" draggable={false} />
}
