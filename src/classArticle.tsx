/**
 * Рендер «сырого» HTML описания класса, который лежит в `description` на бэкенде
 * (выгружен из блока <div class="desc card__article-body"> с dnd.su).
 *
 * dnd.su отдаёт готовую разметку со своими классами (bigSectionTitle,
 * smallSectionTitle, tableTitle, table-wrapper/class_table/rolltable,
 * additionalInfo, спойлеры и т.п.). Мы НЕ перевёрстываем её в React-дерево, а
 * приводим в порядок в один проход по DOM (убираем скрипты, обработчики,
 * навигационные меню, интерактив), а стили этих классов переопределяем в CSS
 * (`.class-article …` в index.css). Спойлеры и свёрнутые блоки подклассов
 * превращаем в нативные <details>.
 */
import { useMemo, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cutProficiencySection } from './classProficiencies'
import { normSpellName, useSpellIndex } from './spellIndex'

/** Похоже ли описание на HTML-разметку (а не на старый плоский текст). */
export function isHtmlDescription(text: string | null | undefined): boolean {
  return !!text && /<(div|p|h[1-6]|table|ul|ol|blockquote|span)\b/i.test(text)
}

/** Классы-«поведение» dnd.su, которые не должны попадать в заголовок <summary>. */
const BEHAVIORAL = new Set([
  'spoiler_head',
  'spoiler_body',
  'spoiler_head_button',
  'hide-next',
  'hide-next-h2',
  'hide-wrapper',
  'spoiler_hide',
])

/** «ПЕРВОЗДАННАЯ ОСВЕДОМЛЁННОСТЬ» → «Первозданная осведомлённость». */
function sentenceCase(s: string): string {
  return s.toLocaleLowerCase('ru').replace(/\p{L}/u, (c) => c.toLocaleUpperCase('ru'))
}

/** Полностью прописной ли заголовок (тогда приводим к обычному регистру). */
function isAllCaps(s: string): boolean {
  const letters = s.match(/\p{L}/gu) ?? []
  return (
    letters.length > 1 &&
    letters.every((c) => c === c.toLocaleUpperCase('ru') && c !== c.toLocaleLowerCase('ru'))
  )
}

/** Оставляет у заголовка только «визуальные» классы (bigSectionTitle и пр.). */
function summaryClasses(el: Element): string {
  return Array.from(el.classList)
    .filter((c) => !BEHAVIORAL.has(c))
    .join(' ')
}

/** Заголовок + следующий за ним блок → нативный <details>. */
function makeDetails(head: Element, doc: Document, open: boolean): void {
  const body = head.nextElementSibling
  if (!body) return

  const details = doc.createElement('details')
  details.className = 'ca-collapse'
  if (open) details.setAttribute('open', '')

  const summary = doc.createElement('summary')
  summary.className = ('ca-summary ' + summaryClasses(head)).trim()
  summary.innerHTML = head.innerHTML

  head.replaceWith(details)
  details.append(summary, body)
}

export interface SubclassFeature {
  level: number
  name: string
  /** якорь заголовка умения в секции подкласса (для ссылок из таблицы развития) */
  anchorId: string
}

/** Нормализация названий для сопоставления заголовков подкласса. */
function normFeatureName(s: string): string {
  return s
    .toLocaleLowerCase('ru')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Стабильный id якоря для умения подкласса. */
function subclassFeatureAnchorId(level: number, name: string): string {
  const slug = normFeatureName(name)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
  return `subfeat.${level}.${slug}`
}

interface FeatureBlock {
  level: number
  name: string
  anchorId: string
  heading: Element
  nodes: Element[]
}

/**
 * Уровень получения умения. dnd.su ставит сразу после заголовка пометку вида
 * «3-й уровень, умение паладина». Требуем, чтобы уровень стоял в НАЧАЛЕ пометки:
 * у опций (воззвания, инфузии, приёмы) она начинается с «Требование: …»,
 * и такие блоки умениями уровня не являются.
 */
function featureHeadingLevel(h: Element): number | null {
  let node = h.nextElementSibling
  for (let i = 0; node && i < 4; i++, node = node.nextElementSibling) {
    const text = (node.textContent ?? '').trim()
    if (!text) continue
    const m = text.match(/^(\d+)-?[йея]?\s*уровень/i)
    return m ? parseInt(m[1], 10) : null
  }
  return null
}

/** Заголовок h3/h4 с пометкой уровня — умение класса или подкласса. */
function isFeatureHeadingCandidate(h: Element): boolean {
  if (!(h.textContent ?? '').trim()) return false
  if (h.classList.contains('tableTitle')) return false
  // свёрнутые блоки (каталог подклассов, вставки XGE) не являются списком умений
  if (h.closest('.hide-wrapper')) return false
  return featureHeadingLevel(h) != null
}

/** Собирает блоки умений: заголовок h3/h4 + содержимое до следующего умения. */
function collectFeatureBlocks(root: Element): FeatureBlock[] {
  const headings = Array.from(root.querySelectorAll('h3, h4')).filter(isFeatureHeadingCandidate)

  return headings.map((h, i) => {
    const level = featureHeadingLevel(h)!
    const end = headings[i + 1] ?? null
    const nodes: Element[] = []
    let n: Element | null = h
    while (n && n !== end && !(end && n.contains(end))) {
      nodes.push(n)
      n = n.nextElementSibling
    }
    const raw = (h.textContent ?? '').trim()
    const name = isAllCaps(raw) ? sentenceCase(raw) : raw
    const keepId = h.querySelector('[id]')?.id ?? h.id
    return {
      level,
      name,
      anchorId: keepId || subclassFeatureAnchorId(level, name),
      heading: h,
      nodes,
    }
  })
}

/**
 * Узел, перед которым встаёт умение подкласса: поднимаемся из заголовка наружу,
 * пока он остаётся первым умением своей обёртки (чтобы не влезть внутрь чужого блока).
 */
function boundaryNode(h: Element, content: Element, isHeading: (el: Element) => boolean): Element {
  let node = h
  while (node.parentElement && node.parentElement !== content) {
    const parent = node.parentElement
    if (Array.from(parent.querySelectorAll('h3, h4')).find(isHeading) !== h) break
    node = parent
  }
  return node
}

/**
 * Встраивает блоки умений подкласса в DOM статьи класса (после cutSubclasses):
 * каждое умение встаёт после всех классовых способностей своего уровня.
 */
function injectSubclassBlocks(content: Element, subclassSectionHtml: string, doc: Document): void {
  const subDoc = new DOMParser().parseFromString(subclassSectionHtml, 'text/html')
  const subBlocks = collectFeatureBlocks(subDoc.body)
  const classBlocks = collectFeatureBlocks(content)
  if (!subBlocks.length || !classBlocks.length) return

  const headings = new Set(classBlocks.map((b) => b.heading))
  const isHeading = (el: Element) => headings.has(el)

  // хвост списка умений: следующий крупный раздел после последнего умения класса
  const lastBoundary = boundaryNode(classBlocks[classBlocks.length - 1]!.heading, content, isHeading)
  let tail = lastBoundary.nextElementSibling
  while (tail && !tail.matches('h1, h2, .bigSectionTitle') && !tail.querySelector('h1, h2, .bigSectionTitle')) {
    tail = tail.nextElementSibling
  }

  for (const sub of [...subBlocks].sort((a, b) => a.level - b.level)) {
    const next = classBlocks.find((b) => b.level > sub.level)
    const before = next ? boundaryNode(next.heading, content, isHeading) : tail
    const parent = before?.parentNode ?? lastBoundary.parentNode
    if (!parent) continue

    const wrapper = doc.createElement('div')
    wrapper.className = 'ca-subfeat-block'
    for (const node of sub.nodes) {
      wrapper.appendChild(doc.importNode(node, true))
    }
    const title = wrapper.querySelector('h3, h4')
    if (title) {
      title.classList.add('ca-subfeat-title')
      if (!title.id) title.id = sub.anchorId
    }

    parent.insertBefore(wrapper, before ?? null)
  }
}

interface TransformOptions {
  /** вырезать каталог подклассов (страница КЛАССА — true; ПОДКЛАССА — false) */
  cutSubclasses?: boolean
  /** HTML секции выбранного подкласса — встроить в список умений класса */
  subclassSectionHtml?: string
  /** умения выбранного подкласса — вписать в столбец «Умения» на нужных уровнях */
  subclassFeatures?: SubclassFeature[]
}

/**
 * Приводит сырой HTML dnd.su к безопасному виду для dangerouslySetInnerHTML.
 */
function transformClassHtml(html: string, options: TransformOptions = {}): string {
  const { cutSubclasses = true, subclassSectionHtml, subclassFeatures } = options
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body

  // 1. Служебные/интерактивные узлы — целиком прочь.
  root
    .querySelectorAll(
      'script, style, link, input, svg,' +
        '.content-switch, .new-article-menu, .article-menu,' +
        '.spoiler_neck, .spoiler_head_button, .fake-body',
    )
    .forEach((n) => n.remove())

  // 1b. Каталог подклассов (архетипов) — прочь: их тексты живут в сотах
  //     подклассов под статьёй, а заголовок раздела дублировал бы заголовок сот.
  //     Подклассы идут «хвостом» статьи. Первый подкласс определяем по id вида
  //     «archetype.*»/«circle.*»/«oath.*» и т.п. (у классовых умений вроде
  //     «Боевые приёмы»/«Инфузии»/«Воззвания» id без такой категории — они
  //     остаются). Режем от РОДИТЕЛЬСКОГО заголовка раздела (последний
  //     .bigSectionTitle перед первым подклассом — «Архетипы следопыта»,
  //     «Магические традиции» и т.п.) и до конца статьи — вместе с вводкой и
  //     обёртками «Unearthed Arcana»/«Homebrew».
  const content = root.querySelector('.desc.card__article-body') ?? root
  if (cutSubclasses) {
    const SUBCLASS_ID =
      /(^|\.)(college|primal|archetype|tradition|circle|domain|specialist|patron|oath|origin|monastic-tradition)(\.|$)/i
    const heads = Array.from(content.querySelectorAll('.hide-next'))
    const firstSubclass = heads.find((h) => {
      const withId = h.querySelector('[id]')
      return !!withId && SUBCLASS_ID.test(withId.id)
    })
    if (firstSubclass) {
      let cutFrom: Element = firstSubclass
      for (const big of Array.from(content.querySelectorAll('.bigSectionTitle'))) {
        if (big.compareDocumentPosition(firstSubclass) & Node.DOCUMENT_POSITION_FOLLOWING) cutFrom = big
        else break
      }
      let top: HTMLElement = cutFrom as HTMLElement
      while (top.parentElement && top.parentElement !== content) top = top.parentElement
      let cursor: ChildNode | null = top
      while (cursor) {
        const next: ChildNode | null = cursor.nextSibling
        cursor.remove()
        cursor = next
      }
    }
  }

  // 1d. Секция «ВЛАДЕНИЕ» — отдельные stat-rows на странице класса.
  cutProficiencySection(content)

  // 1c. Умения выбранного подкласса → в общий список способностей класса
  //     (после cutSubclasses, чтобы высокоуровневые умения не попали под нож).
  if (subclassSectionHtml) {
    injectSubclassBlocks(content, subclassSectionHtml, doc)
  }

  // 2. Чистим атрибуты: обработчики событий, мусор, «display:none» (раскрываем
  //    свёрнутые подклассы), пустые якоря.
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || attr.name === 'bis_skin_checked') {
        el.removeAttribute(attr.name)
      }
    }
    const style = el.getAttribute('style')
    if (style && /display\s*:/i.test(style)) {
      ;(el as HTMLElement).style.removeProperty('display')
      if (!el.getAttribute('style')) el.removeAttribute('style')
    }
  })

  // 3. Дайс-виджеты (<span class="dice" onclick=…>) → простой текст «1к10».
  root.querySelectorAll('span.dice').forEach((el) => {
    const value = el.querySelector('span')?.textContent?.trim() || el.textContent?.trim() || ''
    const span = doc.createElement('span')
    span.className = 'ca-dice'
    span.textContent = value
    el.replaceWith(span)
  })

  // 4. Ссылки. Внутренние якоря на способности класса (#feature.*, #channel-*
  //    и т.п.), цель которых осталась в статье, делаем кликабельными «кнопками»
  //    (.ca-link + data-target) — клик прокручивает к способности. Внешние
  //    ссылки dnd.su и битые якоря → просто подсвеченный текст. Пустые — прочь.
  const existingIds = new Set(Array.from(content.querySelectorAll('[id]')).map((e) => e.id))
  root.querySelectorAll('a').forEach((a) => {
    if (!a.textContent?.trim()) {
      a.remove()
      return
    }
    const href = a.getAttribute('href') ?? ''
    const targetId = href.startsWith('#') ? decodeURIComponent(href.slice(1)) : ''
    const span = doc.createElement('span')
    span.innerHTML = a.innerHTML
    if (targetId && existingIds.has(targetId)) {
      span.className = 'ca-ref ca-link'
      span.setAttribute('data-target', targetId)
    } else if (/\/spells\/\d+-/.test(href)) {
      // ссылка на конкретное заклинание dnd.su → помечаем; id заклинания у нас
      // подставим при рендере по названию (см. ClassArticle + useSpellIndex)
      span.className = 'ca-ref ca-spell'
      span.setAttribute('data-spell', (a.textContent ?? '').split('[')[0].trim())
    } else {
      span.className = 'ca-ref'
    }
    a.replaceWith(span)
  })

  // 5. Всплывающие термины dnd.su → просто помечаем, стилизуем пунктиром.
  root.querySelectorAll('[tooltip-for]').forEach((el) => {
    el.removeAttribute('tooltip-for')
    el.classList.add('ca-term')
  })

  // 5b. Заголовки блоков «капсом» → обычный регистр: первая буква заглавная,
  //     остальные строчные («ПЕРВОЗДАННАЯ ОСВЕДОМЛЁННОСТЬ» → «Первозданная
  //     осведомлённость»). Смешанный регистр не трогаем (имена собственные, XGE…).
  content.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    const text = h.textContent ?? ''
    if (!isAllCaps(text)) return
    // якорь способности (<span id="feature.…">) переносим на сам заголовок,
    // иначе плоский textContent затрёт id — и ссылки-«кнопки» перестанут вести.
    const keepId = h.querySelector('[id]')?.id
    h.textContent = sentenceCase(text)
    if (keepId && !h.id) h.id = keepId
  })

  // 6. Голые таблицы (dnd.su не оборачивает их) → в скролл-контейнер, чтобы
  //    на узких экранах прокручивалась таблица, а не вся страница.
  root.querySelectorAll('table').forEach((t) => {
    if (t.parentElement?.classList.contains('table-wrapper')) return
    const wrap = doc.createElement('div')
    wrap.className = 'table-wrapper'
    t.replaceWith(wrap)
    wrap.appendChild(t)
  })

  // 6b. Заголовок столбца «Умения» помечаем — его ячейки (с текстом умений)
  //     выровнены влево, поэтому и заголовок должен быть слева, а не по центру.
  root.querySelectorAll('table.class_table tr.table_header td').forEach((td) => {
    if (td.textContent?.trim() === 'Умения') td.classList.add('ca-feat-h')
  })

  // 6c. Обычные таблицы: короткие/числовые столбцы (уровень, к6, счётчики)
  //     центрируем по столбцу — и заголовок, и цифры под ним; текстовые столбцы
  //     (описания, списки заклинаний) остаются слева. Таблицу развития класса и
  //     таблицы со сложными «шапками» (colspan/rowspan) не трогаем.
  root.querySelectorAll('table').forEach((table) => {
    if (table.classList.contains('class_table')) return
    if (table.querySelector('td[colspan], td[rowspan], th[colspan], th[rowspan]')) return
    const rows = Array.from(table.querySelectorAll('tr'))
    const dataRows = rows.filter((r) => !r.classList.contains('table_header'))
    if (!dataRows.length) return
    const colCount = Math.max(...rows.map((r) => r.children.length))
    for (let c = 0; c < colCount; c++) {
      let maxLen = -1
      dataRows.forEach((r) => {
        const cell = r.children[c]
        if (cell) maxLen = Math.max(maxLen, (cell.textContent ?? '').trim().length)
      })
      if (maxLen < 0 || maxLen > 16) continue // пусто или длинный текст → оставляем слева
      rows.forEach((r) => r.children[c]?.classList.add('ca-col-center'))
    }
  })

  // 6d. Умения выбранного подкласса → дописываем в столбец «Умения» таблицы
  //     развития на соответствующих уровнях (кликабельные ca-subfeat.ca-link).
  if (subclassFeatures?.length) {
    const table = content.querySelector('table.class_table')
    const headerRow = table?.querySelector('tr.table_header')
    const umIdx = headerRow
      ? Array.from(headerRow.children).findIndex((c) => c.textContent?.trim() === 'Умения')
      : -1
    if (table && umIdx >= 0) {
      const byLevel = new Map<number, SubclassFeature[]>()
      for (const f of subclassFeatures) {
        const arr = byLevel.get(f.level) ?? []
        arr.push(f)
        byLevel.set(f.level, arr)
      }
      Array.from(table.querySelectorAll('tr'))
        .filter((r) => !r.classList.contains('table_header'))
        .forEach((r) => {
          const level = parseInt((r.children[0]?.textContent ?? '').trim(), 10)
          const feats = byLevel.get(level)
          const cell = r.children[umIdx]
          if (!feats || !cell) return
          // на «пустых» уровнях dnd.su ставит прочерк — умение подкласса его заменяет
          if (/^[—–-]$/.test((cell.textContent ?? '').trim())) cell.textContent = ''
          feats.forEach((f) => {
            if (cell.textContent?.trim()) cell.append(doc.createTextNode(', '))
            const span = doc.createElement('span')
            span.className = 'ca-ref ca-subfeat ca-link'
            span.setAttribute('data-target', f.anchorId)
            span.textContent = f.name
            cell.append(span)
          })
        })
    }
  }

  // 7. Спойлеры (раскрыты) и свёрнутые блоки подклассов (свёрнуты) → <details>.
  //    В сыром HTML dnd.su тело спойлера — просто следующий <span>/<div> после
  //    заголовка «.spoiler_head», а подклассы — «.hide-next» + «.hide-wrapper».
  root.querySelectorAll('.spoiler_head').forEach((head) => {
    const next = head.nextElementSibling
    if (next && (next.tagName === 'SPAN' || next.tagName === 'DIV')) {
      makeDetails(head, doc, true)
    }
  })
  root.querySelectorAll('.hide-next').forEach((head) => {
    if (head.nextElementSibling?.classList.contains('hide-wrapper')) {
      makeDetails(head, doc, false)
    }
  })

  return root.innerHTML
}

/**
 * Достаёт из HTML класса секцию конкретного подкласса (по названию) — тело блока
 * «.hide-next заголовок» + «.hide-wrapper». Возвращает внутренний HTML тела
 * (без дублирующего заголовка-названия) или null, если не нашли.
 */
export function extractSubclassHtml(classHtml: string, subclassName: string): string | null {
  if (typeof DOMParser === 'undefined') return null
  const norm = (s: string) =>
    s
      .toLocaleLowerCase('ru')
      .replace(/[«»"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const target = norm(subclassName)
  if (!target) return null
  const doc = new DOMParser().parseFromString(classHtml, 'text/html')
  const content = doc.body.querySelector('.desc.card__article-body') ?? doc.body
  const head = Array.from(content.querySelectorAll('.hide-next')).find(
    (h) => norm(h.textContent ?? '') === target,
  )
  const body = head?.nextElementSibling
  if (!body || !body.classList.contains('hide-wrapper')) return null
  return body.innerHTML
}

/**
 * Тело описания подкласса без обёртки hide-next / hide-wrapper.
 * В актуальном API полный HTML лежит в `subclass.description`, а не в статье класса.
 */
function unwrapSubclassBody(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const wrapper = doc.body.querySelector('.hide-wrapper')
  if (wrapper) return wrapper.innerHTML
  // уже развёрнутое тело с заголовками умений
  if (doc.body.querySelector('h3, h4')) return doc.body.innerHTML
  return null
}

/**
 * HTML умений подкласса: сначала собственный `description` подкласса,
 * иначе — вырезка из HTML родительского класса (старый формат dnd.su).
 */
export function resolveSubclassSectionHtml(
  subclassDescription: string | null | undefined,
  subclassName: string,
  parentClassHtml?: string | null,
): string | null {
  if (subclassDescription && isHtmlDescription(subclassDescription)) {
    const own = unwrapSubclassBody(subclassDescription)
    if (own) return own
  }
  if (parentClassHtml) return extractSubclassHtml(parentClassHtml, subclassName)
  return null
}

/**
 * Разбирает секцию подкласса на умения с уровнями: заголовок умения, у которого
 * рядом идёт маркер «N-й уровень» (напр. «3-й уровень, умение клятвы преданности»).
 */
export function parseSubclassFeatures(sectionHtml: string): SubclassFeature[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(sectionHtml, 'text/html')
  const out: SubclassFeature[] = []
  const seen = new Set<string>()
  for (const block of collectFeatureBlocks(doc.body)) {
    if (block.level < 1 || block.level > 20) continue
    const key = block.level + '|' + normFeatureName(block.name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ level: block.level, name: block.name, anchorId: block.anchorId })
  }
  return out
}

export interface FeatureEntry {
  level: number
  name: string
  /** полный HTML блока умения (заголовок + тело) — для рендера в конструкторе */
  html: string
}

/**
 * Разбирает секцию (класса ИЛИ подкласса) на умения с уровнями и HTML.
 * Для конструктора «мультикласс»: собираем способности абстрактного персонажа
 * по выбранному уровню. Опции без уровня (воззвания, приёмы) сюда не попадают —
 * это отдельные под-умения, а не способности уровня.
 */
export function parseFeatureEntries(sectionHtml: string): FeatureEntry[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(sectionHtml, 'text/html')
  const content = doc.body.querySelector('.desc.card__article-body') ?? doc.body
  const out: FeatureEntry[] = []
  const seen = new Set<string>()
  for (const block of collectFeatureBlocks(content)) {
    if (block.level < 1 || block.level > 20) continue
    const key = block.level + '|' + normFeatureName(block.name)
    if (seen.has(key)) continue
    seen.add(key)
    const html = block.nodes.map((n) => (n as HTMLElement).outerHTML).join('')
    out.push({ level: block.level, name: block.name, html })
  }
  return out
}

export function ClassArticle({
  html,
  cutSubclasses = true,
  subclassSectionHtml,
  subclassFeatures,
  isCaster = false,
  backLabel,
}: {
  html: string
  cutSubclasses?: boolean
  subclassSectionHtml?: string | null
  subclassFeatures?: SubclassFeature[]
  /** заклинательный класс — фиолетовые умения подкласса; иначе красные */
  isCaster?: boolean
  /** подпись для кнопки «назад» на странице заклинания (напр. имя класса/подкласса) */
  backLabel?: string
}) {
  const safe = useMemo(
    () => transformClassHtml(html, { cutSubclasses, subclassSectionHtml: subclassSectionHtml ?? undefined, subclassFeatures }),
    [html, cutSubclasses, subclassSectionHtml, subclassFeatures],
  )

  const articleClass = `class-article${isCaster ? ' class-article--caster' : ' class-article--martial'}`

  const navigate = useNavigate()
  const location = useLocation()
  const spellIndex = useSpellIndex()

  // Делегируем клики: заклинание (.ca-spell) → страница заклинания (id ищем в
  // индексе по названию ПРЯМО ПРИ КЛИКЕ — так работает и после возврата назад,
  // когда React пере-вставляет innerHTML и стирает разметку). Кнопка-умение
  // (.ca-link) → прокрутка к способности со вспышкой. На страницу заклинания
  // передаём, откуда пришли, чтобы там была кнопка «назад» именно сюда.
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const spell = (e.target as HTMLElement).closest<HTMLElement>('.ca-spell')
    if (spell) {
      const id = spellIndex.get(normSpellName(spell.dataset.spell ?? ''))
      if (id) {
        navigate(`/spells/${id}`, {
          state: { from: location.pathname + location.search, fromLabel: backLabel },
        })
      }
      return
    }
    const link = (e.target as HTMLElement).closest<HTMLElement>('.ca-link')
    const targetId = link?.dataset.target
    if (!targetId) return
    const target = document.getElementById(targetId)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target.classList.add('ca-flash')
    window.setTimeout(() => target.classList.remove('ca-flash'), 1400)
  }

  return (
    <div className={articleClass} onClick={handleClick} dangerouslySetInnerHTML={{ __html: safe }} />
  )
}
