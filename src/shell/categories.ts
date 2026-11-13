import {
  Award,
  Backpack,
  Gem,
  Landmark,
  ScrollText,
  Sparkles,
  Skull,
  Swords,
  VenetianMask,
  BookMarked,
} from 'lucide-react'

/* ---------- Разделы каталога ---------- */

export const CATEGORIES = [
  { path: '/classes', label: 'Классы', icon: Swords },
  { path: '/races', label: 'Расы', icon: VenetianMask },
  { path: '/backgrounds', label: 'Предыстории', icon: Landmark },
  { path: '/feats', label: 'Черты', icon: Award },
  { path: '/spells', label: 'Заклинания', icon: Sparkles },
  { path: '/equipment', label: 'Снаряжение', icon: Backpack },
  { path: '/items', label: 'Предметы', icon: Gem },
  { path: '/bestiary', label: 'Бестиарий', icon: Skull },
  { path: '/terms', label: 'Термины', icon: BookMarked },
  { path: '/characters', label: 'Персонажи', icon: ScrollText },
] as const

// «Персонажи» и «Комнаты» — не справочник: у них свои вкладки внизу и пункты в меню
export const CODEX = CATEGORIES.filter((c) => c.path !== '/characters')
