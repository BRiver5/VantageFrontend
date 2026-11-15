/**
 * Оверлей шага: затемнение с вырезом вокруг якоря и окно с текстом.
 * Фокус переходит в окно и не уходит из него (Tab по кругу), Esc закрывает
 * тур с сохранением шага, стрелки листают. Якорь можно нажимать — это часть
 * знакомства; остальная страница под затемнением не реагирует.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { tourById } from './content'
import { query, revealElement, runActions, waitForElement } from './dom'
import { canGoBack, isLastStep, type TourRun } from './engine'
import { placeDialog, type Box } from './placement'
import { dispatchTour, tourNavigate } from './store'

const PAD = 6
const WAIT_MS = 1500

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

export function TourOverlay({ run }: { run: TourRun }) {
  const tour = tourById(run.tourId)
  const step = tour?.steps[run.index]
  const target = useRef<HTMLElement | null>(null)
  const dialog = useRef<HTMLDivElement | null>(null)
  const [hole, setHole] = useState<Box | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // фокус вернётся туда, где был до тура
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => {
      if (before && before.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

  // шаг: действие «до шага», поиск якоря
  useEffect(() => {
    if (run.phase !== 'resolving' || !step) return
    let cancelled = false
    void (async () => {
      if (step.skipIf && query(step.skipIf)) return dispatchTour({ type: 'resolved', found: false })
      if (step.before) await runActions(step.before, tourNavigate)
      if (cancelled) return
      const el = step.selector ? await waitForElement(step.selector, WAIT_MS, () => cancelled) : null
      if (cancelled) return
      target.current = el
      if (el) revealElement(el)
      dispatchTour({ type: 'resolved', found: !step.selector || !!el })
    })()
    return () => {
      cancelled = true
    }
  }, [run.phase, run.index, run.tourId, step])

  // якорь и окно могут двигаться (анимации, прокрутка, ресайз) — следим каждый кадр
  const showing = run.phase === 'showing'
  useLayoutEffect(() => {
    if (!showing) return
    let frame = 0
    let lastHole: Box | null = null
    let lastPos: { x: number; y: number } | null = null
    const tick = () => {
      const el = target.current
      const r = el && el.isConnected ? el.getBoundingClientRect() : null
      const box = r && r.width + r.height > 0 ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null
      if (!sameBox(box, lastHole)) {
        lastHole = box
        setHole(box)
      }
      const d = dialog.current
      if (d) {
        const p = placeDialog(box, { w: d.offsetWidth, h: d.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }, step?.placement)
        if (!lastPos || lastPos.x !== p.x || lastPos.y !== p.y) {
          lastPos = p
          setPos(p)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [showing, run.index, step?.placement])

  // каждый новый шаг — фокус в окно, чтобы чтец экрана прочёл заголовок и текст
  useEffect(() => {
    if (showing) dialog.current?.focus({ preventScroll: true })
  }, [showing, run.index])

  // клавиши ловим раньше всех: Esc стола, пробел паузы и прочее не должны сработать
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inside = !!dialog.current && dialog.current.contains(e.target as Node)
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        dispatchTour({ type: 'close' })
        return
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !isTyping(e.target)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        dispatchTour({ type: e.key === 'ArrowRight' ? 'next' : 'prev' })
        return
      }
      if (e.key === 'Tab' && dialog.current) {
        const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href]')]
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (!inside || (e.shiftKey && (active === first || active === dialog.current)) || (!e.shiftKey && active === last)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        }
        e.stopImmediatePropagation()
        return
      }
      if (inside) e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!tour || !step) return null
  const last = isLastStep(run)
  const titleId = `tour-title-${run.index}`
  const textId = `tour-text-${run.index}`
  const h = showing ? hole : null

  return createPortal(
    <div className="tour-layer" data-phase={run.phase}>
      {h ? (
        <>
          <div className="tour-spot" style={{ left: h.x, top: h.y, width: h.w, height: h.h }} aria-hidden="true" />
          {/* стенки вокруг выреза: клики мимо якоря гасятся */}
          <div className="tour-block" style={{ left: 0, right: 0, top: 0, height: Math.max(0, h.y) }} />
          <div className="tour-block" style={{ left: 0, right: 0, top: h.y + h.h, bottom: 0 }} />
          <div className="tour-block" style={{ left: 0, top: h.y, width: Math.max(0, h.x), height: h.h }} />
          <div className="tour-block" style={{ left: h.x + h.w, right: 0, top: h.y, height: h.h }} />
        </>
      ) : (
        <div className="tour-dim" />
      )}
      {showing && (
        <div
          ref={dialog}
          className="tour-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={textId}
          tabIndex={-1}
          style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
        >
          <header className="tour-head">
            <span className="tour-count">
              Шаг {run.index + 1} из {run.total}
            </span>
            <button type="button" className="tour-x" onClick={() => dispatchTour({ type: 'close' })} aria-label="Закрыть тур (прогресс сохранится)" title="Закрыть (Esc)">
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="tour-kicker">{tour.title}</p>
          <h2 id={titleId} className="tour-title">
            {step.title}
          </h2>
          {step.image && <img className="tour-img" src={step.image.src} alt={step.image.alt} />}
          <p id={textId} className="tour-text">
            {step.text}
          </p>
          <div className="tour-progress" aria-hidden="true">
            <i style={{ width: `${((run.index + 1) / run.total) * 100}%` }} />
          </div>
          <footer className="tour-foot">
            <button type="button" className="tour-btn is-ghost" disabled={!canGoBack(run)} onClick={() => dispatchTour({ type: 'prev' })}>
              <ChevronLeft aria-hidden="true" /> Назад
            </button>
            <button type="button" className="tour-btn" onClick={() => dispatchTour({ type: 'next' })}>
              {last ? 'Готово' : 'Далее'} {!last && <ChevronRight aria-hidden="true" />}
            </button>
          </footer>
        </div>
      )}
    </div>,
    document.body,
  )
}
