import {
  Feather,
  Mountain,
  Shovel,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  creatureTypeRu,
} from '../../api'
import type {
  Creature,
} from '../../api'
import { cap } from './config'

/* ---------- Существа: ступени опасности, базовый тип, передвижение ---------- */

/** Ступени опасности по ПО — цвет свечения карточки и точки в фильтре. */
export const DANGER_TIERS: { key: string; label: string; color: string; max: number }[] = [
  { key: 't0', label: 'ПО 0 – 1/2', color: '#9aa3ad', max: 0.5 },
  { key: 't1', label: 'ПО 1 – 4', color: '#3fae5a', max: 4 },
  { key: 't2', label: 'ПО 5 – 10', color: '#d9a53a', max: 10 },
  { key: 't3', label: 'ПО 11 – 16', color: '#e0672c', max: 16 },
  { key: 't4', label: 'ПО 17+', color: '#d23b3b', max: Infinity },
]

export function dangerTier(cr: number | null) {
  return cr == null ? null : (DANGER_TIERS.find((t) => cr <= t.max) ?? null)
}

export const CREATURE_TYPES = [
  'Аберрация', 'Великан', 'Гуманоид', 'Дракон', 'Зверь', 'Конструкт', 'Монстр',
  'Небожитель', 'Нежить', 'Растение', 'Слизь', 'Фея', 'Элементаль', 'Исчадие',
].sort((a, b) => a.localeCompare(b, 'ru'))

/**
 * Тип в API бывает «Гуманоид (человек», «или Средний Гуманоид (любой расы)» —
 * берём первое слово после возможного «или <размер>» и без уточнения в скобках.
 */
export function creatureBaseType(c: Creature): string | null {
  const t = creatureTypeRu(c.creature_type)
  if (!t) return null
  const word = t.replace(/^или\s+\S+\s+/i, '').split(/[\s(]/)[0]
  return word ? cap(word.toLowerCase()) : null
}

export const SIZE_KEYS = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']

export const MOVE_MODES: { key: string; label: string; icon: LucideIcon; get: (c: Creature) => number | null }[] = [
  { key: 'fly', label: 'Полёт', icon: Feather, get: (c) => c.flight_speed },
  { key: 'swim', label: 'Плавание', icon: Waves, get: (c) => c.swim_speed },
  { key: 'climb', label: 'Лазание', icon: Mountain, get: (c) => c.climb_speed },
  { key: 'burrow', label: 'Копание', icon: Shovel, get: (c) => c.burrow_speed },
]
