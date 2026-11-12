import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    // возврат с подкласса к сотам делает свой скролл (морф-перелёт в соту) —
    // не сбрасываем его в начало страницы; флаг ставит обработчик «назад».
    if (document.documentElement.dataset.keepScroll) {
      delete document.documentElement.dataset.keepScroll
      return
    }
    // портретный open/close: scrollTo посреди View Transition дёргает геометрию
    // групп — скролл в начало делает сам portraitTransition после finished.
    if (document.documentElement.dataset.nav) return
    // ВАЖНО: тело в {} — иначе стрелка вернёт результат window.scrollTo, а React
    // примет его за cleanup-функцию. В браузерах, где расширение/плагин плавного
    // скролла заставляет scrollTo вернуть НЕ undefined, при следующей навигации
    // React зовёт этот «cleanup» → "destroy is not a function" → чёрный экран.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}
