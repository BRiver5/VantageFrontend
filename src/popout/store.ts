/**
 * Окна «вынести в окно»: лист героя, статья, карта. Окно открывается прямо в
 * обработчике клика (иначе браузер сочтёт его навязчивым и заблокирует), а
 * содержимое рисует тот же React — порталом в документ нового окна.
 */
import { useSyncExternalStore } from 'react'

export type PopoutKind = 'sheet' | 'article' | 'map'

export interface PopoutEntry {
  key: string
  kind: PopoutKind
  id: string
  title: string
  win: Window
  /** окно закрыли руками: вернуть содержимое на место */
  onReturn?: () => void
}

export const POPUP_BLOCKED =
  'Браузер не дал открыть окно. Разрешите всплывающие окна для этого сайта (значок в адресной строке) и нажмите ещё раз.'

let entries: PopoutEntry[] = []
let notice: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const popoutKey = (kind: PopoutKind, id: string) => `${kind}:${id}`

const SIZE: Record<PopoutKind, [number, number]> = { sheet: [1100, 860], article: [760, 860], map: [1200, 820] }

/** Открыть окно; false — его заблокировал браузер (сообщение — в popoutNotice) */
export function openPopout(kind: PopoutKind, id: string, title: string, onReturn?: () => void): boolean {
  const key = popoutKey(kind, id)
  const had = entries.find((e) => e.key === key)
  if (had && !had.win.closed) {
    had.win.focus()
    return true
  }
  const [w, h] = SIZE[kind]
  let win: Window | null = null
  try {
    win = window.open('', `vantage-${kind}-${id}`, `popup=yes,width=${w},height=${h}`)
  } catch {
    win = null
  }
  if (!win) {
    notice = POPUP_BLOCKED
    emit()
    return false
  }
  notice = null
  entries = [...entries.filter((e) => e.key !== key), { key, kind, id, title, win, onReturn }]
  emit()
  return true
}

/** Закрыть окно. byUser — его закрыли руками: содержимое возвращается на место */
export function closePopout(key: string, byUser = false): void {
  const entry = entries.find((e) => e.key === key)
  if (!entry) return
  entries = entries.filter((e) => e.key !== key)
  emit()
  if (!entry.win.closed) entry.win.close()
  if (byUser) entry.onReturn?.()
}

export function closeAllPopouts(): void {
  for (const e of [...entries]) closePopout(e.key)
}

export function dismissPopoutNotice(): void {
  notice = null
  emit()
}

const getEntries = () => entries
const getNotice = () => notice

export const usePopouts = (): PopoutEntry[] => useSyncExternalStore(subscribe, getEntries, getEntries)

export const usePopoutNotice = (): string | null => useSyncExternalStore(subscribe, getNotice, getNotice)

export function usePopout(kind: PopoutKind, id: string): PopoutEntry | undefined {
  const list = usePopouts()
  return list.find((e) => e.key === popoutKey(kind, id))
}
