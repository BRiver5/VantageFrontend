
const RARITY_ORDER = ['обычный', 'необычный', 'редкий', 'очень редкий', 'легендарный', 'артефакт']

export function rarityRank(r: string | null): number {
  if (!r) return 999
  const i = RARITY_ORDER.indexOf(r.toLowerCase())
  return i === -1 ? 999 : i
}

/* ---------- Карточки по типам ---------- */

const RARITY_KEY: Record<string, string> = {
  'обычный': 'common',
  'необычный': 'uncommon',
  'редкий': 'rare',
  'очень редкий': 'very-rare',
  'легендарный': 'legendary',
  'артефакт': 'artifact',
}

export function rarityKeyOf(r: string | null | undefined): string {
  return (r && RARITY_KEY[r.toLowerCase()]) || 'common'
}

export const RARITY_FILTERS: { key: string; label: string }[] = [
  { key: 'common', label: 'Обычный' },
  { key: 'uncommon', label: 'Необычный' },
  { key: 'rare', label: 'Редкий' },
  { key: 'very-rare', label: 'Очень редкий' },
  { key: 'legendary', label: 'Легендарный' },
  { key: 'artifact', label: 'Артефакт' },
]

export const RARITY_COLOR: Record<string, string> = {
  common: '#b0b6bf',
  uncommon: '#3fae5a',
  rare: '#3b82f6',
  'very-rare': '#a855f7',
  legendary: '#f59e0b',
  artifact: '#de4234',
}

/** Ценовые вилки в золотых; max не включается. */
export const PRICE_BANDS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'lt100', label: 'до 100 зм', min: 0, max: 100 },
  { key: '100-1k', label: '100 – 1 000 зм', min: 100, max: 1000 },
  { key: '1k-10k', label: '1 000 – 10 000 зм', min: 1000, max: 10000 },
  { key: 'gt10k', label: 'свыше 10 000 зм', min: 10000, max: Infinity },
]
