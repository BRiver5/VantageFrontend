/**
 * Инструменты мастера: пакет приключения, снимки комнаты, календарь, «глазами игрока».
 * Контракт — docs/ROOMS_FRONTEND.md, раздел «Инструменты мастера».
 */
import { request } from '../../api'
import type { BattleMap } from '../../maps/types'
import type { RoomClock, RoomState, SharedNote } from '../../types/rooms'

const base = (roomId: string, path: string) => `/rooms/${roomId}${path}`

/* ---------- пакет приключения ---------- */

export type ContentType = 'maps' | 'creatures' | 'items' | 'kb' | 'tables' | 'scenes' | 'audio' | 'clocks' | 'calendar'

export const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: 'maps', label: 'Карты со слоями' },
  { id: 'creatures', label: 'Существа' },
  { id: 'items', label: 'Предметы и заготовки' },
  { id: 'kb', label: 'Кодекс (страницы)' },
  { id: 'tables', label: 'Таблицы' },
  { id: 'scenes', label: 'Пресеты сцен' },
  { id: 'audio', label: 'Звуки и музыка' },
  { id: 'clocks', label: 'Часы' },
  { id: 'calendar', label: 'Календарь' },
]

export interface AdventureBundle {
  format: 'vantage.adventure'
  version: number
  exported_at: string
  source: { room_id: string; room_name: string }
  types: ContentType[]
  counts: Partial<Record<ContentType, number>>
  sections: Record<string, Record<string, unknown>[]>
}

export interface PreviewRow {
  id: string
  section: string
  label: string
}

export interface AdventurePreview {
  version: number
  source: { room_id?: string; room_name?: string }
  types: Partial<Record<ContentType, { label: string; selected: boolean; add: PreviewRow[]; update: PreviewRow[] }>>
  overwrites: number
}

export interface Snapshot {
  id: string
  reason: string
  label: string
  /** байт JSON до сжатия */
  size: number
  stored: number
  counts: Partial<Record<ContentType, number>>
  created_at: string
}

export interface ImportResult {
  snapshot: Snapshot
  types: ContentType[]
  counts: Record<string, number>
  errors: string[]
}

export const exportAdventure = (roomId: string, types?: ContentType[]) =>
  request<AdventureBundle>(base(roomId, `/adventure/export${types ? `?${types.map((t) => `types=${t}`).join('&')}` : ''}`), { auth: true })
export const previewAdventure = (roomId: string, bundle: AdventureBundle, types?: ContentType[]) =>
  request<AdventurePreview>(base(roomId, '/adventure/preview'), { method: 'POST', body: { bundle, types }, auth: true })
export const importAdventure = (roomId: string, bundle: AdventureBundle, types: ContentType[], overwrite: boolean) =>
  request<ImportResult>(base(roomId, '/adventure/import'), { method: 'POST', body: { bundle, types, overwrite }, auth: true })

export async function listSnapshots(roomId: string): Promise<{ items: Snapshot[]; keep: number }> {
  return request<{ items: Snapshot[]; keep: number }>(base(roomId, '/snapshots'), { auth: true })
}
export const createSnapshot = (roomId: string, label = '') => request<Snapshot>(base(roomId, '/snapshots'), { method: 'POST', body: { label }, auth: true })
export const downloadSnapshot = (roomId: string, id: string) => request<AdventureBundle>(base(roomId, `/snapshots/${id}/download`), { auth: true })
export const restoreSnapshot = (roomId: string, id: string, types?: ContentType[]) =>
  request<ImportResult>(base(roomId, `/snapshots/${id}/restore`), { method: 'POST', body: { types }, auth: true })
export const deleteSnapshot = (roomId: string, id: string) => request<void>(base(roomId, `/snapshots/${id}`), { method: 'DELETE', auth: true })

/* ---------- календарь ---------- */

export interface CalendarNote {
  id: string
  year: number
  day: number
  title: string
  text: string
  visibility: 'gm' | 'all'
}

export interface CalendarView {
  visible: boolean
  calendar?: 'harptos' | 'gregorian'
  calendar_label?: string
  year?: number
  /** день года с нуля */
  day?: number
  minute?: number
  year_suffix?: string
  date?: { month: number; month_name: string; day: number; festival: boolean; hour: number; minute: number }
  label?: string
  period?: string
  months?: { name: string; days: number; festival: boolean }[]
  year_length?: number
  link_darkness?: boolean
  dawn?: number
  dusk?: number
  twilight?: number
  night_darkness?: number
  darkness?: number
  notes?: CalendarNote[]
  revision?: number
}

export type CalendarPatch = Partial<Pick<CalendarView, 'calendar' | 'link_darkness' | 'dawn' | 'dusk' | 'twilight' | 'night_darkness' | 'visible'>>

export const getCalendar = (roomId: string) => request<CalendarView>(base(roomId, '/calendar'), { auth: true })
export const patchCalendar = (roomId: string, body: CalendarPatch) => request<CalendarView>(base(roomId, '/calendar'), { method: 'PATCH', body, auth: true })
export const advanceTime = (roomId: string, minutes: number) => request<CalendarView>(base(roomId, '/calendar/advance'), { method: 'POST', body: { minutes }, auth: true })
export const setDate = (roomId: string, body: { year: number; month: number; day: number; hour: number; minute: number }) =>
  request<CalendarView>(base(roomId, '/calendar/set'), { method: 'POST', body, auth: true })
export const addCalendarNote = (roomId: string, body: { title: string; text?: string; visibility: 'gm' | 'all'; year?: number; day?: number }) =>
  request<CalendarView>(base(roomId, '/calendar/notes'), { method: 'POST', body, auth: true })
export const deleteCalendarNote = (roomId: string, id: string) => request<CalendarView>(base(roomId, `/calendar/notes/${id}`), { method: 'DELETE', auth: true })

/* ---------- глазами игрока ---------- */

export interface PlayerView {
  user: { id: string; name: string }
  state: RoomState
  map: BattleMap | null
  layers: Record<string, unknown> | null
  clocks: RoomClock[]
  shared_notes: SharedNote[]
  calendar: CalendarView
}

export const viewAs = (roomId: string, userId: string) => request<PlayerView>(base(roomId, `/view-as/${userId}`), { auth: true })
