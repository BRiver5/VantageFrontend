import {
  ArrowDownAZ,
  BookMarked,
  Coins,
  Flame,
  Gem,
  Heart,
  Scale,
  Shield,
  Sparkles,
  Star,
} from 'lucide-react'
import type {
  Creature,
  Equipment,
  Item,
  Spell,
} from '../../api'
import { type SortOption, bookCmp, byRating, numCmp } from './config'
import { rarityRank } from './rarity'

export const itemSorts: SortOption<Item>[] = [
  { key: 'rating', label: 'Рейтинг', icon: Star, cmp: (a, b) => byRating(a, b) },
  { key: 'name', label: 'А — Я', icon: ArrowDownAZ, cmp: (a, b) => a.item_name.localeCompare(b.item_name, 'ru') },
  { key: 'rarity', label: 'Редкость', icon: Gem, cmp: (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.item_source, b.item_source, bm) },
]

export const creatureSorts: SortOption<Creature>[] = [
  { key: 'rating', label: 'Рейтинг', icon: Star, cmp: (a, b) => byRating(a, b) },
  { key: 'name', label: 'А — Я', icon: ArrowDownAZ, cmp: (a, b) => a.name.localeCompare(b.name, 'ru') },
  { key: 'cr', label: 'Опасность', icon: Flame, cmp: (a, b) => (a.challenge_rating ?? -1) - (b.challenge_rating ?? -1) },
  { key: 'ac', label: 'КД', icon: Shield, cmp: (a, b) => a.ac - b.ac },
  { key: 'hp', label: 'Хиты', icon: Heart, cmp: (a, b) => a.hp - b.hp },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.book_source_id, b.book_source_id, bm) },
]

export const equipmentSorts: SortOption<Equipment>[] = [
  { key: 'rating', label: 'Рейтинг', icon: Star, cmp: (a, b) => byRating(a, b) },
  {
    key: 'name',
    label: 'А — Я',
    icon: ArrowDownAZ,
    cmp: (a, b) => a.equipment_name.localeCompare(b.equipment_name, 'ru'),
  },
  { key: 'cost', label: 'Цена', icon: Coins, cmp: (a, b) => numCmp(a.cost_copper, b.cost_copper) },
  { key: 'weight', label: 'Вес', icon: Scale, cmp: (a, b) => numCmp(a.weight, b.weight) },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.book_source_id, b.book_source_id, bm) },
]

export const spellSorts: SortOption<Spell>[] = [
  { key: 'rating', label: 'Рейтинг', icon: Star, cmp: (a, b) => byRating(a, b) },
  { key: 'name', label: 'А — Я', icon: ArrowDownAZ, cmp: (a, b) => a.spell_name.localeCompare(b.spell_name, 'ru') },
  { key: 'level', label: 'Круг', icon: Sparkles, cmp: (a, b) => a.spell_level - b.spell_level },
  { key: 'book', label: 'Книга', icon: BookMarked, cmp: (a, b, bm) => bookCmp(a.spell_source, b.spell_source, bm) },
]
