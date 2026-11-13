/**
 * Реестр горячих клавиш: действия с подписью и сочетаниями по умолчанию,
 * пользовательские переназначения в localStorage.
 *
 * Сочетание пишем строкой: 'Ctrl+Z', 'Ctrl+Shift+Z', 'Escape', 'Delete', '/'.
 * Ctrl означает и Ctrl, и ⌘ на маке. Клавиша сравнивается по e.key без учёта
 * регистра. Shift у одиночных знаков препинания ('/', '?') не учитывается:
 * на разных раскладках они набираются по-разному.
 *
 * Обычно лишний модификатор мешает: 'Ctrl+Z' не сработает на Ctrl+Shift+Z.
 * У действий с `loose` лишние модификаторы не мешают — так вели себя
 * обработчики, написанные до реестра (Escape закрывал окно и с зажатым Shift).
 */

export type KeyCategory = 'general' | 'text' | 'create' | 'kb' | 'map-editor' | 'map-ruler'

export const CATEGORY_LABELS: Record<KeyCategory, string> = {
  general: 'Общее',
  text: 'Ввод текста',
  create: 'Создание персонажа',
  kb: 'База знаний',
  'map-editor': 'Редактор карт',
  'map-ruler': 'Линейка и ход по карте',
}

export interface KeyAction {
  id: string
  label: string
  category: KeyCategory
  defaults: readonly string[]
  /** лишние модификаторы не мешают срабатыванию */
  loose?: boolean
}

export const ACTIONS = [
  { id: 'dialog.close', label: 'Закрыть окно или меню', category: 'general', defaults: ['Escape'], loose: true },
  { id: 'search.open', label: 'Открыть поиск', category: 'general', defaults: ['Ctrl+K'], loose: true },
  { id: 'search.quick', label: 'Открыть поиск вне поля ввода', category: 'general', defaults: ['/'] },

  { id: 'review.send', label: 'Отправить отзыв', category: 'text', defaults: ['Ctrl+Enter'], loose: true },
  { id: 'chat.send', label: 'Отправить сообщение в чат', category: 'text', defaults: ['Enter'] },

  { id: 'celebration.next', label: 'Следующее поздравление', category: 'create', defaults: ['Enter', 'Space'], loose: true },
  { id: 'celebration.skip', label: 'Пропустить все поздравления', category: 'create', defaults: ['Escape'], loose: true },

  { id: 'kb.bold', label: 'Жирный', category: 'kb', defaults: ['Ctrl+B'], loose: true },
  { id: 'kb.italic', label: 'Курсив', category: 'kb', defaults: ['Ctrl+I'], loose: true },
  { id: 'kb.link', label: 'Ссылка на страницу', category: 'kb', defaults: ['Ctrl+K'], loose: true },

  { id: 'map.undo', label: 'Отменить', category: 'map-editor', defaults: ['Ctrl+Z'] },
  { id: 'map.redo', label: 'Повторить', category: 'map-editor', defaults: ['Ctrl+Shift+Z'] },
  { id: 'map.duplicate', label: 'Копия выбранного', category: 'map-editor', defaults: ['Ctrl+D'] },
  { id: 'map.cancel', label: 'Сбросить черновик или выбор', category: 'map-editor', defaults: ['Escape'] },
  { id: 'map.finish', label: 'Завершить фигуру', category: 'map-editor', defaults: ['Enter'] },
  { id: 'map.delete', label: 'Удалить выбранное', category: 'map-editor', defaults: ['Delete', 'Backspace'] },
  { id: 'map.tool.select', label: 'Инструмент: выбор', category: 'map-editor', defaults: ['V'] },
  { id: 'map.tool.wall', label: 'Инструмент: стена', category: 'map-editor', defaults: ['W'] },
  { id: 'map.tool.door', label: 'Инструмент: дверь', category: 'map-editor', defaults: ['D'] },
  { id: 'map.tool.window', label: 'Инструмент: окно', category: 'map-editor', defaults: ['N'] },
  { id: 'map.tool.light', label: 'Инструмент: свет', category: 'map-editor', defaults: ['L'] },
  { id: 'map.tool.token', label: 'Инструмент: фишка', category: 'map-editor', defaults: ['T'] },
  { id: 'map.tool.asset', label: 'Инструмент: объект', category: 'map-editor', defaults: ['O'] },
  { id: 'map.tool.terrain', label: 'Инструмент: рельеф', category: 'map-editor', defaults: ['H'] },
  { id: 'map.tool.zone', label: 'Инструмент: зона', category: 'map-editor', defaults: ['Z'] },
  { id: 'map.tool.item', label: 'Инструмент: предмет', category: 'map-editor', defaults: ['I'] },

  // игровой стол: пауза (только мастер, не в поле ввода)
  { id: 'room.pause', label: 'Пауза игры (мастер)', category: 'general', defaults: ['Space'] },
  // линейка и перетаскивание жетона на столе
  { id: 'ruler.toggle', label: 'Линейка: включить или выключить', category: 'map-ruler', defaults: ['R'] },
  { id: 'ruler.waypoint', label: 'Линейка и ход: точка под курсором', category: 'map-ruler', defaults: ['F'] },
  { id: 'ruler.unwaypoint', label: 'Линейка и ход: убрать последнюю точку', category: 'map-ruler', defaults: ['Alt+F'] },
  { id: 'ruler.up', label: 'Высота следующей точки: выше на клетку', category: 'map-ruler', defaults: ['E'] },
  { id: 'ruler.down', label: 'Высота следующей точки: ниже на клетку', category: 'map-ruler', defaults: ['Q'] },
  { id: 'ruler.upFine', label: 'Высота следующей точки: выше на 1 фут', category: 'map-ruler', defaults: ['Shift+E'] },
  { id: 'ruler.downFine', label: 'Высота следующей точки: ниже на 1 фут', category: 'map-ruler', defaults: ['Shift+Q'] },
  { id: 'ruler.cancel', label: 'Линейка: сбросить', category: 'map-ruler', defaults: ['Escape'] },
] as const satisfies readonly KeyAction[]

export type ActionId = (typeof ACTIONS)[number]['id']

const BY_ID = new Map<string, KeyAction>(ACTIONS.map((a) => [a.id, a]))

export const getAction = (id: ActionId): KeyAction => BY_ID.get(id)!

/* ---------- разбор сочетаний ---------- */

export interface Combo {
  ctrl: boolean
  shift: boolean
  alt: boolean
  /** e.key в нижнем регистре; пробел — ' ' */
  key: string
}

/** То, что нужно от события: подходит и DOM KeyboardEvent, и React-событие */
export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  spacebar: ' ',
  del: 'delete',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
}

const normKey = (k: string) => {
  const low = k.toLowerCase()
  return KEY_ALIASES[low] ?? low
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'os'])

export function parseCombo(text: string): Combo | null {
  const raw = text.trim()
  if (!raw) return null
  // 'Ctrl++' — сама клавиша «плюс»
  const parts = raw.endsWith('++') ? [...raw.slice(0, -2).split('+'), '+'] : raw.split('+')
  const combo: Combo = { ctrl: false, shift: false, alt: false, key: '' }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim()
    const low = p.toLowerCase()
    if (i < parts.length - 1) {
      if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'meta' || low === 'mod') combo.ctrl = true
      else if (low === 'shift') combo.shift = true
      else if (low === 'alt' || low === 'option') combo.alt = true
      else return null
    } else {
      if (!p) return null
      combo.key = normKey(p)
    }
  }
  if (MODIFIER_KEYS.has(combo.key)) return null
  return combo
}

const KEY_NAMES: Record<string, string> = { ' ': 'Space' }

export function formatCombo(c: Combo): string {
  const key = KEY_NAMES[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key[0].toUpperCase() + c.key.slice(1))
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', key].filter(Boolean).join('+')
}

/** Привести запись к виду 'Ctrl+Shift+Z'; null — запись не разобрать */
export const normalizeCombo = (text: string): string | null => {
  const c = parseCombo(text)
  return c ? formatCombo(c) : null
}

/** Сочетание из нажатия — для окна переназначения; null, пока нажат только модификатор */
export function comboFromEvent(e: KeyLike): string | null {
  const key = normKey(e.key)
  if (MODIFIER_KEYS.has(key)) return null
  return formatCombo({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey, key })
}

/** Одиночный знак, не буква и не цифра: его Shift зависит от раскладки */
const isSymbol = (k: string) => k.length === 1 && k !== ' ' && !/[\p{L}\p{N}]/u.test(k)

export function comboMatches(e: KeyLike, c: Combo, loose = false): boolean {
  if (normKey(e.key) !== c.key) return false
  const ctrl = e.ctrlKey || e.metaKey
  if (c.ctrl && !ctrl) return false
  if (c.alt && !e.altKey) return false
  if (c.shift && !e.shiftKey) return false
  if (loose) return true
  if (!c.ctrl && ctrl) return false
  if (!c.alt && e.altKey) return false
  if (!c.shift && e.shiftKey && !isSymbol(c.key)) return false
  return true
}

/* ---------- переназначения ---------- */

export const STORAGE_KEY = 'vantage.keybindings.v1'

type Overrides = Partial<Record<ActionId, string[]>>

let overrides: Overrides | null = null

function readStorage(): Overrides {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return {}
  }
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const out: Overrides = {}
    for (const [id, list] of Object.entries(data)) {
      if (!BY_ID.has(id) || !Array.isArray(list)) continue
      out[id as ActionId] = list.filter((x): x is string => typeof x === 'string').map(normalizeCombo).filter((x): x is string => !!x)
    }
    return out
  } catch {
    return {}
  }
}

function writeStorage(o: Overrides) {
  try {
    if (Object.keys(o).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(o))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // приватный режим или запрет хранилища: переназначения живут до перезагрузки
  }
}

const current = (): Overrides => (overrides ??= readStorage())

/** Перечитать переназначения из хранилища (например, по событию storage из другой вкладки) */
export function loadOverrides(): void {
  overrides = readStorage()
}

/** Действующие сочетания действия */
export function combosOf(id: ActionId): readonly string[] {
  return current()[id] ?? getAction(id).defaults
}

export const isOverridden = (id: ActionId): boolean => current()[id] !== undefined

/** Назначить сочетания; пустой список — действие без клавиш. Совпало с умолчанием — переназначение снимается */
export function setCombos(id: ActionId, combos: readonly string[]): void {
  const list = [...new Set(combos.map(normalizeCombo).filter((x): x is string => !!x))]
  const next = { ...current() }
  const defaults = getAction(id).defaults.map(normalizeCombo)
  if (list.length === defaults.length && list.every((c, i) => c === defaults[i])) delete next[id]
  else next[id] = list
  overrides = next
  writeStorage(next)
}

/** Вернуть умолчания: одному действию или всем */
export function reset(id?: ActionId): void {
  const next = { ...current() }
  if (id) delete next[id]
  else for (const k of Object.keys(next)) delete next[k as ActionId]
  overrides = next
  writeStorage(next)
}

/** Нажатие подходит действию */
export function matches(e: KeyLike, id: ActionId): boolean {
  const action = BY_ID.get(id)
  if (!action) return false
  for (const text of combosOf(id)) {
    const c = parseCombo(text)
    if (c && comboMatches(e, c, action.loose)) return true
  }
  return false
}

export interface Conflict {
  combo: string
  a: ActionId
  b: ActionId
}

/**
 * Пары действий одного раздела с общим сочетанием. Разделы работают в разных
 * местах (редактор карт, база знаний), поэтому между ними пересечения не считаем.
 */
export function conflicts(): Conflict[] {
  const seen = new Map<string, ActionId[]>()
  const out: Conflict[] = []
  for (const a of ACTIONS) {
    for (const text of combosOf(a.id)) {
      const combo = normalizeCombo(text)
      if (!combo) continue
      const key = `${a.category}|${combo}`
      const prev = seen.get(key) ?? []
      for (const b of prev) if (b !== a.id) out.push({ combo, a: b, b: a.id })
      if (!prev.includes(a.id)) seen.set(key, [...prev, a.id])
    }
  }
  return out
}
