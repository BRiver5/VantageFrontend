/**
 * Что показать на карточке снаряжения: подпись, главный показатель (урон, КД,
 * вместимость) и строка свойств. Чистая логика — вид в renderers.tsx.
 */
import type { Equipment } from './api'
import { formatDice, formatWeight } from './equipment'
import { plural } from './lib/plural'

export type EquipmentFact = { value: string; label: string }

/** Оттенок медальона под рисунком */
export type EquipmentTone = 'ember' | 'steel' | 'amber' | 'venom' | 'earth' | 'plain'

const CATEGORY_TONE: Record<string, EquipmentTone> = {
  'Оружие': 'ember',
  'Боеприпасы': 'ember',
  'Доспехи': 'steel',
  'Инструменты': 'amber',
  'Музыкальные инструменты': 'amber',
  'Игровые наборы': 'amber',
  'Зелья и яды': 'venom',
  'Животные': 'earth',
  'Транспорт': 'earth',
}

export function equipmentTone(category: string | null | undefined): EquipmentTone {
  return (category && CATEGORY_TONE[category]) || 'plain'
}

const lower = (s: string) => s.toLowerCase()

/** Подпись над названием: у оружия вид коротко, у прочего — категория и первая метка */
export function equipmentKicker(eq: Equipment): string {
  const w = eq.weapon
  if (w) {
    const kind = [w.weapon_kind, w.attack_kind && lower(w.attack_kind)].filter(Boolean).join(' · ')
    if (kind) return kind
  }
  if (eq.subcategory) return eq.subcategory
  // «Музыкальные инструменты · музыкальный инструмент» — метка повторяет категорию
  const tag = eq.tags.find((t) => !lower(eq.category).includes(lower(t).slice(0, 5)))
  return tag ? `${eq.category} · ${tag}` : eq.category
}

/** Главный показатель: урон, КД, размер пачки, содержимое или вместимость */
export function equipmentFact(eq: Equipment): EquipmentFact | null {
  const { weapon: w, defense: d, container: c } = eq
  const dice = formatDice(w?.damage_dice)
  if (dice) return { value: dice, label: w?.damage_type ? lower(w.damage_type) : 'урон' }
  if (d?.armor_class != null) {
    // щит прибавляет к КД, а не задаёт его
    const bonus = d.armor_kind === 'Щит' || d.armor_class_formula?.startsWith('+')
    const dex = d.add_dex_modifier ? `+ ЛОВ${d.dex_modifier_cap != null ? ` (макс. ${d.dex_modifier_cap})` : ''}` : ''
    return { value: `КД ${bonus ? '+' : ''}${d.armor_class}`, label: dex }
  }
  if (eq.bundle_size != null && eq.bundle_size > 1) return { value: `${eq.bundle_size} шт.`, label: 'в пачке' }
  if (w || !c) return null
  const inside = c.default_contents.length
  if (inside > 1) return { value: String(inside), label: `${plural(inside, ['предмет', 'предмета', 'предметов'])} внутри` }
  const capacity = formatWeight(c.capacity_pounds)
  if (capacity) return { value: capacity, label: 'вмещает' }
  if (c.slots) return { value: String(c.slots), label: plural(c.slots, ['место', 'места', 'мест']) }
  return null
}

/** Строка свойств: у оружия — свойства и приём, у доспеха — требования */
export function equipmentNotes(eq: Equipment): string[] {
  const { weapon: w, defense: d } = eq
  const out: string[] = []
  if (w) {
    for (const p of w.properties) {
      out.push(p === 'Универсальное' && w.versatile_dice ? `универсальное ${formatDice(w.versatile_dice)}` : lower(p))
    }
    if (w.range_normal != null) out.push(`${w.range_normal}${w.range_long ? `/${w.range_long}` : ''} фт.`)
    // сервер отдаёт приёмы списком, хотя в типе строка
    const mastery = [w.mastery as string | string[] | null].flat().filter(Boolean) as string[]
    if (mastery.length) out.push(`приём: ${mastery.map(lower).join(', ')}`)
  }
  if (d) {
    if (d.strength_requirement) out.push(`Сила ${d.strength_requirement}`)
    if (d.stealth_disadvantage) out.push('помеха скрытности')
    if (d.hit_points) out.push(`${d.hit_points} ${plural(d.hit_points, ['хит', 'хита', 'хитов'])}`)
  }
  return out
}

/** Описание оружия, доспехов и пачек боеприпасов повторяет показатели — на карточке его нет */
export function showsDescription(eq: Equipment): boolean {
  if (!eq.description) return false
  if (eq.weapon || eq.category === 'Доспехи') return false
  return !(eq.category === 'Боеприпасы' && equipmentFact(eq))
}
