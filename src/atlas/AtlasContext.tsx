/**
 * Данные атласа одного мира и навигация между вкладками. Карта (метки),
 * оглавление лора и указатель лет грузятся один раз — по ним разрешаются
 * ссылки во всех текстах. Состояние вкладок живёт в адресе (?tab=map&place=…),
 * так что любую метку, год или раздел можно открыть по ссылке.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAtlasMap, getLoreIndex, getTimeline } from '../api/atlas'
import type { AtlasMap, AtlasTimeline, AtlasWorld, LoreSection } from '../api/atlas'
import { makeResolver, type LinkResolver, type LinkTarget } from './links'

export type WorldTab = 'overview' | 'lore' | 'map' | 'timeline'

interface AtlasState {
  world: AtlasWorld
  map: AtlasMap | null
  lore: LoreSection[] | null
  timeline: AtlasTimeline | null
  error: string | null
  links: LinkResolver | null
  /** перейти по ссылке из текста */
  go: (target: LinkTarget) => void
}

const Ctx = createContext<AtlasState | null>(null)

export function useAtlas(): AtlasState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAtlas вне AtlasProvider')
  return v
}

/** Параметры вкладок в адресе: tab, place, section, year, era */
export function useWorldParams() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as WorldTab | null) ?? 'overview'
  const set = useCallback(
    (next: Record<string, string | number | null>, replace = false) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(next)) {
            if (v == null || v === '') p.delete(k)
            else p.set(k, String(v))
          }
          if (p.get('tab') === 'overview') p.delete('tab')
          return p
        },
        { replace },
      ),
    [setParams],
  )
  return { params, tab, set }
}

export function AtlasProvider({ world, children }: { world: AtlasWorld; children: ReactNode }) {
  const [map, setMap] = useState<AtlasMap | null>(null)
  const [lore, setLore] = useState<LoreSection[] | null>(null)
  const [timeline, setTimeline] = useState<AtlasTimeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { set } = useWorldParams()

  useEffect(() => {
    let alive = true
    setMap(null)
    setLore(null)
    setTimeline(null)
    setError(null)
    Promise.all([
      world.has.map ? getAtlasMap(world.world) : Promise.resolve(null),
      world.has.lore ? getLoreIndex(world.world) : Promise.resolve([]),
      world.has.timeline ? getTimeline(world.world) : Promise.resolve(null),
    ])
      .then(([m, l, t]) => {
        if (!alive) return
        setMap(m)
        setLore(l)
        setTimeline(t)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [world])

  const links = useMemo(
    () =>
      map || lore || timeline
        ? makeResolver(map?.markers ?? [], lore ?? [], timeline?.eras ?? [], new Set((timeline?.years ?? []).map((y) => y.year)))
        : null,
    [map, lore, timeline],
  )

  const go = useCallback(
    (target: LinkTarget) => {
      switch (target.kind) {
        case 'place':
          set({ tab: 'map', place: target.id })
          break
        case 'lore':
          set({ tab: 'lore', section: target.id })
          break
        case 'year':
          set({ tab: 'timeline', year: target.year, era: null })
          break
        case 'era':
          set({ tab: 'timeline', era: target.index, year: null })
          break
        case 'wiki':
          window.open(target.url, '_blank', 'noopener,noreferrer')
          break
      }
    },
    [set],
  )

  const value = useMemo(() => ({ world, map, lore, timeline, error, links, go }), [world, map, lore, timeline, error, links, go])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
