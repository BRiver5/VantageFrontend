/**
 * Markdown базы знаний. Всё, что мастер видит на странице, живёт в обычном
 * тексте заметки — сервер хранит title/body/folder как раньше, а страницу
 * можно скопировать в Obsidian и обратно:
 *
 *   ---                      ← шапка страницы (frontmatter)
 *   icon: 🏰
 *   cover: https://…
 *   tags: город, север
 *   width: wide
 *   ---
 *   # Заголовок, **жирный**, *курсив*, ~~зачёркнутый~~, `код`
 *   [[Другая страница]] [[Другая|подпись]]  ![[Встроить страницу]]
 *   ![картинка](url)  - [ ] задача  > [!tip] Выноска  | таблица |
 *   ```board …```  ```random …```   ← виджеты: доска с фото, таблица случайностей
 *
 * Разбор чистый и без HTML: рендер собирает React-элементы, поэтому ничего не
 * вставляется в DOM как разметка.
 */

/* ---------- шапка страницы ---------- */

export interface PageMeta {
  icon?: string
  cover?: string
  tags: string[]
  width?: 'wide' | 'normal'
  /** прочие поля шапки сохраняем как есть */
  extra: Record<string, string>
}

export interface ParsedPage {
  meta: PageMeta
  /** текст без шапки */
  body: string
  /** с какой строки исходника начинается body */
  offset: number
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parsePage(src: string): ParsedPage {
  const m = FM.exec(src)
  const meta: PageMeta = { tags: [], extra: {} }
  if (!m) return { meta, body: src, offset: 0 }
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const [, k, raw] = kv
    const v = raw.trim()
    if (k === 'icon') meta.icon = v
    else if (k === 'cover') meta.cover = v
    else if (k === 'width') meta.width = v === 'wide' ? 'wide' : 'normal'
    else if (k === 'tags') meta.tags = v.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
    else meta.extra[k] = v
  }
  return { meta, body: src.slice(m[0].length), offset: m[0].split('\n').length - 1 }
}

export function writePage(meta: PageMeta, body: string): string {
  const lines: string[] = []
  if (meta.icon) lines.push(`icon: ${meta.icon}`)
  if (meta.cover) lines.push(`cover: ${meta.cover}`)
  if (meta.tags.length) lines.push(`tags: ${meta.tags.join(', ')}`)
  if (meta.width === 'wide') lines.push('width: wide')
  for (const [k, v] of Object.entries(meta.extra)) lines.push(`${k}: ${v}`)
  return lines.length ? `---\n${lines.join('\n')}\n---\n${body.replace(/^\n+/, '')}` : body
}

/* ---------- строчная разметка ---------- */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i' | 's'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'wiki'; page: string; label: string; embed: boolean }
  | { t: 'img'; src: string; alt: string }
  | { t: 'tag'; v: string }
  | { t: 'br' }

const INLINE = [
  { re: /^`([^`]+)`/, make: (m: RegExpExecArray): Inline => ({ t: 'code', v: m[1] }) },
  { re: /^(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/, make: (m: RegExpExecArray): Inline => ({ t: 'wiki', page: m[2].trim(), label: (m[3] ?? m[2]).trim(), embed: m[1] === '!' }) },
  { re: /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, make: (m: RegExpExecArray): Inline => ({ t: 'img', alt: m[1], src: m[2] }) },
  { re: /^\[([^\]]+)\]\(([^)\s]+)\)/, make: (m: RegExpExecArray): Inline => ({ t: 'link', href: m[2], c: parseInline(m[1]) }) },
  { re: /^\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/, make: (m: RegExpExecArray): Inline => ({ t: 'b', c: parseInline(m[1]) }) },
  { re: /^__([^_]+)__/, make: (m: RegExpExecArray): Inline => ({ t: 'b', c: parseInline(m[1]) }) },
  { re: /^~~([^~]+)~~/, make: (m: RegExpExecArray): Inline => ({ t: 's', c: parseInline(m[1]) }) },
  { re: /^\*([^*\s][^*]*)\*/, make: (m: RegExpExecArray): Inline => ({ t: 'i', c: parseInline(m[1]) }) },
  { re: /^_([^_\s][^_]*)_(?![\p{L}\d])/u, make: (m: RegExpExecArray): Inline => ({ t: 'i', c: parseInline(m[1]) }) },
  { re: /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/, make: (m: RegExpExecArray): Inline => ({ t: 'link', href: m[0], c: [{ t: 'text', v: m[0] }] }) },
]

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  let i = 0
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf })
    buf = ''
  }
  while (i < src.length) {
    const rest = src.slice(i)
    // тег: #слово в начале строки или после пробела
    if (rest[0] === '#' && (i === 0 || /\s/.test(src[i - 1]))) {
      const tm = /^#([\p{L}\d_/-]+)/u.exec(rest)
      if (tm && !/^\d+$/.test(tm[1])) {
        flush()
        out.push({ t: 'tag', v: tm[1] })
        i += tm[0].length
        continue
      }
    }
    if (rest[0] === '\\' && rest.length > 1) {
      buf += rest[1]
      i += 2
      continue
    }
    let hit = false
    if ('`[!*_~h'.includes(rest[0])) {
      for (const rule of INLINE) {
        const m = rule.re.exec(rest)
        if (m) {
          flush()
          out.push(rule.make(m))
          i += m[0].length
          hit = true
          break
        }
      }
    }
    if (!hit) {
      buf += rest[0]
      i += 1
    }
  }
  flush()
  return out
}

/* ---------- блоки ---------- */

export interface ListItem {
  text: string
  /** null — обычный пункт, true/false — задача */
  checked: boolean | null
  /** номер строки исходника: по нему переключаем галочку */
  line: number
  depth: number
}

export type Block =
  | { t: 'h'; level: 1 | 2 | 3 | 4; text: string; id: string }
  | { t: 'p'; text: string }
  | { t: 'list'; ordered: boolean; items: ListItem[] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'callout'; kind: string; title: string; fold: '' | '+' | '-'; blocks: Block[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'widget'; kind: WidgetKind; raw: string; from: number; to: number }
  | { t: 'hr' }
  | { t: 'table'; head: string[]; align: ('l' | 'c' | 'r')[]; rows: string[][] }

export type WidgetKind = 'board' | 'random'
const WIDGETS: WidgetKind[] = ['board', 'random']

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\d\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/** Разбор блоков; base — номер первой строки в исходнике (для галочек и виджетов) */
export function parseBlocks(src: string, base = 0): Block[] {
  const lines = src.split(/\r?\n/)
  const out: Block[] = []
  let i = 0
  const para: string[] = []
  const flushPara = () => {
    if (para.length) out.push({ t: 'p', text: para.join('\n') })
    para.length = 0
  }
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    // код и виджеты
    const fence = /^(```|~~~)\s*([\w-]*)\s*$/.exec(trimmed)
    if (fence) {
      flushPara()
      const start = i
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      const lang = fence[2].toLowerCase()
      if ((WIDGETS as string[]).includes(lang)) out.push({ t: 'widget', kind: lang as WidgetKind, raw: body.join('\n'), from: base + start, to: base + Math.min(i, lines.length - 1) })
      else out.push({ t: 'code', lang, text: body.join('\n') })
      i++
      continue
    }
    if (!trimmed) {
      flushPara()
      i++
      continue
    }
    const h = /^(#{1,4})\s+(.+?)\s*#*$/.exec(trimmed)
    if (h) {
      flushPara()
      out.push({ t: 'h', level: h[1].length as 1 | 2 | 3 | 4, text: h[2], id: slug(h[2]) })
      i++
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara()
      out.push({ t: 'hr' })
      i++
      continue
    }
    if (trimmed.startsWith('>')) {
      flushPara()
      const inner: string[] = []
      const start = i
      while (i < lines.length && lines[i].trim().startsWith('>')) inner.push(lines[i++].trim().replace(/^>\s?/, ''))
      const co = /^\[!(\w+)\]([+-]?)\s*(.*)$/.exec(inner[0] ?? '')
      if (co) out.push({ t: 'callout', kind: co[1].toLowerCase(), fold: co[2] as '' | '+' | '-', title: co[3], blocks: parseBlocks(inner.slice(1).join('\n'), base + start + 1) })
      else out.push({ t: 'quote', blocks: parseBlocks(inner.join('\n'), base + start) })
      continue
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flushPara()
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: ListItem[] = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xXх])\]\s+)?(.*)$/.exec(lines[i])!
        items.push({ depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2), checked: m[3] == null ? null : m[3] !== ' ', text: m[4], line: base + i })
        i++
      }
      out.push({ t: 'list', ordered, items })
      continue
    }
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara()
      const head = cells(lines[i])
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : 'l')) as ('l' | 'c' | 'r')[]
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push({ t: 'table', head, align, rows })
      continue
    }
    para.push(line)
    i++
  }
  flushPara()
  return out
}

/* ---------- связи между страницами ---------- */

const WIKI = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g

/** Названия страниц, на которые ссылается текст */
export function linksOf(src: string): string[] {
  const out = new Set<string>()
  for (const m of src.matchAll(WIKI)) out.add(m[1].trim().toLowerCase())
  return [...out]
}

export function tagsOf(src: string): string[] {
  const { meta, body } = parsePage(src)
  const inline = [...body.matchAll(/(?:^|\s)#([\p{L}\d_/-]+)/gu)].map((m) => m[1]).filter((t) => !/^\d+$/.test(t))
  return [...new Set([...meta.tags, ...inline].map((t) => t.toLowerCase()))]
}

/** Короткий отрывок без разметки: для поиска и подсказок */
export function plainText(src: string, max = 160): string {
  const { body } = parsePage(src)
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Переименовать ссылки [[Старое]] → [[Новое]] во всём тексте */
export function renameLinks(src: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return src.replace(new RegExp(`(!?\\[\\[)${esc}((?:#[^\\]|]*)?(?:\\|[^\\]]+)?\\]\\])`, 'gi'), `$1${to}$2`)
}

/** Переключить галочку задачи в строке исходника */
export function toggleTask(src: string, line: number): string {
  const lines = src.split('\n')
  const l = lines[line]
  if (l == null) return src
  lines[line] = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xXх])\]/, (_, a, b) => `${a}[${b === ' ' ? 'x' : ' '}]`)
  return lines.join('\n')
}

/** Заменить содержимое виджета (строки from..to — это ограды ```) */
export function replaceWidget(src: string, from: number, to: number, kind: WidgetKind, raw: string): string {
  const lines = src.split('\n')
  lines.splice(from, to - from + 1, '```' + kind, ...raw.split('\n'), '```')
  return lines.join('\n')
}
