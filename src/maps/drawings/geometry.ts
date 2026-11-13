/**
 * Геометрия рисунков: прямоугольник по двум углам, черновик многоугольника,
 * сглаживание линии от руки (упрощение Рамера — Дугласа — Пекера, затем
 * срезание углов Чайкина), рамка и попадание курсором. Чистые функции.
 */
import type { Pt } from '../types'
import type { MapDrawing } from '../layers/types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** прямоугольник по двум углам; square — квадрат (Shift) */
export function rectFrom(a: Pt, b: Pt, square = false): Box {
  let w = b.x - a.x
  let h = b.y - a.y
  if (square) {
    const s = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * s
    h = Math.sign(h || 1) * s
  }
  return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) }
}

const near = (a: Pt, b: Pt, eps: number) => Math.hypot(a.x - b.x, a.y - b.y) <= eps

/** черновик многоугольника: точка добавляется, если она не повтор последней */
export function polygonAdd(points: readonly Pt[], p: Pt, eps = 2): Pt[] {
  const last = points[points.length - 1]
  return last && near(last, p, eps) ? [...points] : [...points, p]
}

/** правый клик: убрать последнюю точку */
export const polygonUndo = (points: readonly Pt[]): Pt[] => points.slice(0, -1)

/**
 * Закончить многоугольник: убрать подряд идущие повторы и точку,
 * совпавшую с первой (замыкание кликом в начало). null — меньше трёх точек
 * или нулевая площадь.
 */
export function polygonFinish(points: readonly Pt[], eps = 2): Pt[] | null {
  const out: Pt[] = []
  for (const p of points) if (!out.length || !near(out[out.length - 1], p, eps)) out.push(p)
  while (out.length > 1 && near(out[0], out[out.length - 1], eps)) out.pop()
  if (out.length < 3 || Math.abs(polygonArea(out)) < 1) return null
  return out
}

/** площадь со знаком (формула шнурка) */
export function polygonArea(points: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** расстояние от точки до отрезка */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** упрощение ломаной: точки ближе tolerance к хорде выбрасываются */
export function simplify(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return [...points]
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    let best = -1
    let far = tolerance
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(points[k], points[i], points[j])
      if (d > far) {
        far = d
        best = k
      }
    }
    if (best >= 0) {
      keep[best] = 1
      stack.push([i, best], [best, j])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** срезание углов Чайкина: концы остаются на месте */
export function chaikin(points: readonly Pt[], iterations = 2): Pt[] {
  let pts = [...points]
  for (let n = 0; n < iterations && pts.length > 2; n++) {
    const next: Pt[] = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

/** сгладить линию от руки: дрожь руки уходит, форма остаётся; координаты округляются до 0.1 px */
export function smoothStroke(points: readonly Pt[], tolerance = 1.5, iterations = 2, maxPoints = 4000): Pt[] {
  const round = (p: Pt) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })
  let out = chaikin(simplify(points, tolerance), iterations).map(round)
  // слишком длинная линия: грубее, пока не уложится в предел сервера
  let tol = tolerance
  while (out.length > maxPoints && tol < 1000) {
    tol *= 2
    out = chaikin(simplify(points, tol), iterations).map(round)
  }
  return out
}

/** примерный размер текста (без холста): ширина символа ~0.6 кегля */
export function textBox(text: string, fontSize: number): { w: number; h: number } {
  const lines = text.split('\n')
  return { w: Math.max(...lines.map((l) => l.length), 1) * fontSize * 0.6, h: lines.length * fontSize * 1.2 }
}

/** рамка рисунка */
export function drawingBounds(d: Pick<MapDrawing, 'kind' | 'x' | 'y' | 'w' | 'h' | 'points'>): Box {
  if (d.kind === 'polygon' || d.kind === 'freehand') {
    if (!d.points.length) return { x: d.x, y: d.y, w: 0, h: 0 }
    const xs = d.points.map((p) => p.x)
    const ys = d.points.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  return { x: d.x, y: d.y, w: d.w, h: d.h }
}

/** попадание курсором в рисунок: по контуру (tol) или внутри залитой фигуры и текста */
export function hitDrawing(d: MapDrawing, p: Pt, tol: number): boolean {
  const t = tol + d.stroke_width / 2
  const b = drawingBounds(d)
  if (p.x < b.x - t || p.x > b.x + b.w + t || p.y < b.y - t || p.y > b.y + b.h + t) return false
  const filled = d.fill === 'solid'
  switch (d.kind) {
    case 'text':
      return true
    case 'rect': {
      if (filled) return true
      const c: Pt[] = [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ]
      return c.some((a, i) => distToSegment(p, a, c[(i + 1) % 4]) <= t)
    }
    case 'ellipse': {
      const rx = b.w / 2
      const ry = b.h / 2
      if (rx <= 0 || ry <= 0) return false
      const r = Math.hypot((p.x - (b.x + rx)) / rx, (p.y - (b.y + ry)) / ry)
      return filled ? r <= 1 + t / Math.min(rx, ry) : Math.abs(r - 1) * Math.min(rx, ry) <= t
    }
    case 'polygon':
      if (filled && pointInPolygon(p, d.points)) return true
      return d.points.some((a, i) => distToSegment(p, a, d.points[(i + 1) % d.points.length]) <= t)
    case 'freehand':
      return d.points.some((a, i) => i > 0 && distToSegment(p, d.points[i - 1], a) <= t)
  }
}

/** верхний рисунок под курсором */
export function drawingAt(list: readonly MapDrawing[], p: Pt, tol: number): MapDrawing | null {
  for (let i = list.length - 1; i >= 0; i--) if (hitDrawing(list[i], p, tol)) return list[i]
  return null
}

/** сдвинуть рисунок */
export function moveDrawing(d: Pick<MapDrawing, 'x' | 'y' | 'points'>, dx: number, dy: number): Pick<MapDrawing, 'x' | 'y' | 'points'> {
  return { x: d.x + dx, y: d.y + dy, points: d.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
}

/** новый z: поверх всех или под всеми */
export function zFor(list: readonly { z: number }[], dir: 'front' | 'back'): number {
  if (!list.length) return 0
  const zs = list.map((d) => d.z)
  return dir === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
}
