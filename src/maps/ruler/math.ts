/**
 * Линейка: расстояния по правилам сетки, как считает сервер
 * (app/maps/geometry.py, grid_distance_ft). Квадрат: диагональ 5 футов или
 * чередование «5-10» через весь путь. Перепад высоты — ещё одна ось той же
 * метрики. Точки — клетки и высота.
 *
 * Сетка «hex» хранится, но сервер (движение, дистанции, области) и рисование
 * считают любую сетку квадратной — линейка тоже, чтобы цифры совпадали.
 */
import type { BattleMap, MapGrid } from '../types'

export type Cell = [number, number]

export interface RulerPoint {
  cell: Cell
  /** высота точки в футах (пол клетки плюс подъём) */
  elevation: number
}

export interface RulerSegment {
  from: RulerPoint
  to: RulerPoint
  /** длина отрезка в футах */
  ft: number
  /** накопленная длина к концу отрезка */
  total: number
}

/** Округление как у Python round: половина — к чётному (сервер округляет высоту так же) */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x)
  const d = x - f
  if (Math.abs(d - 0.5) > 1e-9) return Math.round(x)
  return f % 2 === 0 ? f : f + 1
}

/**
 * Один отрезок. parity — сколько диагоналей «5-10» уже было (нечётно — следующая стоит 10).
 * Возвращает футы и новую чётность.
 */
export function segmentFt(a: Cell, b: Cell, dzFt: number, grid: Pick<MapGrid, 'feet_per_cell' | 'diagonal'>, parity = 0): { ft: number; parity: number } {
  const fpc = grid.feet_per_cell || 5
  const dz = roundHalfEven(Math.abs(dzFt) / fpc)
  const steps = [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), dz].sort((x, y) => y - x)
  if (grid.diagonal === '5-10') {
    const diag = steps[1]
    return { ft: (steps[0] + Math.floor((diag + parity) / 2)) * fpc, parity: (parity + diag) % 2 }
  }
  return { ft: steps[0] * fpc, parity }
}

/** Отрезки и итог по точкам; чередование «5-10» идёт через весь путь */
export function measure(points: RulerPoint[], grid: Pick<MapGrid, 'feet_per_cell' | 'diagonal'>): { segments: RulerSegment[]; total: number } {
  const segments: RulerSegment[] = []
  let total = 0
  let parity = 0
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    const s = segmentFt(from.cell, to.cell, to.elevation - from.elevation, grid, parity)
    parity = s.parity
    total += s.ft
    segments.push({ from, to, ft: s.ft, total })
  }
  return { segments, total }
}

const same = (a: RulerPoint, b: RulerPoint) => a.cell[0] === b.cell[0] && a.cell[1] === b.cell[1] && a.elevation === b.elevation

/** Добавить точку; повтор последней не добавляется */
export function addWaypoint(list: RulerPoint[], p: RulerPoint): RulerPoint[] {
  const last = list[list.length - 1]
  return last && same(last, p) ? list : [...list, p]
}

/** Убрать последнюю точку; начало линейки остаётся */
export const removeWaypoint = (list: RulerPoint[]): RulerPoint[] => (list.length > 1 ? list.slice(0, -1) : list)

/** Шаг высоты: шаг сетки, с fine — 1 фут. dir: +1 вверх, −1 вниз */
export const elevationStep = (grid: Pick<MapGrid, 'feet_per_cell'>, dir: 1 | -1, fine: boolean) => dir * (fine ? 1 : grid.feet_per_cell || 5)

/** Высота пола клетки: рельеф карты */
export const floorAt = (map: Pick<BattleMap, 'terrain'>, [c, r]: Cell) => map.terrain?.elevation?.[`${c},${r}`] ?? 0

/** «35 фт.», «7,5 фт.» */
export const feet = (ft: number) => `${String(Math.round(ft * 10) / 10).replace('.', ',')} фт.`

/** Подпись высоты: «↑10 фт.» — только если не на полу */
export const heightLabel = (elevation: number, floor: number) => (Math.abs(elevation - floor) < 0.01 ? '' : `${elevation > floor ? '↑' : '↓'}${feet(Math.abs(elevation - floor))}`)
