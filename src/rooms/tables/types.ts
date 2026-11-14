/** Таблицы случайных результатов: контракт сервера, см. docs/ROOMS_FRONTEND.md «Таблицы» */

export type ResultType = 'text' | 'item' | 'creature' | 'kb_page' | 'table'
/** item: equipment | magic_item | template; creature: catalog | room */
export type RefKind = 'equipment' | 'magic_item' | 'template' | 'catalog' | 'room'
export type TableVisibility = 'gm' | 'all' | 'some'

export interface TableResult {
  id: string
  range: [number, number] | null
  weight: number
  type: ResultType
  text: string
  ref_id?: string | null
  ref_kind?: RefKind | null
  image?: string | null
  drawn: boolean
}

export interface RollTable {
  id: string
  room_id: string
  name: string
  description: string
  formula: string
  replacement: boolean
  results: TableResult[]
  folder: string | null
  visibility: TableVisibility
  shared_with?: string[]
  image: string | null
  updated_at?: string
}

export type TableBody = Partial<Omit<RollTable, 'id' | 'room_id' | 'updated_at'>>

export interface DrawnResult extends TableResult {
  nested: TableDraw | { error: string; table_id?: string } | null
}

export interface TableDraw {
  table_id: string
  table_name: string
  roll: { expression: string; total: number } | null
  forced: boolean
  results: DrawnResult[]
}

export interface TableDrawn {
  table_id: string
  table_name: string
  mode: 'public' | 'gm'
  draws: TableDraw[]
}

export interface DrawResponse extends TableDrawn {
  table: RollTable
}

/** Что можно положить в результат: строка выбора ссылки или перетаскивание */
export interface RefPick {
  type: Exclude<ResultType, 'text'>
  ref_id: string
  ref_kind: RefKind | null
  text: string
  image: string | null
}
