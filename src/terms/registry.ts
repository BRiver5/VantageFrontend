/**
 * Ссылки на термины от сервера (`term_links` детальных страниц каталога).
 * Сервер даёт позиции по пути поля (`description`, `actions[2].description`);
 * мы запоминаем их по самой строке поля: компонент текста получает только
 * строку и по ней находит свои ссылки. Без зависимостей — api.ts пишет сюда
 * при каждой загрузке детали.
 */

export interface TermLink {
  start: number
  end: number
  slug: string
  text: string
  /** первое упоминание термина в этом поле */
  first: boolean
}

const byText = new Map<string, TermLink[]>()
const MAX = 3000

/** Значение по пути вида `actions[2].description` или `mechanics.ui[0].inputs[0].label` */
function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split('.')) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part)
    if (!m) return undefined
    if (m[1]) cur = (cur as Record<string, unknown> | null)?.[m[1]]
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) cur = (cur as unknown[] | null)?.[Number(idx[1])]
    if (cur == null) return undefined
  }
  return cur
}

/** Записать строку по тому же пути */
function setAt(obj: unknown, path: string, value: string) {
  const parts = path.split('.')
  let cur: unknown = obj
  for (let i = 0; i < parts.length; i++) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(parts[i])
    if (!m) return
    const idx = [...m[2].matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1]))
    const last = i === parts.length - 1
    // ключ объекта
    if (m[1]) {
      if (last && idx.length === 0) {
        ;(cur as Record<string, unknown>)[m[1]] = value
        return
      }
      cur = (cur as Record<string, unknown>)[m[1]]
    }
    for (let j = 0; j < idx.length; j++) {
      if (last && j === idx.length - 1) {
        ;(cur as unknown[])[idx[j]] = value
        return
      }
      cur = (cur as unknown[])[idx[j]]
    }
    if (cur == null) return
  }
}

const isHtml = (s: string) => /<[a-z!/][\s\S]*>/i.test(s)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * HTML-описание (классы, расы, предыстории с dnd.su): ссылки вшиваем прямо в
 * разметку как <span class="term-link" data-term>. Так они переживают нарезку
 * статьи на части (подкласс из статьи класса, раса из общей статьи) и
 * очистку. Позиции, попавшие внутрь тега (атрибуты), пропускаем.
 */
export function injectTermSpans(html: string, links: TermLink[]): string {
  let out = html
  for (const l of [...links].sort((a, b) => b.start - a.start)) {
    if (l.end <= l.start || l.end > out.length) continue
    const piece = out.slice(l.start, l.end)
    if (piece !== l.text || /[<>]/.test(piece)) continue
    const before = out.lastIndexOf('<', l.start)
    if (before > out.lastIndexOf('>', l.start)) continue
    out = `${out.slice(0, l.start)}<span class="term-link" data-term="${esc(l.slug)}" data-first="${l.first ? 1 : 0}">${piece}</span>${out.slice(l.end)}`
  }
  return out
}

/** Запомнить ссылки детали: строка поля → её ссылки; HTML-поля — со вшитыми ссылками */
export function registerTermLinks(entity: unknown) {
  const links = (entity as { term_links?: Record<string, TermLink[]> } | null)?.term_links
  if (!links || typeof links !== 'object') return
  for (const [path, list] of Object.entries(links)) {
    const v = at(entity, path)
    if (typeof v !== 'string' || !v || !Array.isArray(list) || list.length === 0) continue
    if (isHtml(v) && !v.includes('data-term=')) {
      setAt(entity, path, injectTermSpans(v, list))
      continue
    }
    byText.delete(v)
    byText.set(v, list)
  }
  // старые записи — вон: Map помнит порядок вставки
  while (byText.size > MAX) byText.delete(byText.keys().next().value as string)
}

/**
 * Ссылки для строки. Точное совпадение с полем — сразу; кусок поля (абзац,
 * часть статьи) — со сдвигом позиций. Не нашли — null, текст покажем без ссылок
 * сервера.
 */
export function termLinksFor(text: string): TermLink[] | null {
  const exact = byText.get(text)
  if (exact) return exact
  if (text.length < 24) return null
  for (const [raw, list] of byText) {
    if (raw.length <= text.length) continue
    const off = raw.indexOf(text)
    if (off < 0) continue
    const end = off + text.length
    const inside = list.filter((l) => l.start >= off && l.end <= end).map((l) => ({ ...l, start: l.start - off, end: l.end - off }))
    return inside.length ? inside : null
  }
  return null
}
