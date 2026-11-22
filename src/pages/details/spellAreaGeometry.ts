/**
 * Область заклинания на сетке 5 фт: какие клетки накрывает «Голод Хадара», конус,
 * линия, куб. Источник — механика заклинания (`mechanics.targeting` / `mechanics.area`),
 * без неё — фраза из дистанции или описания («На себя (15-футовый конус)»).
 *
 * Шаблоны как на столе: сфера из точки — от пересечения линий сетки, аура «на себя» —
 * от клеток заклинателя, конус шириной в собственную длину, линия шириной 5 фт.
 * Цели без области (существо, точка, снаряды) — одна клетка.
 */
import type { Spell } from '../../api'

export type AreaShape = 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation' | 'wall' | 'square' | 'single'

export interface AreaSpec {
  shape: AreaShape
  /** радиус, длина или сторона, фт */
  sizeFt: number
  /** ширина линии/стены, фт */
  widthFt?: number
  /** от заклинателя или из точки в пределах дистанции */
  origin: 'self' | 'point'
}

export interface AreaGrid {
  cols: number
  rows: number
  /** клетки области: «x,y» */
  cells: Set<string>
  /** клетка заклинателя (если он на рисунке) */
  caster: [number, number] | null
  /** точка, из которой исходит сфера, — пересечение линий сетки (в долях клеток) */
  point: [number, number] | null
}

const CELL_FT = 5
/** больше — рисунок теряет смысл, хватит подписи */
export const MAX_GRID = 61

const key = (x: number, y: number) => `${x},${y}`

const SHAPE_WORDS: [RegExp, AreaShape][] = [
  [/радиус|сфер/i, 'sphere'],
  [/конус/i, 'cone'],
  [/куб/i, 'cube'],
  [/лини/i, 'line'],
  [/цилиндр/i, 'cylinder'],
]

/** Фраза «20-футовый радиус» / «15-футовый конус» в тексте */
export function areaFromText(text: string | null | undefined, selfHint: boolean): AreaSpec | null {
  if (!text) return null
  const m = /(\d+)[-\s]?(?:футов[а-яё]*|фт\.?)\s+(радиус[а-яё]*|сфер[а-яё]*|конус[а-яё]*|куб[а-яё]*|лини[а-яё]*|цилиндр[а-яё]*)/i.exec(text)
  if (!m) return null
  const shape = SHAPE_WORDS.find(([re]) => re.test(m[2]))?.[1]
  if (!shape) return null
  return { shape, sizeFt: Number(m[1]), origin: selfHint ? 'self' : 'point' }
}

/** Что рисовать для заклинания */
export function spellAreaSpec(s: Pick<Spell, 'range' | 'description' | 'mechanics'>): AreaSpec {
  const t = s.mechanics?.targeting
  const a = s.mechanics?.area
  const shape = (t?.shape ?? a?.shape) as AreaShape | undefined
  const size = Number(t?.size_ft ?? a?.size_ft ?? 0)
  if (shape && size > 0) {
    const origin = (t?.origin ?? a?.origin) === 'self' || t?.mode === 'area_from_self' ? 'self' : 'point'
    return { shape, sizeFt: size, widthFt: Number(t?.width_ft ?? a?.width_ft ?? 0) || undefined, origin }
  }
  const selfHint = /^\s*на себя/i.test(s.range ?? '')
  return areaFromText(s.range, selfHint) ?? (s.mechanics ? null : areaFromText(s.description, selfHint)) ?? { shape: 'single', sizeFt: CELL_FT, origin: 'point' }
}

/** Клетки шаблона на сетке */
export function areaGrid(spec: AreaSpec): AreaGrid {
  const n = Math.max(1, Math.round(spec.sizeFt / CELL_FT))
  const cells = new Set<string>()
  switch (spec.shape) {
    case 'sphere':
    case 'cylinder':
    case 'emanation': {
      if (spec.origin === 'self' || spec.shape === 'emanation') {
        // аура: клетки, чей центр не дальше радиуса от края клетки заклинателя
        const size = 2 * n + 3
        const c = (size - 1) / 2
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            if (x === c && y === c) continue
            if (Math.hypot(x - c, y - c) <= n + 0.5) cells.add(key(x, y))
          }
        return { cols: size, rows: size, cells, caster: [c, c], point: null }
      }
      // из точки: от пересечения линий сетки
      const size = 2 * n + 2
      const p = size / 2
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) if (Math.hypot(x + 0.5 - p, y + 0.5 - p) <= n) cells.add(key(x, y))
      return { cols: size, rows: size, cells, caster: null, point: [p, p] }
    }
    case 'cone': {
      // заклинатель слева, конус вправо; ширина конуса равна его длине
      const rows = n % 2 === 0 ? n + 3 : n + 2
      const cy = (rows - 1) / 2
      const cols = n + 2
      const ax = 1
      const ay = cy + 0.5
      for (let y = 0; y < rows; y++)
        for (let x = 1; x < cols; x++) {
          const dx = x + 0.5 - ax
          const dy = y + 0.5 - ay
          if (dx > 0 && dx <= n + 1e-9 && Math.abs(dy) <= dx / 2 + 1e-9) cells.add(key(x, y))
        }
      return { cols, rows, cells, caster: [0, cy], point: null }
    }
    case 'line':
    case 'wall': {
      const w = Math.max(1, Math.round((spec.widthFt ?? CELL_FT) / CELL_FT))
      const rows = w + 2
      const top = 1
      const self = spec.shape === 'line' && spec.origin === 'self'
      const start = self ? 1 : 0
      const cols = n + start + (self ? 0 : 0)
      for (let y = top; y < top + w; y++) for (let x = start; x < start + n; x++) cells.add(key(x, y))
      const cy = top + Math.floor((w - 1) / 2)
      return { cols: Math.max(cols, 1), rows, cells, caster: self ? [0, cy] : null, point: null }
    }
    case 'cube':
    case 'square': {
      if (spec.origin === 'self') {
        // куб примыкает к заклинателю
        const rows = n + 2
        const cy = Math.floor((rows - 1) / 2)
        const top = cy - Math.floor((n - 1) / 2)
        for (let y = top; y < top + n; y++) for (let x = 1; x <= n; x++) cells.add(key(x, y))
        return { cols: n + 2, rows, cells, caster: [0, cy], point: null }
      }
      const size = n + 2
      for (let y = 1; y <= n; y++) for (let x = 1; x <= n; x++) cells.add(key(x, y))
      return { cols: size, rows: size, cells, caster: null, point: null }
    }
    default: {
      // одна цель — одна клетка
      cells.add(key(1, 1))
      return { cols: 3, rows: 3, cells, caster: null, point: null }
    }
  }
}

const SHAPE_RU: Record<AreaShape, string> = {
  sphere: 'Сфера',
  cylinder: 'Цилиндр',
  emanation: 'Аура',
  cone: 'Конус',
  line: 'Линия',
  wall: 'Стена',
  cube: 'Куб',
  square: 'Квадрат',
  single: 'Одна цель',
}

/** Подпись: «Сфера · радиус 20 фт · 4 клетки» */
export function areaCaption(spec: AreaSpec): string {
  if (spec.shape === 'single') return 'Одна цель · 1 клетка'
  const cells = Math.round(spec.sizeFt / CELL_FT)
  const word = cells % 10 === 1 && cells % 100 !== 11 ? 'клетка' : [2, 3, 4].includes(cells % 10) && ![12, 13, 14].includes(cells % 100) ? 'клетки' : 'клеток'
  const measure =
    spec.shape === 'sphere' || spec.shape === 'cylinder' || spec.shape === 'emanation'
      ? 'радиус'
      : spec.shape === 'cube' || spec.shape === 'square'
        ? 'сторона'
        : 'длина'
  const shape = spec.shape === 'sphere' && spec.origin === 'self' ? 'Аура' : SHAPE_RU[spec.shape]
  const width = (spec.shape === 'line' || spec.shape === 'wall') && spec.widthFt && spec.widthFt !== CELL_FT ? ` · ширина ${spec.widthFt} фт` : ''
  return `${shape} · ${measure} ${spec.sizeFt} фт · ${cells} ${word}${width}${spec.origin === 'self' ? ' · от заклинателя' : ''}`
}

/**
 * Нужен ли рисунок: заклинание «на себя» или «касание» без области — это одна клетка,
 * и сетка ничего не добавляет к дистанции.
 */
export function showSpellArea(s: Pick<Spell, 'range' | 'description' | 'mechanics'>): boolean {
  if (spellAreaSpec(s).shape !== 'single') return true
  const kind = s.mechanics?.range?.kind
  if (kind === 'self' || kind === 'touch') return false
  return !/^\s*(?:на себя|касани)/i.test(s.range ?? '')
}
