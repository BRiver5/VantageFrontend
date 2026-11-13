/**
 * «Показать жетон на карте» из любого места экрана (панель отряда и т. п.).
 * Карта подписывается и сама решает, что делать: навести камеру, выбрать свой.
 */
type Listener = (tokenId: string) => void

const listeners = new Set<Listener>()

export function focusToken(tokenId: string): boolean {
  listeners.forEach((fn) => fn(tokenId))
  return listeners.size > 0
}

export function onTokenFocus(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
