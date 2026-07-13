/**
 * Защита от расширений-переводчиков (Google Translate и т.п.) и любых других,
 * которые подменяют текстовые узлы прямо в DOM.
 *
 * Проблема: переводчик заменяет текстовые узлы страницы на свои. При следующем
 * обновлении React (навигация между разделами) React пытается вызвать
 * removeChild/insertBefore на узлах, которые переводчик увёл из-под него, и
 * падает с "Failed to execute 'removeChild' on 'Node': The node to be removed is
 * not a child of this node". Без error boundary всё дерево размонтируется →
 * ЧЁРНЫЙ ЭКРАН, и помогает только F5 (перезагрузка рендерит заново, пока
 * переводчик ещё не влез). В браузере без расширений (встроенный в Cursor,
 * headless-тесты) бага нет — потому и проявлялась только в «обычном» браузере.
 *
 * Фикс (известный приём из react/issues#11538): делаем эти DOM-операции
 * устойчивыми — если узел уже не там, где его ждёт React, просто ничего не
 * делаем вместо исключения. Ставится ДО первого рендера (import в main.tsx).
 */
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // узел уже отвязан/перемещён переводчиком — не роняем React
      return child
    }
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // опорный узел уже не наш ребёнок — вставляем в конец вместо падения
      return originalInsertBefore.call(this, newNode, null) as T
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T
  }

  const originalReplaceChild = Node.prototype.replaceChild
  Node.prototype.replaceChild = function <T extends Node>(this: Node, newChild: Node, oldChild: T): T {
    if (oldChild.parentNode !== this) {
      // заменяемый узел уже увели — не роняем React
      return oldChild
    }
    return originalReplaceChild.call(this, newChild, oldChild) as T
  }
}

export {}
