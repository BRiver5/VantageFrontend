/**
 * Атлас мира (сервер: /api/atlas, данные — scripts/atlas): интерактивная карта
 * с метками, хронология по годам и лор. Тексты — Markdown базы знаний со
 * ссылками [[Статья вики|текст]]; куда ведёт ссылка, решает atlas/links.ts.
 */
import { request } from './http'

export interface AtlasWorld {
  world: string
  /** английское название сеттинга, по нему мир привязан к странице сеттинга */
  setting_en: string
  title_ru: string
  has: { map: boolean; timeline: boolean; lore: boolean }
  counts: { markers: number; articles: number; events: number; eras: number; lore: number }
  sources: { name: string; url: string }[]
}

export interface AtlasLayer {
  id: string
  name_ru: string
  color: string
  count: number
}

export interface AtlasMarker {
  id: string
  name: string
  name_ru?: string
  layer: string
  /** пиксели исходной картинки карты */
  x: number
  y: number
  /** статья FR Wiki; null — статьи нет */
  wiki: string | null
  summary?: string
  summary_ru?: string
  image?: string | null
}

export interface AtlasMap {
  image: {
    width: number
    height: number
    tiles_url: string
    max_zoom: number
    meters_per_pixel: number
    attribution: string
  }
  layers: AtlasLayer[]
  markers: AtlasMarker[]
}

export interface Infobox {
  image: string | null
  caption: string | null
  groups: { title: string | null; rows: { label: string; value: string }[] }[]
}

export interface AtlasArticle {
  title: string
  url: string
  infobox: Infobox | null
  summary: string
  body: string
  images: { src: string; caption: string | null }[]
  categories: string[]
  /** перевод (scripts/atlas/translate.py); нет — показываем оригинал */
  summary_ru?: string
  body_ru?: string
  infobox_ru?: Infobox
}

export interface LoreSection extends Partial<AtlasArticle> {
  id: string
  name_ru: string
  topic: string
  title: string
  url: string
  summary: string
}

export interface AtlasEra {
  index: number
  title: string
  name_ru: string
  start: number
  end: number | null
  url: string
  summary: string
  body?: string
  summary_ru?: string
  body_ru?: string
  image: string | null
  years: number
  events: number
}

export interface AtlasYear {
  year: number
  era: number
  /** название из Свитка Лет: «Year of Shadows» */
  name: string | null
  name_ru?: string
  headline: string | null
  headline_ru?: string
  count: number
  cats: string[]
}

export interface AtlasEvent {
  id: number
  era: number
  year: number
  cat: string
  approx: boolean
  /** вложенный пункт — продолжение предыдущего события */
  sub: boolean
  text: string
  text_ru?: string
  links: string[]
}

export interface AtlasTimeline {
  eras: AtlasEra[]
  categories: Record<string, string>
  years: AtlasYear[]
  total: number
}

export interface EventQuery {
  era?: number
  from?: number
  to?: number
  cat?: string[]
  q?: string
  link?: string
  skip?: number
  limit?: number
}

const base = (world: string) => `/atlas/${encodeURIComponent(world)}`

export const getAtlasWorlds = () => request<AtlasWorld[]>('/atlas')
export const getAtlasMap = (world: string) => request<AtlasMap>(`${base(world)}/map`)
export const getAtlasArticle = (world: string, id: string) => request<AtlasArticle>(`${base(world)}/articles/${encodeURIComponent(id)}`)
export const getLoreIndex = (world: string) => request<LoreSection[]>(`${base(world)}/lore`)
export const getLoreSection = (world: string, id: string) => request<LoreSection>(`${base(world)}/lore/${encodeURIComponent(id)}`)
export const getTimeline = (world: string) => request<AtlasTimeline>(`${base(world)}/timeline`)
export const getEra = (world: string, index: number) => request<AtlasEra>(`${base(world)}/timeline/eras/${index}`)

export function getEvents(world: string, query: EventQuery): Promise<{ total: number; skip: number; items: AtlasEvent[] }> {
  const p = new URLSearchParams()
  if (query.era != null) p.set('era', String(query.era))
  if (query.from != null) p.set('from', String(query.from))
  if (query.to != null) p.set('to', String(query.to))
  if (query.cat?.length) p.set('cat', query.cat.join(','))
  if (query.q) p.set('q', query.q)
  if (query.link) p.set('link', query.link)
  p.set('skip', String(query.skip ?? 0))
  p.set('limit', String(query.limit ?? 200))
  return request(`${base(world)}/timeline/events?${p}`)
}

/** Год DR для подписи: −339 → «339 до ЛД», 1358 → «1358 ЛД» */
export function formatDR(year: number): string {
  return year < 0 ? `${Math.abs(year).toLocaleString('ru-RU')} до ЛД` : `${year} ЛД`
}
