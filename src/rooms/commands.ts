/**
 * Команды комнаты между частями экрана, которые не знают друг о друге:
 * палитра Ctrl+K и панель быстрых действий просят ширму открыть кодекс или
 * створку, линейку — включиться, просмотр статьи — открыть страницу.
 * Обработчик живёт там, где уже есть нужное состояние; если его нет на экране,
 * команда просто никуда не приходит (emit вернёт false).
 */
import { useEffect, useLayoutEffect, useRef } from 'react'

export type RoomCommand =
  /** кодекс мастера, страница по id */
  | { type: 'kb.open'; id?: string | null }
  /** створка ширмы мастера */
  | { type: 'screen.leaf'; leaf: 'creatures' | 'loot' | 'maps' | 'tables' | 'dash' | 'theatre' }
  | { type: 'ruler.toggle' }
  /** статья для чтения: общая заметка у игрока, страница кодекса у мастера */
  | { type: 'article.open'; id: string }

type Handler<T extends RoomCommand['type']> = (cmd: Extract<RoomCommand, { type: T }>) => void

const handlers = new Map<string, Set<(cmd: RoomCommand) => void>>()

export function emitRoomCommand(cmd: RoomCommand): boolean {
  const set = handlers.get(cmd.type)
  if (!set?.size) return false
  for (const fn of set) fn(cmd)
  return true
}

export const hasRoomCommand = (type: RoomCommand['type']): boolean => !!handlers.get(type)?.size

export function onRoomCommand<T extends RoomCommand['type']>(type: T, fn: Handler<T>): () => void {
  const wrapped = fn as (cmd: RoomCommand) => void
  const set = handlers.get(type) ?? new Set()
  set.add(wrapped)
  handlers.set(type, set)
  return () => {
    set.delete(wrapped)
  }
}

export function useRoomCommand<T extends RoomCommand['type']>(type: T, fn: Handler<T>, enabled = true): void {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    if (!enabled) return
    return onRoomCommand(type, (cmd) => ref.current(cmd))
  }, [type, enabled])
}
