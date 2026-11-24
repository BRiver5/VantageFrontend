/**
 * Умный поиск внутри раздела — тот же, что на главной (сервер /search: опечатки, неверная
 * раскладка, части слов, английские названия), но только по одной сущности.
 *
 * Сервер отдаёт id в порядке релевантности; страница показывает свои уже загруженные записи
 * в этом порядке. Пока ответа нет (или сервер недоступен) — локальное совпадение по названию,
 * которое тоже понимает неверную раскладку («ауфкдщкв» → «фаерболл»).
 */
import { useEffect, useState } from 'react'
import { searchCatalog } from '../api'
import { fuzzyScore, normText, swapLayout } from './fuzzy'

/** id записи → место в выдаче (0 — лучшее) */
export type SearchRanks = Map<string, number>

const cache = new Map<string, Promise<SearchRanks>>()

/** Ранги найденного сервером: entity — сущность поиска (spells, items, backgrounds…) */
export function smartSearchRanks(entity: string, query: string): Promise<SearchRanks> {
  const q = query.trim()
  const key = `${entity}\n${q.toLowerCase()}`
  let p = cache.get(key)
  if (!p) {
    // edition: null — без фильтра редакции: результат пересекается со списком страницы
    p = searchCatalog(q, { entities: [entity], limit: 100, edition: null, otherEditions: false })
      .then((res) => {
        const out: SearchRanks = new Map()
        res.items.filter((h) => h.entity === entity).forEach((h, i) => out.has(h.id) || out.set(h.id, i))
        return out
      })
      .catch(() => {
        cache.delete(key)
        return new Map()
      })
    cache.set(key, p)
  }
  return p
}

/** Локальное совпадение: подстрока названия в обеих раскладках, ё = е */
export function localMatch(name: string, query: string): boolean {
  const n = normText(name)
  const q = normText(query.trim())
  if (!q) return true
  return n.includes(q) || n.includes(swapLayout(q))
}

/**
 * Опечатка: буквы запроса идут в названии по порядку («отшелник» → «Отшельник»), а слово
 * названия ненамного длиннее запроса — иначе короткий запрос «найдёт» что угодно.
 */
export function typoMatch(name: string, query: string): boolean {
  const q = normText(query.trim()).replace(/\s+/g, '')
  if (q.length < 4) return false
  return normText(name)
    .split(/[^\p{L}\p{N}]+/u)
    .some((w) => w.length >= q.length - 1 && w.length <= q.length + 2 && fuzzyScore(q, w) !== null)
}

/**
 * Отобрать и упорядочить записи по запросу: сначала найденные сервером (по релевантности),
 * потом совпавшие локально, потом с опечаткой. Пустой запрос — всё как есть.
 */
export function applySmartSearch<T>(items: readonly T[], query: string, ranks: SearchRanks | null, idOf: (t: T) => string, nameOf: (t: T) => string): T[] {
  if (!query.trim()) return [...items]
  const hit: T[] = []
  const local: T[] = []
  const typo: T[] = []
  for (const it of items) {
    if (ranks?.has(idOf(it))) hit.push(it)
    else if (localMatch(nameOf(it), query)) local.push(it)
    else if (typoMatch(nameOf(it), query)) typo.push(it)
  }
  hit.sort((a, b) => ranks!.get(idOf(a))! - ranks!.get(idOf(b))!)
  return [...hit, ...local, ...typo]
}

/** Ранги для запроса с задержкой ввода; null — ещё не пришли (или запроса нет) */
export function useSmartRanks(entity: string | null | undefined, query: string, delay = 250): SearchRanks | null {
  const [state, setState] = useState<{ key: string; ranks: SearchRanks } | null>(null)
  const q = query.trim()
  const key = entity && q ? `${entity}\n${q.toLowerCase()}` : ''
  useEffect(() => {
    if (!key || !entity) return
    let alive = true
    const t = setTimeout(() => {
      void smartSearchRanks(entity, q).then((ranks) => alive && setState({ key, ranks }))
    }, delay)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [key, entity, q, delay])
  return state?.key === key ? state.ranks : null
}
