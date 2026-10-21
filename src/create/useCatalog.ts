/** Загрузка списков каталога для шагов визарда. */
import { useEffect, useState } from 'react'
import { fetchAll, getBookMap, getSubraces } from '../api'
import type { BookMap, Subrace } from '../api'

export interface CatalogState<T> {
  items: T[]
  loading: boolean
  error: string | null
}

/**
 * Весь список ресурса (расы, классы, предыстории) — он помещается в память.
 * `enabled: false` откладывает запрос: списки заклинаний и черт нужны не всем.
 */
export function useCatalogList<T>(resource: string, enabled = true): CatalogState<T> {
  const [state, setState] = useState<CatalogState<T>>({ items: [], loading: enabled, error: null })

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: null })
      return
    }
    let alive = true
    setState({ items: [], loading: true, error: null })
    fetchAll<T>(resource)
      .then((items) => {
        if (alive) setState({ items, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (alive) {
          setState({
            items: [],
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      })
    return () => {
      alive = false
    }
  }, [resource, enabled])

  return state
}

/** Подрасы выбранной расы; пустой массив — у расы их нет, шаг пропускается */
export function useSubraces(raceId: string | null): { items: Subrace[]; loading: boolean } {
  const [items, setItems] = useState<Subrace[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!raceId) {
      setItems([])
      return
    }
    let alive = true
    setLoading(true)
    getSubraces(raceId)
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch(() => {
        if (alive) setItems([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [raceId])

  return { items, loading }
}

/**
 * id рас, у которых есть подрасы, — для пометки на карточке и фильтра.
 * Запросы идут отдельно от списка рас, поэтому сетка их не ждёт.
 */
export function useRacesWithSubraces(raceIds: string[]): Set<string> {
  const [withSubs, setWithSubs] = useState<Set<string>>(() => new Set())
  const key = raceIds.join(',')

  useEffect(() => {
    if (!key) return
    let alive = true
    for (const id of key.split(',')) {
      getSubraces(id)
        .then((list) => {
          if (alive && list.length > 0) setWithSubs((prev) => new Set(prev).add(id))
        })
        .catch(() => {
          /* без пометки — не страшно */
        })
    }
    return () => {
      alive = false
    }
  }, [key])

  return withSubs
}

let bookMapPromise: Promise<BookMap> | null = null

/** Книги по id — для фильтра «Книга» на шагах выбора; грузятся один раз */
export function useBookMap(): BookMap {
  const [books, setBooks] = useState<BookMap>({})
  useEffect(() => {
    let alive = true
    bookMapPromise ??= getBookMap().catch((e: unknown) => {
      bookMapPromise = null
      throw e
    })
    bookMapPromise.then((map) => alive && setBooks(map)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return books
}
