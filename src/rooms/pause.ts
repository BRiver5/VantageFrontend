/**
 * Пауза игры: это статус комнаты `paused`. Мастер ставит и снимает её
 * (POST /status), пока она стоит, сервер отвечает игрокам 423 на ход,
 * двери и бой.
 */
import type { RoomStatus } from '../types/rooms'

export const PAUSE_HINT = 'Пауза: ходить и действовать нельзя, пока мастер не продолжит игру'

export const isPausedStatus = (status: RoomStatus | null | undefined): boolean => status === 'paused'

/** Мастер может ставить на паузу идущую игру и снимать паузу */
export const canTogglePause = (status: RoomStatus | null | undefined): boolean => status === 'active' || status === 'paused'

/** Статус после переключения паузы; null — переключать нечего (сбор, закрыта) */
export function nextPauseStatus(status: RoomStatus | null | undefined): RoomStatus | null {
  if (status === 'active') return 'paused'
  if (status === 'paused') return 'active'
  return null
}

/** Фокус в поле ввода: горячие клавиши без модификаторов (Пробел) там не работают */
export function isTypingTarget(el: EventTarget | Element | null | undefined): boolean {
  if (!el || typeof (el as Element).closest !== 'function') return false
  const node = el as HTMLElement
  if (node.isContentEditable) return true
  return !!node.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]')
}
