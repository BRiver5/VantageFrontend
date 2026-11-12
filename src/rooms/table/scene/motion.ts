import { type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { type Currency } from '../../../api'
import type { RollPayload } from '../../../types/rooms'
import { isEngineRoll } from '../../../types/rooms'
import { type Origin } from '../parts'
import type { Bubble } from './Seat'

/* ---------- полёт предмета ---------- */

export const COIN_ORDER: Currency[] = ['pp', 'gp', 'ep', 'sp', 'cp']

export const COIN_RU: Record<Currency, string> = { pp: 'пм', gp: 'зм', ep: 'эм', sp: 'см', cp: 'мм' }

const EASE_ARC = 'cubic-bezier(0.45, 0.05, 0.3, 1)'

/** Копия предмета летит по дуге от стола к цели и исчезает в ней */
export function flyTo(from: Element, to: Element, onLanded: () => void) {
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const clone = from.cloneNode(true) as HTMLElement
  Object.assign(clone.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', zIndex: '130', pointerEvents: 'none' })
  clone.classList.add('tb-flying')
  document.body.appendChild(clone)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const lift = Math.min(-60, dy * 0.25 - 80)
  const anim = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.12}px, ${lift * 0.8}px) scale(1.22) rotate(-10deg)`, opacity: 1, offset: 0.32 },
      { transform: `translate(${dx * 0.72}px, ${dy * 0.55 + lift * 0.5}px) scale(0.86) rotate(14deg)`, opacity: 1, offset: 0.74 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.28) rotate(30deg)`, opacity: 0.25, offset: 1 },
    ],
    { duration: 820, easing: EASE_ARC, fill: 'forwards' },
  )
  anim.onfinish = () => {
    clone.remove()
    onLanded()
  }
}

/**
 * Передача из рук в руки: вещь выходит от отправителя, по дуге ложится на
 * середину стола, лежит мгновение и уже оттуда улетает получателю.
 */
export function relay(from: Element | null, content: ReactNode, onLand: (piece: HTMLElement) => void) {
  const field = document.querySelector('.tb-field')
  if (!field) return
  const f = field.getBoundingClientRect()
  const node = document.createElement('div')
  node.className = 'tb-relay'
  document.body.appendChild(node)
  const root = createRoot(node)
  flushSync(() => root.render(content))
  const w = node.offsetWidth
  const h = node.offsetHeight
  const mx = f.left + f.width / 2 + (Math.random() * 2 - 1) * f.width * 0.12
  const my = f.top + f.height / 2 + (Math.random() * 2 - 1) * f.height * 0.1
  Object.assign(node.style, { left: `${mx - w / 2}px`, top: `${my - h / 2}px` })
  const s = from?.getBoundingClientRect()
  const dx = s ? s.left + s.width / 2 - mx : 0
  const dy = s ? s.top + s.height / 2 - my : -f.height / 2
  const lift = Math.min(-50, -Math.abs(dy) * 0.35 - 40)
  const tilt = (Math.random() * 2 - 1) * 9
  const drop = node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(-70deg)`, opacity: 0 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.5 + lift}px) scale(1.18) rotate(-18deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(0, 0) scale(0.94) rotate(${tilt + 4}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(0, -6px) scale(1.04) rotate(${tilt - 2}deg)`, opacity: 1, offset: 0.9 },
      { transform: `translate(0, 0) scale(1) rotate(${tilt}deg)`, opacity: 1 },
    ],
    { duration: 900, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)', fill: 'forwards' },
  )
  drop.onfinish = () => {
    // полежать на столе, чтобы все успели разглядеть, что передают
    setTimeout(() => {
      drop.cancel()
      node.style.transform = `rotate(${tilt}deg)`
      onLand(node)
      root.unmount()
      node.remove()
    }, 520)
  }
}

/** Предмет подъезжает к своему месту от того, кто его выложил */
export function slideFrom(el: HTMLElement, origin: Origin) {
  const r = el.getBoundingClientRect()
  const dx = origin.x - (r.left + r.width / 2)
  const dy = origin.y - (r.top + r.height / 2)
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(-120deg)`, opacity: 0 },
      { transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) scale(1.14) rotate(8deg)`, opacity: 1, offset: 0.72 },
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    ],
    { duration: 760, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' },
  )
}

export function bubbleOf(id: string, p: RollPayload): Bubble {
  if (isEngineRoll(p)) return { id, total: p.engine.total, label: p.label, tone: '' }
  const d20 = p.dice.length === 1 && p.dice[0].sides === 20 && p.dice[0].rolls.length === 1 ? p.dice[0].rolls[0] : null
  return { id, total: p.total, label: p.label || p.expression, tone: d20 === 20 ? 'crit' : d20 === 1 ? 'fumble' : '' }
}
