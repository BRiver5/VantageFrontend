/** Где поставить окно шага относительно подсвеченного якоря */
import type { TourPlacement } from './types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const GAP = 14
const MARGIN = 12

const OPPOSITE: Record<Exclude<TourPlacement, 'center'>, Exclude<TourPlacement, 'center'>> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Левый верхний угол окна размера size: у якоря target, иначе по центру экрана */
export function placeDialog(target: Box | null, size: { w: number; h: number }, viewport: { w: number; h: number }, preferred: TourPlacement = 'bottom'): { x: number; y: number } {
  const fit = (x: number, y: number) => ({
    x: clamp(x, MARGIN, Math.max(MARGIN, viewport.w - size.w - MARGIN)),
    y: clamp(y, MARGIN, Math.max(MARGIN, viewport.h - size.h - MARGIN)),
  })
  if (!target) return fit((viewport.w - size.w) / 2, (viewport.h - size.h) / 2)
  if (preferred === 'center') {
    // большой якорь (карта): окно у его нижнего края, чтобы не закрывать середину
    return fit(target.x + (target.w - size.w) / 2, target.y + target.h - size.h - GAP * 2)
  }
  const sides = [preferred, OPPOSITE[preferred], ...(['bottom', 'top', 'right', 'left'] as const).filter((s) => s !== preferred && s !== OPPOSITE[preferred])]
  for (const side of sides) {
    const room =
      side === 'top' ? target.y : side === 'bottom' ? viewport.h - (target.y + target.h) : side === 'left' ? target.x : viewport.w - (target.x + target.w)
    const need = (side === 'top' || side === 'bottom' ? size.h : size.w) + GAP + MARGIN
    if (room < need) continue
    if (side === 'top') return fit(target.x + (target.w - size.w) / 2, target.y - size.h - GAP)
    if (side === 'bottom') return fit(target.x + (target.w - size.w) / 2, target.y + target.h + GAP)
    if (side === 'left') return fit(target.x - size.w - GAP, target.y + (target.h - size.h) / 2)
    return fit(target.x + target.w + GAP, target.y + (target.h - size.h) / 2)
  }
  // места нет ни с одной стороны — поверх якоря у нижнего края экрана
  return fit((viewport.w - size.w) / 2, viewport.h - size.h - MARGIN)
}
