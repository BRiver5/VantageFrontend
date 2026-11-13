import {
  Anchor,
  ArrowDownToLine,
  Axe,
  BatteryLow,
  Biohazard,
  Brain,
  Droplets,
  EarOff,
  EyeOff,
  Flame,
  FlaskConical,
  Ghost,
  Hammer,
  Hand,
  Heart,
  Hexagon,
  Link2,
  Moon,
  Mountain,
  Orbit,
  Skull,
  Snowflake,
  Sun,
  Sword,
  Volume2,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const DAMAGE_ICONS: [string, LucideIcon][] = [
  ['огон', Flame],
  ['холод', Snowflake],
  ['яд', Biohazard],
  ['кислот', Droplets],
  ['электрич', Zap],
  ['звук', Volume2],
  ['некрот', Skull],
  ['излучен', Sun],
  ['психич', Brain],
  ['силов', Hexagon],
  ['дробящ', Hammer],
  ['колющ', Sword],
  ['рубящ', Axe],
]

export const CONDITION_ICONS: [string, LucideIcon][] = [
  ['отравлен', FlaskConical],
  ['очарован', Heart],
  ['испуг', Ghost],
  ['истощен', BatteryLow],
  ['паралич', Anchor],
  ['сбивание', ArrowDownToLine],
  ['окаменен', Mountain],
  ['ослеплен', EyeOff],
  ['захват', Hand],
  ['опутан', Link2],
  ['глухот', EarOff],
  ['бессознат', Moon],
  ['ошеломлен', Orbit],
]

export const iconFor = (table: [string, LucideIcon][], text: string) =>
  table.find(([stem]) => text.toLocaleLowerCase('ru').includes(stem))?.[1]

/** «рубящий от немагических атак» → чип «рубящий» + сноска «от немагических атак»;
 *  «кроме нанесённых посеребрённым оружием» — только сноска */
export function splitDamage(list: string[] | null | undefined) {
  const tags: { label: string; Icon: LucideIcon }[] = []
  const notes = new Set<string>()
  for (const raw of list ?? []) {
    const text = raw.trim()
    const Icon = iconFor(DAMAGE_ICONS, text)
    if (!Icon) {
      notes.add(text)
      continue
    }
    const [head, ...rest] = text.split(/\s+(?=от\s|\()/)
    tags.push({ label: head, Icon })
    if (rest.length) notes.add(rest.join(' '))
  }
  return { tags, notes: [...notes] }
}

export const cleanCondition = (s: string) => s.replace(/\s*\?+\s*$/, '').trim()

export const SENSE_COLORS = ['#e3c46e', '#a8afba', '#c878dc']

export const ABILITIES = [
  { key: 'strenght', save: 'strength', short: 'СИЛ', name: 'Сила' },
  { key: 'dexterity', save: 'dexterity', short: 'ЛОВ', name: 'Ловкость' },
  { key: 'constitution', save: 'constitution', short: 'ТЕЛ', name: 'Телосложение' },
  { key: 'intelligence', save: 'intelligence', short: 'ИНТ', name: 'Интеллект' },
  { key: 'wisdom', save: 'wisdom', short: 'МДР', name: 'Мудрость' },
  { key: 'charisma', save: 'charisma', short: 'ХАР', name: 'Харизма' },
] as const
