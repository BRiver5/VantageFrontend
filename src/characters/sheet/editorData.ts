import {
  BookOpen,
  Coins,
  Compass,
  Dumbbell,
  GraduationCap,
  NotebookPen,
  SlidersHorizontal,
  Sparkles,
  Swords,
  UserRound,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AttackEntry, Character, SheetView } from '../../types/character'
import { contributionsOf } from '../sheetView'

export type CombatField = { auto: boolean; value: number; computed: number }

/** КД / хиты / мастерство: авто — как на листе, вручную — оверрайд */
export function combatField(character: Character, view: SheetView, path: string, current: number): CombatField {
  const ov = character.manual_overrides?.[path]
  const rows = contributionsOf(view.breakdown, path)
  const overridden = typeof ov === 'number' || rows.some((r) => r.kind === 'override')
  const base = view.bases?.[path]?.value
  const adds = rows.filter((r) => r.kind !== 'override' && r.op === 'add' && r.value != null)
  const computed =
    overridden && typeof base === 'number' ? base + adds.reduce((s, r) => s + (r.value ?? 0), 0) : current
  if (typeof ov === 'number') return { auto: false, computed, value: ov }
  if (overridden) return { auto: false, computed, value: current }
  return { auto: true, computed: current, value: current }
}

export const COMBAT_PATHS = { ac: 'char.ac', hp: 'char.hp.max', pb: 'char.pb' } as const

/** Ячейки, которые игрок может задать вручную (оверрайд максимума) */
export const SLOT_PATHS = [
  ...Array.from({ length: 9 }, (_, i) => `slots.spell.${i + 1}.max`),
  'slots.pact.max',
  'slots.pact.level',
] as const

/** Текущее значение ячеек по пути — из пулов листа */
export function slotValue(view: SheetView, path: string): number {
  const pools = view.slotPools ?? []
  if (path === 'slots.pact.max') return pools.find((s) => s.pool === 'pact')?.max ?? 0
  if (path === 'slots.pact.level') return pools.find((s) => s.pool === 'pact')?.level ?? 0
  const lvl = Number(/^slots\.spell\.(\d)\.max$/.exec(path)?.[1])
  return pools.find((s) => s.pool === 'spell' && s.level === lvl)?.max ?? 0
}

export const COINS = [
  ['pp', 'Платиновые'],
  ['gp', 'Золотые'],
  ['ep', 'Электрумовые'],
  ['sp', 'Серебряные'],
  ['cp', 'Медные'],
] as const

export const SECTIONS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: 'hero', title: 'Герой', icon: UserRound },
  { id: 'origin', title: 'Происхождение', icon: Compass },
  { id: 'classes', title: 'Класс и уровень', icon: GraduationCap },
  { id: 'abilities', title: 'Характеристики', icon: Dumbbell },
  { id: 'attacks', title: 'Атаки', icon: Swords },
  { id: 'magic', title: 'Заклинания', icon: Wand2 },
  { id: 'bonuses', title: 'Свои бонусы', icon: SlidersHorizontal },
  { id: 'rules', title: 'Особые правила', icon: Sparkles },
  { id: 'feats', title: 'Черты', icon: BookOpen },
  { id: 'purse', title: 'Кошелёк', icon: Coins },
  { id: 'persona', title: 'Личность', icon: NotebookPen },
]

export const ATTACK_TYPES: { value: AttackEntry['type']; label: string }[] = [
  { value: 'melee', label: 'ближний бой' },
  { value: 'ranged', label: 'дальний бой' },
  { value: 'spell', label: 'заклинание' },
  { value: 'other', label: 'другое' },
]

/** Порог опыта для уровней 1–20 (PHB) */
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

export const fmtXp = (n: number) => n.toLocaleString('ru')

/** Подпись записи каталога в списке обеих редакций: «Монах (2024)»; общая запись — без пометки */
export function edLabel(name: string, editions: string[] | null | undefined): string {
  const eds = editions?.length ? editions : ['2014']
  return eds.length === 1 ? `${name} (${eds[0]})` : name
}
