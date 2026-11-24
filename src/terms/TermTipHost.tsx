/**
 * Плавающая подсказка термина поверх всего.
 *
 * Внутри ссылки термина лежит `.term-tip` с названием и кратким описанием. Раньше она
 * позиционировалась внутри текста и обрезалась любым контейнером с прокруткой (выдвижная
 * панель снаряжения, окна, карточки). Теперь при наведении (или фокусе) её содержимое
 * показывается одной общей подсказкой в body: над словом, а если сверху мало места — под ним,
 * и не выходит за края окна.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Tip = { html: string; x: number; y: number; below: boolean }

const GAP = 8
const MARGIN = 8

export function TermTipHost() {
  const [tip, setTip] = useState<Tip | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return
    const linkOf = (t: EventTarget | null) =>
      t instanceof Element ? t.closest<HTMLElement>('.term-link:not(.term-link--plain)') : null
    const show = (link: HTMLElement) => {
      const inner = link.querySelector<HTMLElement>(':scope > .term-tip')
      if (!inner) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const r = link.getBoundingClientRect()
        const below = r.top < 120
        setTip({ html: inner.innerHTML, x: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below })
      }, 220)
    }
    const hide = () => {
      if (timer.current) clearTimeout(timer.current)
      setTip(null)
    }
    const over = (e: Event) => {
      const link = linkOf(e.target)
      if (link) show(link)
    }
    const out = (e: MouseEvent | FocusEvent) => {
      const from = linkOf(e.target)
      if (from && !from.contains(e.relatedTarget as Node | null)) hide()
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mouseout', out)
    document.addEventListener('focusin', over)
    document.addEventListener('focusout', out)
    window.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mouseout', out)
      document.removeEventListener('focusin', over)
      document.removeEventListener('focusout', out)
      window.removeEventListener('scroll', hide, true)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // не выходить за края окна: сдвиг по горизонтали после измерения
  const [shift, setShift] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!tip || !el) return
    const w = el.offsetWidth
    const left = tip.x - w / 2
    const right = tip.x + w / 2
    setShift(left < MARGIN ? MARGIN - left : right > window.innerWidth - MARGIN ? window.innerWidth - MARGIN - right : 0)
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={box}
      className={`term-tip-float${tip.below ? ' is-below' : ''}`}
      role="tooltip"
      style={{ left: tip.x + shift, top: tip.y }}
      dangerouslySetInnerHTML={{ __html: tip.html }}
    />,
    document.body,
  )
}
