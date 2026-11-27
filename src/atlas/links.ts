/**
 * Куда ведёт ссылка [[Статья вики]] в текстах атласа: на метку карты, в раздел
 * лора, на год или эпоху хронологии — а если у нас такого нет, в саму FR Wiki.
 */
import type { AtlasEra, AtlasMarker, LoreSection } from '../api/atlas'

export type LinkTarget =
  | { kind: 'place'; id: string }
  | { kind: 'lore'; id: string }
  | { kind: 'year'; year: number }
  | { kind: 'era'; index: number }
  | { kind: 'wiki'; url: string }

export const WIKI_BASE = 'https://forgottenrealms.fandom.com/wiki/'

export const wikiUrl = (title: string) => WIKI_BASE + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')

const norm = (s: string) => s.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase()

const YEAR = /^([−-]?\d+)\s*DR$/i

export interface LinkResolver {
  resolve: (title: string) => LinkTarget
  /** ведёт ли ссылка внутрь атласа */
  internal: (title: string) => boolean
}

export function makeResolver(markers: AtlasMarker[], lore: LoreSection[], eras: AtlasEra[], years: Set<number>): LinkResolver {
  const places = new Map<string, string>()
  for (const m of markers) {
    if (m.wiki) places.set(norm(m.wiki), m.id)
    if (!places.has(norm(m.name))) places.set(norm(m.name), m.id)
  }
  const sections = new Map(lore.map((s) => [norm(s.title), s.id]))
  const ages = new Map(eras.map((e) => [norm(e.title), e.index]))

  const resolve = (raw: string): LinkTarget => {
    const title = norm(raw.split('#')[0])
    const y = YEAR.exec(title)
    if (y) {
      const year = Number(y[1].replace('−', '-'))
      if (years.has(year)) return { kind: 'year', year }
    }
    const place = places.get(title)
    if (place) return { kind: 'place', id: place }
    const sec = sections.get(title)
    if (sec) return { kind: 'lore', id: sec }
    const era = ages.get(title)
    if (era != null) return { kind: 'era', index: era }
    return { kind: 'wiki', url: wikiUrl(raw) }
  }
  return { resolve, internal: (t) => resolve(t).kind !== 'wiki' }
}

export function linkHint(target: LinkTarget, title: string): string {
  switch (target.kind) {
    case 'place':
      return `${title} — показать на карте`
    case 'lore':
      return `${title} — открыть в лоре`
    case 'year':
    case 'era':
      return `${title} — в хронологии`
    case 'wiki':
      return `${title} — статья Forgotten Realms Wiki (англ.)`
  }
}
