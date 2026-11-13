/**
 * Анимация атаки без map.vfx: по combat.action выбрать жест и пресеты.
 * Рукопашная — жест по виду физического урона (рубящий — взмах, колющий —
 * выпад, дробящий — удар), цвет и удар по стихии. Дальняя — снаряд или луч
 * от атакующего к цели, психическая и звуковая — вспышка на цели. Промах —
 * серый взмах мимо или снаряд, пролетающий цель. Явный vfx из запроса
 * важнее таблицы. Без React: проверяется тестами.
 */
import type { CombatActionResult } from '../types/rooms'
import type { Pt } from './types'

export type Gesture = 'slash' | 'thrust' | 'smash' | 'projectile' | 'beam' | 'burst'

export const PHYSICAL = ['slashing', 'piercing', 'bludgeoning'] as const

/** вид физического урона → жест рукопашной */
export const MELEE_GESTURE: Record<string, Gesture> = { slashing: 'slash', piercing: 'thrust', bludgeoning: 'smash' }

/** стихия → как летит дальняя атака */
export const RANGED_GESTURE: Record<string, Gesture> = {
  fire: 'projectile',
  cold: 'projectile',
  acid: 'projectile',
  poison: 'projectile',
  force: 'projectile',
  piercing: 'projectile',
  slashing: 'projectile',
  bludgeoning: 'projectile',
  lightning: 'beam',
  radiant: 'beam',
  necrotic: 'beam',
  psychic: 'burst',
  thunder: 'burst',
}

/** цвета жеста для физического урона (стихии — из render/constants ELEMENT) */
export const STEEL = ['#ffffff', '#e8ecf2', '#aab3c0', '#596273']
export const MISS_COLOR = '#9aa0a8'

export interface AttackFxPlan {
  gesture: Gesture
  /** стихия для цвета: fire, cold… или slashing/piercing/bludgeoning */
  element: string
  /** пресет полёта (projectile.fire, beam.lightning) */
  travel: string | null
  /** пресет попадания на цели */
  impact: string | null
  /** рукопашная: жест рисуется от атакующего к цели */
  melee: boolean
}

export interface AttackFxInput {
  kind: string
  ranged?: boolean
  damageTypes: readonly string[]
  vfx?: string | null
  /** дистанция атакующий → цель, если сервер не сказал ranged */
  distanceFt?: number | null
  healed?: boolean
}

const isPhysical = (t: string) => (PHYSICAL as readonly string[]).includes(t)

/** Что играть; null — действие без урона и лечения (анимации нет) */
export function planAttackFx(a: AttackFxInput): AttackFxPlan | null {
  const types = a.damageTypes.filter(Boolean)
  if (!types.length && !a.healed && !a.vfx && a.kind !== 'attack') return null
  if (!types.length && a.healed && !a.vfx) return { gesture: 'burst', element: 'heal', travel: null, impact: 'heal.heal', melee: false }
  const physical = types.find(isPhysical) ?? (a.kind === 'attack' ? 'slashing' : null)
  const element = types.find((t) => !isPhysical(t)) ?? physical ?? 'arcane'
  const ranged = a.ranged ?? (a.distanceFt != null ? a.distanceFt > 7.5 : a.kind !== 'attack')
  if (a.vfx) {
    const form = a.vfx.split('.')[0]
    if (form === 'projectile' || form === 'beam') return { gesture: form, element, travel: a.vfx, impact: `impact.${element}`, melee: false }
    if (!ranged) return { gesture: MELEE_GESTURE[physical ?? ''] ?? 'slash', element, travel: null, impact: a.vfx, melee: true }
    return { gesture: 'burst', element, travel: null, impact: a.vfx, melee: false }
  }
  if (!ranged) return { gesture: MELEE_GESTURE[physical ?? ''] ?? 'slash', element, travel: null, impact: `impact.${element}`, melee: true }
  const gesture = RANGED_GESTURE[element] ?? 'projectile'
  if (gesture === 'burst') return { gesture, element, travel: null, impact: `burst.${element}`, melee: false }
  return { gesture, element, travel: `${gesture}.${element}`, impact: `impact.${element}`, melee: false }
}

/**
 * Куда уходит промах: за цель на ~1,2 клетки и вбок на ~0,6 (side — с какой
 * стороны, +1 или −1). Без длины пути — та же точка.
 */
export function missPoint(from: Pt, to: Pt, cellPx: number, side: 1 | -1): Pt {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: to.x + cellPx * 0.6 * side, y: to.y }
  const ux = dx / len
  const uy = dy / len
  return { x: to.x + ux * cellPx * 1.2 - uy * cellPx * 0.6 * side, y: to.y + uy * cellPx * 1.2 + ux * cellPx * 0.6 * side }
}

/** урон цели одним числом (как в журнале): сколько снято или выброшено */
export function damageOf(t: CombatActionResult['targets'][number]): number {
  return (t.damage ?? []).reduce((s, d) => s + (d.taken ?? d.amount ?? d.roll?.total ?? 0), 0)
}

/** промах: атака не попала или спасбросок без урона */
export const isMiss = (t: CombatActionResult['targets'][number]) => (t.attack ? !t.hit : false) || (!!t.save && t.saved && damageOf(t) === 0 && !t.healed)

/**
 * Очередь: действие-заклинание ждёт чуть-чуть — вдруг за ним придёт map.vfx
 * с полноценной анимацией; тогда своя отменяется. Атаки играются сразу.
 */
export class AutoAttackFx {
  private pending = new Map<string, ReturnType<typeof setTimeout>[]>()
  private play: (r: CombatActionResult) => void
  private waitMs: number

  constructor(play: (r: CombatActionResult) => void, waitMs = 400) {
    this.play = play
    this.waitMs = waitMs
  }

  private key = (actor: string, label: string) => `${actor}\u0000${label}`

  action(r: CombatActionResult) {
    if (r.kind !== 'spell' || r.vfx) return this.play(r)
    const key = this.key(r.actor_combatant_id, r.label)
    const list = this.pending.get(key) ?? []
    const timer = setTimeout(() => {
      const left = (this.pending.get(key) ?? []).filter((x) => x !== timer)
      if (left.length) this.pending.set(key, left)
      else this.pending.delete(key)
      this.play(r)
    }, this.waitMs)
    list.push(timer)
    this.pending.set(key, list)
  }

  /** пришёл map.vfx: своя анимация этого заклинания не нужна */
  vfx(v: { actor_combatant_id: string; spell: string }) {
    const key = this.key(v.actor_combatant_id, v.spell)
    for (const t of this.pending.get(key) ?? []) clearTimeout(t)
    this.pending.delete(key)
  }

  dispose() {
    for (const list of this.pending.values()) list.forEach(clearTimeout)
    this.pending.clear()
  }
}
