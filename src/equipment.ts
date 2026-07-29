/**
 * Хелперы снаряжения: подписи, иконки и фильтры выбора из грантов.
 *
 * Значения категорий, видов оружия и доспехов НЕ хардкодим — они приходят из
 * `GET /api/meta/enums`. Здесь только то, чего в справочниках нет: русские
 * подписи к машинным ключам (`container_kind`, коды валют) и иконки.
 */
import {
  Backpack,
  Boxes,
  Crosshair,
  Dices,
  FlaskConical,
  Hammer,
  Music,
  Package,
  PawPrint,
  Shield,
  ShoppingBasket,
  Swords,
  Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Cost, Currency, Equipment, GrantEntry } from './api'

export const CURRENCY_RU: Record<Currency, string> = {
  cp: 'мм',
  sp: 'см',
  ep: 'эм',
  gp: 'зм',
  pp: 'пм',
}

/** Ключи `container_kind` приходят с бэкенда по-английски, подписей в enums нет */
export const CONTAINER_KIND_RU: Record<string, string> = {
  bag: 'сумка',
  pack: 'набор',
  purse: 'кошель',
  outfit: 'комплект одежды',
  quiver: 'колчан',
  magazine: 'боекомплект',
  furniture: 'мебель',
}

export function containerKindRu(kind: string): string {
  return CONTAINER_KIND_RU[kind] ?? kind
}

/** Дробные значения из API («0.5 фнт.») пишем по-русски, целые — с разделителями */
function formatAmount(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('ru') : String(n).replace('.', ',')
}

/**
 * Цена в родной валюте предмета («5 см», «200 зм»). Если `cost` не задан,
 * раскладываем `cost_copper` в крупнейшую валюту без остатка.
 */
export function formatCost(cost: Cost | null, costCopper: number | null): string | null {
  if (cost) return `${formatAmount(cost.amount)} ${CURRENCY_RU[cost.currency] ?? cost.currency}`
  if (costCopper == null || costCopper <= 0) return null
  if (costCopper % 100 === 0) return `${formatAmount(costCopper / 100)} ${CURRENCY_RU.gp}`
  if (costCopper % 10 === 0) return `${formatAmount(costCopper / 10)} ${CURRENCY_RU.sp}`
  return `${formatAmount(costCopper)} ${CURRENCY_RU.cp}`
}

export function formatWeight(weight: number | null): string | null {
  if (weight == null || weight <= 0) return null
  return `${formatAmount(weight)} фнт.`
}

/** API отдаёт кости латиницей («1d6»), а весь интерфейс пишет их как «1к6» */
export function formatDice(dice: string | null | undefined): string | null {
  return dice ? dice.replace(/(\d)\s*d/gi, '$1к') : null
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Оружие': Swords,
  'Доспехи': Shield,
  'Боеприпасы': Crosshair,
  'Снаряжение': Backpack,
  'Инструменты': Hammer,
  'Музыкальные инструменты': Music,
  'Игровые наборы': Dices,
  'Транспорт': Truck,
  'Животные': PawPrint,
  'Зелья и яды': FlaskConical,
  'Торговые товары': ShoppingBasket,
  'Прочее': Package,
}

export function categoryIcon(category: string | null | undefined): LucideIcon {
  return (category && CATEGORY_ICONS[category]) || Boxes
}

/* ---------- Гранты ---------- */

/** Entry без `slug` — это выбор из каталога, а не конкретный предмет */
export function isChoiceEntry(entry: GrantEntry): boolean {
  return !entry.slug
}

/**
 * Подходит ли предмет под фильтры выбора. Измерения складываются по И, внутри
 * измерения — по ИЛИ; пустой список не ограничивает. Entry без единого фильтра
 * не матчит ничего (иначе «любой предмет каталога» вместо ошибки разметки).
 */
export function matchesGrantEntry(eq: Equipment, entry: GrantEntry): boolean {
  const dims = [
    entry.choose_from_slugs,
    entry.choose_from_tags,
    entry.choose_from_categories,
    entry.choose_from_weapon_kinds,
    entry.choose_from_attack_kinds,
  ]
  if (dims.every((d) => d.length === 0)) return false

  if (entry.choose_from_slugs.length && !entry.choose_from_slugs.includes(eq.slug)) return false
  if (entry.choose_from_tags.length && !entry.choose_from_tags.some((t) => eq.tags.includes(t))) return false
  if (entry.choose_from_categories.length && !entry.choose_from_categories.includes(eq.category)) return false
  if (
    entry.choose_from_weapon_kinds.length &&
    !(eq.weapon?.weapon_kind && entry.choose_from_weapon_kinds.includes(eq.weapon.weapon_kind))
  ) {
    return false
  }
  if (
    entry.choose_from_attack_kinds.length &&
    !(eq.weapon?.attack_kind && entry.choose_from_attack_kinds.includes(eq.weapon.attack_kind))
  ) {
    return false
  }
  return true
}

/**
 * Фильтры выбора в адрес каталога — ключи совпадают с ключами групп фильтров
 * `/equipment`, который поднимает их из URL при входе. `choose_from_slugs`
 * отдельной группы не имеет, поэтому в адрес не попадает.
 */
export function entryCatalogQuery(entry: GrantEntry): string | null {
  const params = new URLSearchParams()
  const add = (key: string, values: string[]) => {
    if (values.length) params.set(key, values.join(','))
  }
  add('category', entry.choose_from_categories)
  add('tag', entry.choose_from_tags)
  add('weapon_kind', entry.choose_from_weapon_kinds)
  add('attack_kind', entry.choose_from_attack_kinds)
  const q = params.toString()
  return q ? q : null
}

/** Подпись выбора для UI: своя из данных, иначе собираем из фильтров */
export function entryChoiceLabel(entry: GrantEntry): string {
  if (entry.label) return entry.label
  const parts = [
    ...entry.choose_from_weapon_kinds,
    ...entry.choose_from_attack_kinds,
    ...entry.choose_from_categories,
    ...entry.choose_from_tags,
  ]
  const tail = parts.length ? parts.join(' · ').toLowerCase() : 'предмет из каталога'
  return entry.choose_count > 1 ? `${entry.choose_count} × ${tail}` : `любое: ${tail}`
}
