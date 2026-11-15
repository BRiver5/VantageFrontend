/** Работа туров со страницей: поиск якорей, действия «до шага», где мы сейчас */
import { at } from './content'
import type { TourAction, TourContextId } from './types'

/** Первый видимый элемент по селектору; кривой селектор — просто null */
export function query(selector: string): HTMLElement | null {
  let list: NodeListOf<HTMLElement>
  try {
    list = document.querySelectorAll<HTMLElement>(selector)
  } catch {
    return null
  }
  for (const el of list) if (el.getClientRects().length > 0) return el
  return null
}

/** Ждать якорь: после действия «до шага» React дорисовывает створку не сразу */
export function waitForElement(selector: string, timeoutMs: number, cancelled: () => boolean): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const poll = () => {
      if (cancelled()) return resolve(null)
      const el = query(selector)
      if (el || Date.now() - started >= timeoutMs) return resolve(el)
      setTimeout(poll, 80)
    }
    poll()
  })
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runActions(actions: TourAction[], navigate: (to: string) => void): Promise<void> {
  for (const action of actions) {
    if ('navigate' in action) {
      if (location.pathname !== action.navigate) navigate(action.navigate)
      await pause(120)
      continue
    }
    if (action.unless && query(action.unless)) continue
    const el = query(action.click)
    if (!el) continue
    el.click()
    await pause(60)
  }
}

export const isRoomPath = (path: string): boolean => /^\/rooms\/(?!join\/)[^/]+\/?$/.test(path)

/** Подходит ли текущий экран туру */
export function contextReady(context: TourContextId, path: string): boolean {
  if (context === 'site') return !isRoomPath(path)
  if (!isRoomPath(path) || !query(at('room-topbar'))) return false
  return context === 'room' || !!query(at('gm-screen'))
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Прокрутить к якорю, только если он не виден целиком */
export function revealElement(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  const inView = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
  if (inView || r.height > window.innerHeight) return
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
