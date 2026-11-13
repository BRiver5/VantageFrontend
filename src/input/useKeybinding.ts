import { useEffect, useLayoutEffect, useRef } from 'react'
import { matches, type ActionId } from './keybindings'

/**
 * Вызвать handler, когда нажато сочетание действия. Слушаем keydown на document
 * (как и прежние обработчики). preventDefault/stopPropagation — на усмотрение handler.
 * Переназначения читаются в момент нажатия, поэтому подхватываются без перерисовки.
 */
export function useKeybinding(actionId: ActionId, handler: (e: KeyboardEvent) => void, enabled = true): void {
  const ref = useRef(handler)
  useLayoutEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, actionId)) ref.current(e)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [actionId, enabled])
}
