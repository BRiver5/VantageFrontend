import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getCachedEntity,
  getOne,
} from '../../api'
import type {
  Book,
} from '../../api'

/* ---------- Общие детали ---------- */

/** Книга-источник записи, чтобы показать аббревиатуру с полным названием при наведении */
export function useBookRef(sourceId: string | null | undefined) {
  const [book, setBook] = useState<Book | undefined>(undefined)
  useEffect(() => {
    setBook(undefined)
    if (!sourceId) return
    getOne<Book>('books', sourceId).then(setBook).catch(() => {})
  }, [sourceId])
  return book
}

export function useOne<T>(resource: string, id: string | undefined) {
  // старт из кэша (объект уже загружен каталогом) — деталь рисуется мгновенно,
  // и переход-морф из карточки прилетает на готовый арт/заголовок, а не в загрузку
  const [data, setData] = useState<T | null>(() => getCachedEntity<T>(resource, id))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // без id показывать нечего: иначе на экране осталась бы прошлая запись
    // (снятый подкласс, подкласс прошлого класса и т.п.)
    if (!id) {
      setData(null)
      setError(null)
      return
    }
    setData(getCachedEntity<T>(resource, id))
    setError(null)
    getOne<T>(resource, id)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [resource, id])
  return { data, error }
}

/**
 * Кнопка «назад»: если на страницу пришли по ссылке из статьи (в location.state
 * лежит `from`/`fromLabel`) — ведём обратно именно туда, а не в общий каталог.
 */
export function useContextualBack(
  defaultTo: string,
  defaultLabel: string,
): { backTo: string; backLabel: string } {
  const location = useLocation()
  const st = location.state as { from?: string; fromLabel?: string } | null
  if (st?.from) {
    return { backTo: st.from, backLabel: st.fromLabel ? `к «${st.fromLabel}»` : 'назад' }
  }
  return { backTo: defaultTo, backLabel: defaultLabel }
}

/** Общая «обложка» детальной страницы */
/** Русская редкость → ключ для цвета свечения (используется у предметов). */
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
