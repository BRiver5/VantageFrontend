/**
 * Записи другой редакции в поисках выбора (конструктор, повышение уровня, редактор).
 *
 * Список своей редакции остаётся основным; когда игрок что-то ищет, следом за своими
 * находками идут найденные записи другой редакции — с пометкой `other_edition`
 * («из редакции 2014»). Запись, у которой в своей редакции есть пара (тот же
 * variant_group или то же название), не дублируется.
 */
import { useEffect, useState } from 'react'
import { fetchAll } from '../api'
import type { Edition } from '../editions/edition'
import { otherEditionOf } from '../editions/edition'
import { normText } from './fuzzy'
import { applySmartSearch, type SearchRanks } from './sectionSearch'

const cache = new Map<string, Promise<unknown[]>>()

export const flipEdition = (e: Edition): Edition => (e === '2014' ? '2024' : '2014')

/** Весь список другой редакции (кэш на сессию), каждая запись помечена other_edition */
export function loadOtherEdition<T>(resource: string, edition: Edition): Promise<T[]> {
  const other = flipEdition(edition)
  const key = `${resource}:${other}`
  let p = cache.get(key)
  if (!p) {
    p = fetchAll<Record<string, unknown>>(resource, { edition: other })
      .then((items) => items.map((it) => ({ ...it, other_edition: other })))
      .catch(() => {
        cache.delete(key)
        return []
      })
    cache.set(key, p)
  }
  return p as Promise<T[]>
}

/** Записи другой редакции; грузятся, только когда нужны (enabled — обычно «идёт поиск») */
export function useOtherEdition<T>(resource: string, edition: Edition | null | undefined, enabled: boolean): T[] {
  const [state, setState] = useState<{ key: string; items: T[] } | null>(null)
  const key = edition ? `${resource}:${edition}` : ''
  useEffect(() => {
    if (!enabled || !edition) return
    let alive = true
    void loadOtherEdition<T>(resource, edition).then((items) => alive && setState({ key, items }))
    return () => {
      alive = false
    }
  }, [resource, edition, enabled, key])
  return state?.key === key ? state.items : EMPTY
}
const EMPTY: never[] = []

type Rec = { id?: string; variant_group?: string | null }

/** Записи другой редакции без пары среди своих (по variant_group или названию) */
export function withoutCounterparts<T>(own: readonly T[], others: readonly T[], nameOf: (t: T) => string): T[] {
  if (!others.length) return []
  const groups = new Set(own.map((o) => (o as Rec).variant_group).filter(Boolean))
  const names = new Set(own.map((o) => normText(nameOf(o))))
  const ids = new Set(own.map((o) => (o as Rec).id))
  return others.filter((o) => {
    const r = o as Rec
    return !ids.has(r.id) && !(r.variant_group && groups.has(r.variant_group)) && !names.has(normText(nameOf(o)))
  })
}

/**
 * Поиск по своим записям и следом — по записям другой редакции (без пары среди своих).
 * Без запроса — только свои.
 */
export function searchBothEditions<T>(
  own: readonly T[],
  others: readonly T[],
  query: string,
  ranks: SearchRanks | null,
  idOf: (t: T) => string,
  nameOf: (t: T) => string,
): T[] {
  if (!query.trim()) return [...own]
  return [
    ...applySmartSearch(own, query, ranks, idOf, nameOf),
    ...applySmartSearch(withoutCounterparts(own, others, nameOf), query, ranks, idOf, nameOf),
  ]
}

/** Подпись записи другой редакции: «2014» или null */
export const otherEditionLabel = (item: unknown): string | null => otherEditionOf(item)
