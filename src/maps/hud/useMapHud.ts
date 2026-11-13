/**
 * Жесты панели жетона и целей поверх обработчика карты (MapField):
 * - правая кнопка по жетону — панель; двойной правый клик — карточка;
 * - на телефоне долгое нажатие на жетон — панель;
 * - Shift + клик по жетону — цель; Shift + протянуть по пустому (дальше порога) —
 *   рамка целей; Shift + клик по пустому без протягивания уходит в onEmptyShiftClick
 *   (у мастера там пинг «сюда»). Alt + клик не трогаем: это пинг «внимание».
 * - T — цель под курсором, Shift+T — снять все.
 * handle() возвращает true, если жест наш и карте его обрабатывать не нужно;
 * undefined — пусть карта делает своё.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useKeybinding } from '../../input/useKeybinding'
import type { BattleMap, MapToken, Pt } from '../types'
import { targetStore, tokensInBox, useTargets } from './targets'

export interface HudAnchor {
  tokenId: string
  /** где открыть панель: точка внутри поля карты, CSS-пиксели */
  x: number
  y: number
}

const LONG_PRESS_MS = 520
/** сколько экранных пикселей протянуть, чтобы Shift + нажатие стало рамкой */
const BOX_DRAG_PX = 6
const DOUBLE_MS = 380

/** набираем текст — горячие клавиши карты молчат */
const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')

export function useMapHud({
  map,
  isDm,
  tokenAt,
  onOpenCard,
  onTakeOver,
  onEmptyShiftClick,
}: {
  map: BattleMap | null
  isDm: boolean
  tokenAt: (p: Pt) => MapToken | undefined
  /** двойной правый клик: карточка или настройки жетона */
  onOpenCard?: (t: MapToken) => void
  /** панель открылась долгим нажатием: карта должна забыть начатое перетаскивание и пинг */
  onTakeOver?: () => void
  /** Shift + клик по пустому месту без протягивания */
  onEmptyShiftClick?: (p: Pt, e: RPointerEvent) => void
}) {
  const targets = useTargets()
  const [hud, setHud] = useState<HudAnchor | null>(null)
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null)
  const hover = useRef<string | null>(null)
  const lastRight = useRef<{ id: string; at: number } | null>(null)
  const long = useRef<{ timer: ReturnType<typeof setTimeout>; cx: number; cy: number } | null>(null)
  const swallow = useRef(false)
  /** Shift + нажатие по пустому: рамка начнётся, только если протянуть */
  const pendingBox = useRef<{ a: Pt; cx: number; cy: number } | null>(null)

  // жетон пропал с карты (или карту сменили) — цель и панель уходят вместе с ним
  const ids = map?.tokens.map((t) => t.id).join(',') ?? ''
  useEffect(() => {
    const alive = ids ? ids.split(',') : []
    targetStore.prune(alive)
    setHud((h) => (h && alive.includes(h.tokenId) ? h : null))
  }, [ids])
  useEffect(() => () => clearTimeout(long.current?.timer), [])

  const anchorOf = (e: RPointerEvent, id: string): HudAnchor => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { tokenId: id, x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const cancelLong = () => {
    clearTimeout(long.current?.timer)
    long.current = null
  }

  const handle = (kind: 'down' | 'move' | 'up', p: Pt, e: RPointerEvent): true | undefined => {
    if (!map) return undefined
    if (kind === 'down') {
      cancelLong()
      swallow.current = false
      pendingBox.current = null
      if (e.altKey) return undefined
      const t = tokenAt(p)
      if (e.button === 2) {
        if (!t) {
          setHud(null)
          return undefined
        }
        const now = performance.now()
        const prev = lastRight.current
        lastRight.current = { id: t.id, at: now }
        if (prev && prev.id === t.id && now - prev.at < DOUBLE_MS && onOpenCard) {
          lastRight.current = null
          setHud(null)
          onOpenCard(t)
          swallow.current = true
          return true
        }
        setHud(anchorOf(e, t.id))
        swallow.current = true
        return true
      }
      if (e.button !== 0) return undefined
      if (e.shiftKey) {
        if (t) targetStore.toggle(t.id)
        else pendingBox.current = { a: p, cx: e.clientX, cy: e.clientY }
        // нажатие наше: камера не едет, карта клик не обрабатывает
        swallow.current = true
        return true
      }
      if (hud) setHud(null)
      if (t && e.pointerType !== 'mouse') {
        const anchor = anchorOf(e, t.id)
        long.current = {
          cx: e.clientX,
          cy: e.clientY,
          timer: setTimeout(() => {
            long.current = null
            swallow.current = true
            onTakeOver?.()
            if (navigator.vibrate) navigator.vibrate(8)
            setHud(anchor)
          }, LONG_PRESS_MS),
        }
      }
      return undefined
    }
    if (kind === 'move') {
      hover.current = tokenAt(p)?.id ?? null
      if (long.current && Math.hypot(e.clientX - long.current.cx, e.clientY - long.current.cy) > 8) cancelLong()
      const pb = pendingBox.current
      if (pb && Math.hypot(e.clientX - pb.cx, e.clientY - pb.cy) > BOX_DRAG_PX) {
        pendingBox.current = null
        setBox({ a: pb.a, b: p })
        return true
      }
      if (box) {
        setBox({ a: box.a, b: p })
        return true
      }
      return swallow.current ? true : undefined
    }
    // up
    cancelLong()
    const pb = pendingBox.current
    pendingBox.current = null
    if (pb && !box) {
      swallow.current = false
      onEmptyShiftClick?.(pb.a, e)
      return true
    }
    if (box) {
      const b = { a: box.a, b: p }
      setBox(null)
      swallow.current = false
      targetStore.add(tokensInBox(map.tokens, b.a, b.b, isDm))
      return true
    }
    if (swallow.current) {
      swallow.current = false
      return true
    }
    return undefined
  }

  useKeybinding('map.target.toggle', (e) => {
    if (typing(e) || !hover.current) return
    e.preventDefault()
    targetStore.toggle(hover.current)
  }, !!map)
  useKeybinding('map.target.clear', (e) => {
    if (typing(e) || !targets.length) return
    e.preventDefault()
    targetStore.clear()
  }, !!map)

  const leave = useCallback(() => {
    hover.current = null
    cancelLong()
  }, [])

  /** короткое касание после долгого нажатия: карта не должна открывать карточку */
  const tookTap = () => {
    const was = swallow.current
    swallow.current = false
    return was
  }

  return { hud, closeHud: useCallback(() => setHud(null), []), box, targets, handle, leave, tookTap }
}
