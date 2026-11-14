/**
 * Нечёткое совпадение для команд палитры: буквы запроса идут по порядку, но не
 * обязательно подряд («отлис» → «Открыть мой лист»). Выше ценится начало слова,
 * подряд идущие буквы и совпадение с начала. Неверная раскладка (ghbdtn → привет)
 * тоже находится. Регистр и ё/е не важны.
 */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё'
const SWAP = new Map<string, string>()
for (let i = 0; i < EN.length; i++) {
  SWAP.set(EN[i], RU[i])
  SWAP.set(RU[i], EN[i])
}

export const normText = (s: string): string => s.toLowerCase().replace(/ё/g, 'е')

/** Тот же текст в другой раскладке */
export const swapLayout = (s: string): string =>
  Array.from(normText(s))
    .map((ch) => SWAP.get(ch) ?? ch)
    .join('')
    .replace(/ё/g, 'е')

const isBoundary = (text: string, i: number) => i === 0 || /[\s\-_/:.,«»"(]/.test(text[i - 1])

/** Очки совпадения; null — не подходит. Пустой запрос подходит всему с нулём */
export function fuzzyScore(query: string, text: string): number | null {
  const q = normText(query).replace(/\s+/g, '')
  const t = normText(text)
  if (!q) return 0
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    const at = t.indexOf(ch, ti)
    if (at < 0) return null
    let gain = 1
    if (at === prev + 1) gain += 4
    if (isBoundary(t, at)) gain += 3
    if (at === 0) gain += 2
    score += gain
    prev = at
    ti = at + 1
  }
  // целое слово подряд — заметно лучше
  if (t.includes(normText(query).trim())) score += 6
  // короче цель — точнее совпадение
  return score - Math.min(10, Math.floor((t.length - q.length) / 6))
}

/** Лучшее из текста и подсказок (ключевых слов), в обеих раскладках */
export function bestScore(query: string, texts: readonly string[]): number | null {
  let best: number | null = null
  const variants = [query, swapLayout(query)]
  for (const v of variants) {
    for (const t of texts) {
      const s = fuzzyScore(v, t)
      if (s != null && (best == null || s > best)) best = s
    }
  }
  return best
}

export interface Rankable {
  label: string
  keywords?: readonly string[]
}

/** Отобрать и упорядочить: лучшие первыми, при равенстве — исходный порядок */
export function rankByQuery<T extends Rankable>(query: string, items: readonly T[], limit = 50): T[] {
  if (!query.trim()) return items.slice(0, limit)
  return items
    .map((item, i) => ({ item, i, s: bestScore(query, [item.label, ...(item.keywords ?? [])]) }))
    .filter((x): x is { item: T; i: number; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item)
}
