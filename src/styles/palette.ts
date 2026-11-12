/**
 * Цвета из CSS-переменных (tokens.css) для кода, который рисует сам —
 * холст карты и т. п. Значение читается с :root один раз и кэшируется;
 * пока переменной нет (стили не подключены, нет document) — запасной цвет.
 */
const cache = new Map<string, string>()

export function cssVar(name: string, fallback: string): string {
  const hit = cache.get(name)
  if (hit !== undefined) return hit
  const value = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!value) return fallback
  cache.set(name, value)
  return value
}
