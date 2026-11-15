/**
 * Ловушка фокуса для модального окна: Tab и Shift+Tab ходят по кругу внутри,
 * при открытии фокус переходит в окно, при закрытии — возвращается туда,
 * где был.
 */
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.getClientRects().length > 0)
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const root = ref.current
    if (!active || !root) return
    const before = document.activeElement as HTMLElement | null
    if (!root.contains(document.activeElement)) (root.querySelector<HTMLElement>('[data-autofocus]') ?? focusablesIn(root)[0] ?? root).focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = focusablesIn(root)
      if (!list.length) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const cur = document.activeElement
      if (e.shiftKey && (cur === first || !root.contains(cur))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (cur === last || !root.contains(cur))) {
        e.preventDefault()
        first.focus()
      }
    }
    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('keydown', onKey)
      if (before && document.contains(before)) before.focus()
    }
  }, [ref, active])
}
