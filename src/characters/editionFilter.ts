/**
 * Фильтр «Мои персонажи» по редакции правил: «Все / 2014 / 2024».
 * Чистая логика — счётчики, совпадение и подписи; выбор помнит браузер.
 */
import { isEdition, type Edition } from '../editions/edition'
import { countLabel } from '../lib/plural'

export type EditionFilter = 'all' | Edition

export const EDITION_FILTERS: readonly EditionFilter[] = ['all', '2014', '2024']

/** Ключ localStorage: выбор фильтра живёт на устройстве */
export const EDITION_FILTER_KEY = 'vantage-heroes-edition'

export const sanitizeEditionFilter = (v: unknown): EditionFilter => (isEdition(v) ? v : 'all')

/** Редакция героя: у старых документов поля нет — это 2014 */
export const heroEdition = (c: { edition?: string | null }): Edition => (c.edition === '2024' ? '2024' : '2014')

export const matchesEditionFilter = (c: { edition?: string | null }, f: EditionFilter): boolean =>
  f === 'all' || heroEdition(c) === f

export type EditionCounts = Record<EditionFilter, number>

export function countByEdition(list: readonly { edition?: string | null }[]): EditionCounts {
  const out: EditionCounts = { all: list.length, '2014': 0, '2024': 0 }
  for (const c of list) out[heroEdition(c)]++
  return out
}

/** Варианты фильтра: подпись, число героев и подсказка */
export function editionFilterOptions(counts: EditionCounts): { value: EditionFilter; label: string; count: number; title: string }[] {
  return EDITION_FILTERS.map((f) => ({
    value: f,
    label: f === 'all' ? 'Все' : f,
    count: counts[f],
    title: f === 'all' ? `Все редакции: ${heroesCount(counts.all)}` : `Редакция ${f}: ${heroesCount(counts[f])}`,
  }))
}

/** «3 героя» — счётчик для подписи */
export const heroesCount = (n: number): string => countLabel(n, ['герой', 'героя', 'героев'])

/** Пустой ряд при выбранной редакции */
export function editionEmptyText(f: EditionFilter): string {
  return f === 'all' ? 'Никого не нашлось — попробуйте другие фильтры.' : `Героев по правилам ${f} пока нет.`
}
