/** Загрузка списков каталога для шагов визарда. */
import { useEffect, useState } from 'react'
import { fetchAll, getSubList } from '../api'
import type { Subrace } from '../api'

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
    getSubList<Subrace>('races', raceId, 'subraces')
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
