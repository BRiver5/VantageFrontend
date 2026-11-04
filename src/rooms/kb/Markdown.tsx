/**
 * Отрисовка страницы базы знаний: блоки и строчная разметка из markdown.ts —
 * в React-элементы. Ссылки [[…]] ведут на страницы (нет такой — пунктир, клик
 * создаёт), ![[…]] встраивает страницу, задачи отмечаются прямо в чтении.
 */
import { Fragment, useState, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, ChevronRight, Flame, Info, Lightbulb, Quote, ScrollText, Skull, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Img } from '../../media'
import { parseBlocks, parseInline, parsePage, replaceWidget, toggleTask, type Block, type Inline, type WidgetKind } from './mdparse'
import { BoardWidget, RandomWidget } from './widgets'

export interface PageLookup {
  /** есть ли страница с таким названием (без регистра) */
  has: (title: string) => boolean
  /** текст страницы: для ![[встраивания]] */
  body: (title: string) => string | null
  titles: string[]
}

interface Ctx {
  pages: PageLookup
  onOpen: (title: string) => void
  onTag?: (tag: string) => void
  /** есть — страницу можно менять из чтения (задачи, доски) */
  onChange?: (next: string) => void
  src: string
  depth: number
}

const CALLOUT: Record<string, { icon: LucideIcon; label: string }> = {
  note: { icon: Info, label: 'Заметка' },
  info: { icon: Info, label: 'Сведения' },
  tip: { icon: Lightbulb, label: 'Подсказка' },
  hint: { icon: Lightbulb, label: 'Подсказка' },
  warning: { icon: AlertTriangle, label: 'Осторожно' },
  danger: { icon: Skull, label: 'Опасно' },
  secret: { icon: Sparkles, label: 'Тайна' },
  quote: { icon: Quote, label: 'Цитата' },
  lore: { icon: ScrollText, label: 'Предание' },
  fire: { icon: Flame, label: 'Важно' },
}

function inline(nodes: Inline[], ctx: Ctx, key = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`
    switch (n.t) {
      case 'text':
        return <Fragment key={k}>{n.v}</Fragment>
      case 'b':
        return <strong key={k}>{inline(n.c, ctx, k)}</strong>
      case 'i':
        return <em key={k}>{inline(n.c, ctx, k)}</em>
      case 's':
        return <s key={k}>{inline(n.c, ctx, k)}</s>
      case 'code':
        return <code key={k}>{n.v}</code>
      case 'br':
        return <br key={k} />
      case 'tag':
        return (
          <button key={k} type="button" className="kb-tag" onClick={() => ctx.onTag?.(n.v)}>
            #{n.v}
          </button>
        )
      case 'img':
        return <Img key={k} className="kb-img" src={n.src} alt={n.alt} loading="lazy" />
      case 'link': {
        const safe = /^(https?:|mailto:)/i.test(n.href)
        return safe ? (
          <a key={k} href={n.href} target="_blank" rel="noreferrer noopener">
            {inline(n.c, ctx, k)}
          </a>
        ) : (
          <span key={k}>{inline(n.c, ctx, k)}</span>
        )
      }
      case 'wiki': {
        if (n.embed) return <Embed key={k} title={n.page} ctx={ctx} />
        const exists = ctx.pages.has(n.page)
        return (
          <button key={k} type="button" className={`kb-wiki${exists ? '' : ' is-missing'}`} onClick={() => ctx.onOpen(n.page)} title={exists ? n.page : `Создать «${n.page}»`}>
            {n.label}
          </button>
        )
      }
    }
  })
}

/** Строки абзаца: перенос внутри абзаца сохраняем */
const lines = (text: string, ctx: Ctx, key: string) =>
  text.split('\n').flatMap((l, i, all) => [...inline(parseInline(l), ctx, `${key}-${i}-`), ...(i < all.length - 1 ? [<br key={`${key}-br${i}`} />] : [])])

function Embed({ title, ctx }: { title: string; ctx: Ctx }) {
  const body = ctx.pages.body(title)
  if (ctx.depth >= 2 || body == null) {
    return (
      <button type="button" className="kb-wiki is-missing" onClick={() => ctx.onOpen(title)}>
        {title}
      </button>
    )
  }
  return (
    <span className="kb-embed">
      <button type="button" className="kb-embed-head" onClick={() => ctx.onOpen(title)}>
        <BookOpen aria-hidden="true" /> {title}
      </button>
      <span className="kb-embed-body">
        <MarkdownBody src={body} pages={ctx.pages} onOpen={ctx.onOpen} depth={ctx.depth + 1} />
      </span>
    </span>
  )
}

function Callout({ b, ctx, k }: { b: Extract<Block, { t: 'callout' }>; ctx: Ctx; k: string }) {
  const [open, setOpen] = useState(b.fold !== '-')
  const def = CALLOUT[b.kind] ?? CALLOUT.note
  const Icon = def.icon
  return (
    <aside className={`kb-callout is-${CALLOUT[b.kind] ? b.kind : 'note'}${open ? '' : ' is-closed'}`}>
      <button type="button" className="kb-callout-head" onClick={() => b.fold && setOpen((v) => !v)} disabled={!b.fold}>
        <Icon aria-hidden="true" />
        <b>{b.title ? inline(parseInline(b.title), ctx, `${k}t`) : def.label}</b>
        {b.fold && <ChevronRight className="kb-fold" aria-hidden="true" />}
      </button>
      {open && <div className="kb-callout-body">{blocks(b.blocks, ctx, `${k}c`)}</div>}
    </aside>
  )
}

function Widget({ b, ctx }: { b: Extract<Block, { t: 'widget' }>; ctx: Ctx }) {
  const change = (kind: WidgetKind) => (raw: string) => ctx.onChange?.(replaceWidget(ctx.src, b.from, b.to, kind, raw))
  if (b.kind === 'board') return <BoardWidget raw={b.raw} editable={!!ctx.onChange && ctx.depth === 0} onChange={change('board')} onOpenPage={ctx.onOpen} pages={ctx.pages.titles} />
  return <RandomWidget raw={b.raw} canRoll={!!ctx.onChange} />
}

function blocks(list: Block[], ctx: Ctx, key = ''): ReactNode[] {
  return list.map((b, i) => {
    const k = `${key}${i}`
    switch (b.t) {
      case 'h': {
        const H = (`h${Math.min(4, b.level + 1)}` as 'h2' | 'h3' | 'h4')
        return (
          <H key={k} id={b.id} className={`kb-h is-${b.level}`}>
            {inline(parseInline(b.text), ctx, k)}
          </H>
        )
      }
      case 'p':
        return <p key={k}>{lines(b.text, ctx, k)}</p>
      case 'hr':
        return <hr key={k} className="kb-hr" />
      case 'code':
        return (
          <pre key={k} className="kb-code">
            <code>{b.text}</code>
          </pre>
        )
      case 'quote':
        return (
          <blockquote key={k} className="kb-quote">
            {blocks(b.blocks, ctx, `${k}q`)}
          </blockquote>
        )
      case 'callout':
        return <Callout key={k} b={b} ctx={ctx} k={k} />
      case 'widget':
        return <Widget key={k} b={b} ctx={ctx} />
      case 'table':
        return (
          <div key={k} className="kb-table-wrap">
            <table className="kb-table">
              <thead>
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j} style={{ textAlign: b.align[j] === 'c' ? 'center' : b.align[j] === 'r' ? 'right' : 'left' }}>
                      {inline(parseInline(c), ctx, `${k}h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((c, j) => (
                      <td key={j} style={{ textAlign: b.align[j] === 'c' ? 'center' : b.align[j] === 'r' ? 'right' : 'left' }}>
                        {inline(parseInline(c), ctx, `${k}r${r}c${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'list': {
        const L = b.ordered ? 'ol' : 'ul'
        return (
          <L key={k} className={`kb-list${b.items.some((x) => x.checked != null) ? ' is-tasks' : ''}`}>
            {b.items.map((it, j) => (
              <li key={j} style={{ marginLeft: `${it.depth * 1.4}em` }} className={it.checked ? 'is-done' : ''}>
                {it.checked != null && (
                  <input
                    type="checkbox"
                    checked={it.checked}
                    disabled={!ctx.onChange}
                    onChange={() => ctx.onChange?.(toggleTask(ctx.src, it.line))}
                    aria-label={it.checked ? 'Снять отметку' : 'Отметить'}
                  />
                )}
                <span>{inline(parseInline(it.text), ctx, `${k}i${j}`)}</span>
              </li>
            ))}
          </L>
        )
      }
    }
  })
}

/** Тело страницы без шапки */
export function MarkdownBody({ src, pages, onOpen, onTag, onChange, depth = 0 }: { src: string; pages: PageLookup; onOpen: (title: string) => void; onTag?: (t: string) => void; onChange?: (next: string) => void; depth?: number }) {
  const { body, offset } = parsePage(src)
  const ctx: Ctx = { pages, onOpen, onTag, onChange, src, depth }
  return <>{blocks(parseBlocks(body, offset), ctx)}</>
}
