/**
 * Перенести оформление в окно: стили и атрибуты <html>/<body> (тема, режим
 * комнаты). Новые стили (горячая замена при разработке, ленивые чанки) тоже
 * переносятся, пока окно открыто. Возвращает функцию остановки.
 */
function cloneStyle(node: Element, doc: Document): Element | null {
  if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    // у about:blank своя база ссылок: только абсолютный адрес
    link.href = node.href
    if (node.media) link.media = node.media
    return link
  }
  if (node instanceof HTMLStyleElement) {
    const style = doc.createElement('style')
    style.textContent = node.textContent
    return style
  }
  return null
}

function copyAttributes(from: Element, to: Element) {
  for (const a of Array.from(to.attributes)) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name)
  for (const a of Array.from(from.attributes)) to.setAttribute(a.name, a.value)
}

export function mirrorStyles(src: Document, dst: Document): () => void {
  const copies = new Map<Node, Element>()
  const add = (node: Node) => {
    if (!(node instanceof Element) || copies.has(node)) return
    const copy = cloneStyle(node, dst)
    if (!copy) return
    copies.set(node, copy)
    dst.head.appendChild(copy)
  }
  src.head.querySelectorAll('link[rel="stylesheet"], style').forEach(add)
  copyAttributes(src.documentElement, dst.documentElement)
  copyAttributes(src.body, dst.body)

  const headObs = new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach(add)
      m.removedNodes.forEach((n) => {
        copies.get(n)?.remove()
        copies.delete(n)
      })
      // правка текста стиля при горячей замене
      if (m.type === 'characterData' || (m.type === 'childList' && m.target instanceof HTMLStyleElement)) {
        const style = m.target instanceof HTMLStyleElement ? m.target : m.target.parentElement
        const copy = style ? copies.get(style) : null
        if (style && copy) copy.textContent = style.textContent
      }
    }
  })
  headObs.observe(src.head, { childList: true, subtree: true, characterData: true })
  const attrObs = new MutationObserver(() => {
    copyAttributes(src.documentElement, dst.documentElement)
    copyAttributes(src.body, dst.body)
  })
  attrObs.observe(src.documentElement, { attributes: true })
  attrObs.observe(src.body, { attributes: true })
  return () => {
    headObs.disconnect()
    attrObs.disconnect()
  }
}
