/**
 * Разбор статьи расы с dnd.su на «общую» часть и тексты подрас.
 *
 * Подрасы в статье бывают в двух видах:
 *  - `.multiforo[caption]` — вкладки внутри «Особенностей» (дварфы, гномы):
 *    название лежит только в атрибуте caption, и без разбора все варианты
 *    сливаются в один сплошной список черт;
 *  - `h2.bigSectionTitle` — отдельный раздел (эльфы, аасимары), часто свёрнутый
 *    в `.hide-wrapper`.
 * Раздел отходит подрасе, если все значимые слова его заголовка есть в её
 * названии; такие разделы из общей статьи вырезаются.
 */
import type { Subrace } from './api'

export interface RaceArticle {
  /** статья расы без разделов, отошедших подрасам */
  race: string
  /** id подрасы → её HTML (черты, описание, таблицы) */
  bySubrace: Map<string, string>
}

interface Section {
  title: string
  body: string
  nodes: Element[]
}

const LATIN = /^[a-z0-9]+$/

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function words(text: string): string[] {
  return text
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
}

/**
 * Одно слово в разных формах: «огня» ≈ «огненный», «лесные» ≈ «лесной»,
 * но «драконокровный» ≠ «драконорождённый» и «гит» ≠ «гитъянки».
 * Пометки книг — только целиком.
 */
function sameWord(a: string, b: string): boolean {
  if (LATIN.test(a) || LATIN.test(b)) return a === b
  if (Math.abs(a.length - b.length) > 4) return false
  let common = 0
  while (common < a.length && a[common] === b[common]) common++
  return common >= 3 && common >= Math.min(a.length, b.length) - 4
}

const hasWord = (list: string[], w: string) => list.some((x) => sameWord(x, w))

function belongsTo(title: string, subrace: string, race: string): boolean {
  const t = words(title)
  const sub = words(subrace)
  const own = words(race)
  const names = t.filter((w) => !LATIN.test(w))
  // имя расы в заголовке подразумевается: «Призрачный полурослик» → «Призрачный»
  if (names.length === 0 || !names.every((w) => hasWord(sub, w) || hasWord(own, w))) return false
  // «Дварфы» или «Таблицы полуросликов» — про весь народ, а не про ветвь
  if (!names.some((w) => hasWord(sub, w) && !hasWord(own, w))) return false
  // «Дуэргар (MTF)» и «Дуэргар (MPMM)» различаются только пометкой книги
  const tags = t.filter((w) => LATIN.test(w))
  const subTags = sub.filter((w) => LATIN.test(w))
  return tags.length === 0 || subTags.length === 0 || tags.some((w) => subTags.includes(w))
}

function isBreak(el: Element): boolean {
  return /^H[12]$/.test(el.tagName) || el.classList.contains('bigSectionTitle')
}

function collectSections(content: Element): Section[] {
  const out: Section[] = []

  for (const tab of Array.from(content.querySelectorAll('.multiforo[caption]'))) {
    const caption = new DOMParser().parseFromString(tab.getAttribute('caption') ?? '', 'text/html').body.textContent
    const title = caption?.trim()
    if (title) out.push({ title, body: tab.innerHTML, nodes: [tab] })
  }

  for (const head of Array.from(content.querySelectorAll('h2.bigSectionTitle'))) {
    const title = head.textContent?.trim()
    if (!title) continue
    const next = head.nextElementSibling
    if (next?.classList.contains('hide-wrapper')) {
      out.push({ title, body: next.innerHTML, nodes: [head, next] })
      continue
    }
    const nodes: Element[] = [head]
    let n = head.nextElementSibling
    while (n && !isBreak(n)) {
      nodes.push(n)
      n = n.nextElementSibling
    }
    out.push({ title, body: nodes.slice(1).map((el) => el.outerHTML).join(''), nodes })
  }
  return out
}

export function splitRaceArticle(html: string, raceName: string, subraces: Subrace[]): RaceArticle {
  const bySubrace = new Map<string, string>()
  if (typeof DOMParser === 'undefined' || subraces.length === 0) return { race: html, bySubrace }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const content = doc.body.querySelector('.desc.card__article-body') ?? doc.body
  const parts = new Map<string, Section[]>()

  for (const section of collectSections(content)) {
    const owners = subraces.filter((sr) => belongsTo(section.title, sr.subrace_name, raceName))
    if (owners.length === 0) continue
    for (const sr of owners) parts.set(sr.id, [...(parts.get(sr.id) ?? []), section])
    for (const node of section.nodes) node.remove()
  }
  if (parts.size === 0) return { race: html, bySubrace }

  content.querySelectorAll('.multiforo-holder').forEach((holder) => {
    if (!holder.querySelector('.multiforo')) holder.remove()
  })

  for (const [id, sections] of parts) {
    // первый раздел — без заголовка: его название и так в шапке подрасы
    bySubrace.set(
      id,
      sections
        .map((s, i) => (i === 0 ? s.body : `<h3 class="underlined">${escapeHtml(s.title)}</h3>${s.body}`))
        .join(''),
    )
  }
  return { race: doc.body.innerHTML, bySubrace }
}
