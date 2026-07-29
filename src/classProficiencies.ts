import { htmlToText } from './api'

export interface ClassProficiencies {
  armor?: string
  weapons?: string
  tools?: string
  savingThrows?: string
  skills?: string
}

const LABEL_MAP: Record<string, keyof ClassProficiencies> = {
  'доспехи': 'armor',
  'оружие': 'weapons',
  'инструменты': 'tools',
  'спасброски': 'savingThrows',
  'навыки': 'skills',
}

function normLabel(s: string): string {
  return s.replace(/:$/, '').trim().toLocaleLowerCase('ru')
}

function isProficiencyBoundary(el: Element): boolean {
  if (el.matches('h3, h4.smallSectionTitle, .bigSectionTitle, h2')) return true
  if (el.tagName === 'H4' && !el.classList.contains('smallSectionTitle')) return true
  return false
}

function paragraphValue(p: Element): string {
  const strong = p.querySelector('strong')
  if (!strong) return htmlToText(p.innerHTML).trim()
  const clone = p.cloneNode(true) as Element
  clone.querySelector('strong')?.remove()
  return htmlToText(clone.innerHTML).replace(/^:\s*/, '').trim()
}

function findProficiencyHeading(content: Element): Element | null {
  for (const h of content.querySelectorAll('h4.smallSectionTitle, h4')) {
    const t = (h.textContent ?? '').trim().toLocaleUpperCase('ru')
    if (t === 'ВЛАДЕНИЕ') return h
  }
  return null
}

/**
 * Извлекает блок «ВЛАДЕНИЕ» из HTML-описания класса dnd.su.
 * Возвращает пустой объект, если секция не найдена.
 */
export function parseClassProficiencies(html: string): ClassProficiencies {
  if (typeof DOMParser === 'undefined' || !html) return {}
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const content = doc.body.querySelector('.desc.card__article-body') ?? doc.body
  const heading = findProficiencyHeading(content)
  if (!heading) return {}

  const out: ClassProficiencies = {}
  let node: Element | null = heading.nextElementSibling

  while (node) {
    if (isProficiencyBoundary(node)) break
    if (node.tagName === 'BR') {
      node = node.nextElementSibling
      continue
    }
    if (node.tagName === 'P') {
      const labelEl = node.querySelector('strong')
      const label = labelEl ? normLabel(labelEl.textContent ?? '') : ''
      const key = LABEL_MAP[label]
      if (key) {
        const val = paragraphValue(node)
        if (val) out[key] = val
      }
    }
    node = node.nextElementSibling
  }

  return out
}

/** Есть ли хотя бы одно поле для stat-rows */
export function hasClassProficiencies(p: ClassProficiencies): boolean {
  return !!(p.armor || p.weapons || p.tools || p.savingThrows || p.skills)
}

/** Удаляет секцию «ВЛАДЕНИЕ» из DOM статьи класса (дублирует stat-rows). */
export function cutProficiencySection(content: Element): void {
  const heading = findProficiencyHeading(content)
  if (!heading) return
  let node: ChildNode | null = heading.nextSibling
  heading.remove()
  while (node) {
    if (node instanceof Element && isProficiencyBoundary(node)) break
    const next = node.nextSibling
    node.remove()
    node = next
  }
}
