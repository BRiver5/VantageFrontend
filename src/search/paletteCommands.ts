/**
 * Команды палитры Ctrl+K. Окно поиска живёт над всеми страницами, а действия
 * знает комната: она кладёт сюда свой список, пока открыта, и убирает, уходя.
 * Пока список есть, поиск открывается и внутри комнаты.
 */
import { useSyncExternalStore } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface PaletteCommand {
  id: string
  label: string
  /** раздел в списке: «Действия», «Статьи» */
  group: string
  icon?: LucideIcon
  /** подсказка справа: «мастер», сочетание клавиш */
  hint?: string
  keywords?: readonly string[]
  run: () => void
}

let commands: PaletteCommand[] | null = null
const listeners = new Set<() => void>()
const openListeners = new Set<() => void>()

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const snapshot = () => commands

/** null — команд нет (вне комнаты): палитра остаётся поиском по кодексу */
export function setPaletteCommands(list: PaletteCommand[] | null): void {
  commands = list
  listeners.forEach((fn) => fn())
}

export const usePaletteCommands = (): PaletteCommand[] | null => useSyncExternalStore(subscribe, snapshot, snapshot)

/** Палитра открылась: источникам пора освежить данные (страницы кодекса) */
export function notifyPaletteOpen(): void {
  openListeners.forEach((fn) => fn())
}

export function onPaletteOpen(fn: () => void): () => void {
  openListeners.add(fn)
  return () => {
    openListeners.delete(fn)
  }
}
