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
import { useMemo } from 'react'

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

/** Приводит сырой HTML dnd.su к безопасному виду для dangerouslySetInnerHTML. */
function transformClassHtml(html: string): string {
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

  // 4. Ссылки dnd.su в нашем приложении никуда не ведут — снимаем навигацию,
  //    оставляем подсвеченный текст (пустые якоря выкидываем).
  root.querySelectorAll('a').forEach((a) => {
    if (!a.textContent?.trim()) {
      a.remove()
      return
    }
    const span = doc.createElement('span')
    span.className = 'ca-ref'
    span.innerHTML = a.innerHTML
    a.replaceWith(span)
  })

  // 5. Всплывающие термины dnd.su → просто помечаем, стилизуем пунктиром.
  root.querySelectorAll('[tooltip-for]').forEach((el) => {
    el.removeAttribute('tooltip-for')
    el.classList.add('ca-term')
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

export function ClassArticle({ html }: { html: string }) {
  const safe = useMemo(() => transformClassHtml(html), [html])
  return <div className="class-article" dangerouslySetInnerHTML={{ __html: safe }} />
}
