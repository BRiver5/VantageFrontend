/**
 * Таблицы случайных результатов: чистые помощники для экрана мастера и журнала.
 * Сервер считает то же самое (app/rooms/roll_tables.py); здесь — чтобы редактор
 * показывал диапазоны и шансы сразу, до сохранения.
 */
import type { RefKind, RefPick, ResultType, RollTable, TableDraw, TableDrawn, TableResult } from './types'

/** Перетаскивание ссылки в строку результата */
export const REF_MIME = 'application/x-vantage-ref'
/** Страница из дерева базы знаний (src/rooms/kb/TreeView.tsx) */
export const KB_PAGE_DRAG = 'text/x-kb-page'

export const TYPE_RU: Record<ResultType, string> = {
  text: 'Текст',
  item: 'Предмет',
  creature: 'Существо',
  kb_page: 'Страница',
  table: 'Таблица',
}

export const VISIBILITY_RU: Record<RollTable['visibility'], string> = {
  gm: 'Только мастер',
  all: 'Все игроки',
  some: 'Выбранные игроки',
}

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`)

export function newResult(results: TableResult[], patch: Partial<TableResult> = {}): TableResult {
  const weight = patch.weight ?? 1
  const low = topOf(results) + 1
  return { id: newId(), range: [low, low + weight - 1], weight, type: 'text', text: '', ref_id: null, ref_kind: null, image: null, drawn: false, ...patch }
}

export const topOf = (results: TableResult[]) => results.reduce((m, r) => Math.max(m, r.range?.[1] ?? 0), 0)

/** Диапазоны подряд от 1 по весам — как «Нормализовать» на сервере */
export function normalizeResults(results: TableResult[]): TableResult[] {
  let low = 1
  return results.map((r) => {
    const range: [number, number] = [low, low + r.weight - 1]
    low += r.weight
    return { ...r, range }
  })
}

export const defaultFormula = (results: TableResult[]) => {
  const top = topOf(results)
  return top >= 2 ? `1d${top}` : '1'
}

export const rangeLabel = (r: TableResult) => (!r.range ? '—' : r.range[0] === r.range[1] ? String(r.range[0]) : `${r.range[0]}–${r.range[1]}`)

/** Доля граней формулы по умолчанию, которую занимает результат, в процентах */
export function chance(r: TableResult, results: TableResult[]): number {
  const top = topOf(results)
  if (!r.range || top <= 0) return 0
  return Math.round(((r.range[1] - r.range[0] + 1) / top) * 1000) / 10
}

/** Диапазоны пересекаются или есть дыры — подскажем нормализовать */
export function rangeIssues(results: TableResult[]): { overlap: boolean; gaps: boolean } {
  const sorted = results.filter((r) => r.range).map((r) => r.range as [number, number]).sort((a, b) => a[0] - b[0])
  let overlap = false
  let gaps = false
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] <= sorted[i - 1][1]) overlap = true
    else if (sorted[i][0] > sorted[i - 1][1] + 1) gaps = true
  }
  if (sorted.length && sorted[0][0] > 1) gaps = true
  return { overlap, gaps }
}

/* ---------- список: папки и поиск ---------- */

export interface TableFolder {
  path: string
  tables: RollTable[]
}

/** Таблицы по папкам («Город/Таверна» — одна папка), без папки — в конце */
export function groupTables(tables: RollTable[], query = ''): TableFolder[] {
  const needle = query.trim().toLocaleLowerCase('ru')
  const hit = (t: RollTable) =>
    !needle || t.name.toLocaleLowerCase('ru').includes(needle) || (t.folder ?? '').toLocaleLowerCase('ru').includes(needle) || t.results.some((r) => r.text.toLocaleLowerCase('ru').includes(needle))
  const map = new Map<string, RollTable[]>()
  for (const t of tables.filter(hit)) {
    const key = (t.folder ?? '').trim()
    map.set(key, [...(map.get(key) ?? []), t])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b, 'ru')))
    .map(([path, list]) => ({ path, tables: list.sort((x, y) => x.name.localeCompare(y.name, 'ru')) }))
}

/* ---------- перетаскивание ссылок ---------- */

export const encodeRef = (pick: RefPick) => JSON.stringify(pick)

const TYPES: ResultType[] = ['item', 'creature', 'kb_page', 'table']
const KINDS: RefKind[] = ['equipment', 'magic_item', 'template', 'catalog', 'room']

export function decodeRef(raw: string): RefPick | null {
  try {
    const v = JSON.parse(raw) as Partial<RefPick>
    if (!v || typeof v.ref_id !== 'string' || !TYPES.includes(v.type as ResultType)) return null
    return {
      type: v.type as RefPick['type'],
      ref_id: v.ref_id,
      ref_kind: v.ref_kind && KINDS.includes(v.ref_kind) ? v.ref_kind : null,
      text: typeof v.text === 'string' ? v.text : '',
      image: typeof v.image === 'string' ? v.image : null,
    }
  } catch {
    return null
  }
}

/** Что пришло перетаскиванием: своя ссылка или страница из дерева базы знаний */
export function refFromDrop(get: (type: string) => string, pageTitle: (id: string) => string | undefined): RefPick | null {
  const own = get(REF_MIME)
  if (own) return decodeRef(own)
  const page = get(KB_PAGE_DRAG)
  return page ? { type: 'kb_page', ref_id: page, ref_kind: null, text: pageTitle(page) ?? '', image: null } : null
}

export const applyRef = (r: TableResult, pick: RefPick): TableResult => ({
  ...r,
  type: pick.type,
  ref_id: pick.ref_id,
  ref_kind: pick.ref_kind,
  text: r.text && r.ref_id === pick.ref_id ? r.text : pick.text || r.text,
  image: pick.image ?? r.image ?? null,
})

/* ---------- журнал ---------- */

function drawText(d: TableDraw): string {
  const parts = d.results.map((r) => {
    const nested = r.nested && 'results' in r.nested ? ` → ${drawText(r.nested)}` : r.nested && 'error' in r.nested ? ` (${r.nested.error})` : ''
    return `${r.text || TYPE_RU[r.type]}${nested}`
  })
  return parts.join(', ') || 'ничего'
}

/** «Сундук (7): Монеты; Пусто» — строка для журнала комнаты */
export function drawnSummary(p: TableDrawn): string {
  const head = `${p.mode === 'gm' ? 'скрыто · ' : ''}«${p.table_name}»`
  const body = p.draws.map((d) => `${d.roll ? `(${d.roll.total}) ` : ''}${drawText(d)}`).join('; ')
  return `${head}: ${body}`
}
