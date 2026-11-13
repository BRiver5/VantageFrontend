/** Значки меток: набор совпадает с NOTE_ICONS сервера */
import type { NoteIcon } from '../layers/types'

export const NOTE_ICONS: { id: NoteIcon; glyph: string; label: string }[] = [
  { id: 'pin', glyph: '📍', label: 'Метка' },
  { id: 'book', glyph: '📖', label: 'Книга' },
  { id: 'scroll', glyph: '📜', label: 'Свиток' },
  { id: 'skull', glyph: '💀', label: 'Опасность' },
  { id: 'castle', glyph: '🏰', label: 'Замок' },
  { id: 'house', glyph: '🏠', label: 'Дом' },
  { id: 'tavern', glyph: '🍺', label: 'Таверна' },
  { id: 'shop', glyph: '🛒', label: 'Лавка' },
  { id: 'cave', glyph: '🕳️', label: 'Пещера' },
  { id: 'tree', glyph: '🌲', label: 'Лес' },
  { id: 'mountain', glyph: '⛰️', label: 'Горы' },
  { id: 'star', glyph: '⭐', label: 'Звезда' },
  { id: 'question', glyph: '❓', label: 'Загадка' },
  { id: 'exclamation', glyph: '❗', label: 'Внимание' },
  { id: 'chest', glyph: '🧰', label: 'Сундук' },
  { id: 'door', glyph: '🚪', label: 'Дверь' },
  { id: 'flag', glyph: '🚩', label: 'Флаг' },
  { id: 'sword', glyph: '⚔️', label: 'Бой' },
  { id: 'camp', glyph: '🏕️', label: 'Лагерь' },
  { id: 'portal', glyph: '🌀', label: 'Портал' },
]

export const glyphOf = (id: NoteIcon) => NOTE_ICONS.find((i) => i.id === id)?.glyph ?? '📍'

export const NOTE_TINTS = ['#f5d06a', '#e2584b', '#6fb3ff', '#6fe39a', '#c89bff', '#ffffff']
