import { ApiError } from '../../../api'
import { parsePortrait } from '../../../characters/portrait'
import { type ForcedDie } from '../../../dice/diceControl'
import { facesOf } from '../../../dice/bonusDice'
import type { CombatActionResult, CombatantView, RolledDice } from '../../../types/rooms'
import { isFullCreature } from '../../../types/rooms'
import { creatureArt, creatureName, creatureSize } from '../parts'

export const errText = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'Сейчас так нельзя: не ваш ход или бой изменился.'
    if (e.status === 422) return `Не получилось: ${e.message}`
    if (e.status === 404) return 'Цель или участник не найден.'
  }
  return e instanceof Error ? e.message : 'Ошибка сервера'
}

export const nameOf = (c: CombatantView): string => c.card?.name ?? (c.creature ? creatureName(c.creature) : 'Участник')

export const artOf = (c: CombatantView): string | null => (c.card ? parsePortrait(c.card.avatar_url).src : c.creature ? creatureArt(c.creature) : null)

/** Во сколько раз фигура выше среднего существа */
const SIZE_K: Record<string, number> = { Tiny: 0.55, Small: 0.78, Medium: 1, Large: 1.32, Huge: 1.68, Gargantuan: 2 }

export const sizeK = (c: CombatantView) => (c.creature ? (SIZE_K[creatureSize(c.creature) ?? 'Medium'] ?? 1) : 1)

/** Грани броска для 3D; прибавочные кости эффектов — своим цветом */
export const diceOf = (r: RolledDice | null | undefined): ForcedDie[] => (r ? facesOf(r.dice) : [])

/** Как цель выглядела до удара: показываем это, пока не легли кости */
export type Held = Record<string, Pick<CombatantView, 'card' | 'creature' | 'defeated'>>

/* ---------- что вылетает над фигурой ---------- */

export interface Floater {
  id: string
  text: string
  tone: 'dmg' | 'crit' | 'hit' | 'miss' | 'heal' | 'save' | 'fx'
  /** задержка, чтобы несколько чисел не слипались */
  delay: number
}

export const dealtBy = (t: CombatActionResult['targets'][number]) => t.damage.reduce((s, d) => s + (d.taken ?? d.amount ?? d.roll.total), 0)

/** Урон проходит: попали или броска атаки не было */
export const landed = (t: CombatActionResult['targets'][number]) => t.hit || !t.attack

/** Что показать сразу после d20: попал или нет */
export function verdictOf(t: CombatActionResult['targets'][number], key: string): Floater[] {
  if (t.attack) {
    // кубик может лечь где угодно: итог броска пишем рядом с вердиктом
    const total = t.attack.total
    if (!t.hit) return [{ id: `${key}-v`, text: `${total} · Промах`, tone: 'miss', delay: 0 }]
    return [{ id: `${key}-v`, text: t.crit ? `${total} · Крит!` : `${total} · Попал`, tone: t.crit ? 'crit' : 'hit', delay: 0 }]
  }
  if (t.save) return [{ id: `${key}-v`, text: `${t.save.total} · ${t.saved ? 'Спасся' : 'Не спасся'}`, tone: t.saved ? 'save' : 'miss', delay: 0 }]
  return []
}

/** Что показать, когда легли кости урона */
export function impactOf(t: CombatActionResult['targets'][number], key: string): Floater[] {
  const out: Floater[] = []
  let delay = 0
  const push = (text: string, tone: Floater['tone']) => {
    out.push({ id: `${key}-i${out.length}`, text, tone, delay })
    delay += 220
  }
  const dealt = dealtBy(t)
  if (dealt > 0 && landed(t)) push(`−${dealt}`, t.crit ? 'crit' : 'dmg')
  if (t.healed) push(`+${t.healed}`, 'heal')
  if (t.effect) push(t.effect, 'fx')
  return out
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/* ---------- фигура ---------- */

/** Эффекты на участнике: у героя — подписи карточки, у существа — состояния */
export function effectsOf(c: CombatantView): string[] {
  if (c.card) return c.card.effects ?? []
  const cr = c.creature
  if (!cr) return []
  return isFullCreature(cr) ? (cr.conditions ?? []).map((e) => e.label) : (cr.effects ?? [])
}

/** Легендарные счётчики: мастеру — из существа, игроку — если открыты действия */
export function legendaryOf(c: CombatantView): { actions: number; actionsLeft: number; resist: number; resistLeft: number } | null {
  const cr = c.creature
  if (!cr) return null
  if (isFullCreature(cr)) {
    const actions = cr.legendary_actions ?? 0
    const resist = cr.legendary_resistances ?? 0
    return actions || resist ? { actions, actionsLeft: cr.legendary_actions_left ?? actions, resist, resistLeft: cr.legendary_resistances_left ?? resist } : null
  }
  const l = cr.legendary
  return l && (l.actions || l.resistances) ? { actions: l.actions, actionsLeft: l.actions_left, resist: l.resistances, resistLeft: l.resistances_left } : null
}
