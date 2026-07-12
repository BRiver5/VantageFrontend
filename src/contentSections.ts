import {
  Gem,
  Landmark,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Users,
  VenetianMask,
} from 'lucide-react'
import type { ContentTotals } from './api'

/** Разделы содержимого книги; base — маршрут детальной страницы */
export const CONTENT_SECTIONS = [
  { key: 'classes', totalsKey: 'classes' as const, label: 'Классы', chipLabel: 'классов', icon: Swords, base: '/classes' },
  { key: 'subclasses', totalsKey: 'subclasses' as const, label: 'Подклассы', chipLabel: 'подклассов', icon: Shield, base: '/subclasses' },
  { key: 'races', totalsKey: 'races' as const, label: 'Расы', chipLabel: 'рас', icon: VenetianMask, base: '/races' },
  { key: 'subraces', totalsKey: 'subraces' as const, label: 'Подрасы', chipLabel: 'подрас', icon: Users, base: '/subraces' },
  { key: 'feats', totalsKey: 'feats' as const, label: 'Черты', chipLabel: 'черт', icon: Star, base: '/feats' },
  { key: 'backgrounds', totalsKey: 'backgrounds' as const, label: 'Предыстории', chipLabel: 'предысторий', icon: Landmark, base: '/backgrounds' },
  { key: 'spells', totalsKey: 'spells' as const, label: 'Заклинания', chipLabel: 'заклинаний', icon: Sparkles, base: '/spells' },
  { key: 'items', totalsKey: 'items' as const, label: 'Предметы', chipLabel: 'предметов', icon: Gem, base: '/items' },
  { key: 'creatures', totalsKey: 'creatures' as const, label: 'Существа', chipLabel: 'существ', icon: Skull, base: '/bestiary' },
] as const

export type ContentSectionKey = (typeof CONTENT_SECTIONS)[number]['key']
export type LootTotalsKey = keyof ContentTotals | 'creatures'

export const LOOT_CHIP_ROWS = CONTENT_SECTIONS.filter(
  (s): s is typeof s & { totalsKey: keyof ContentTotals } => s.totalsKey !== 'creatures',
)

export function scrollToTomeSection(sectionKey: string) {
  const el = document.getElementById(`tome-${sectionKey}`)
  if (!el) return
  if (el instanceof HTMLDetailsElement) el.open = true
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Одна запись — сразу на детальную; несколько — к разделу книги */
export function contentEntryLink(
  bookId: string,
  sectionKey: string,
  base: string,
  ids: string[] | null | undefined,
): string | null {
  if (!ids?.length) return null
  if (ids.length === 1) return `${base}/${ids[0]}`
  return `/books/${bookId}#tome-${sectionKey}`
}
