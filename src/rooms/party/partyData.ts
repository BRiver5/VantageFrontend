/**
 * Логика панели отряда, панели эффектов и подсказок хода — без React, под тесты.
 */
import type { BattleMap } from '../../maps/types'
import type { CharacterCard, CombatView, CombatantView, EffectBrief } from '../../types/rooms'

/* ---------- отряд ---------- */

export interface PartyMember {
  card: CharacterCard
  mine: boolean
  /** жетон героя на открытой карте */
  tokenId: string | null
  /** сейчас его ход */
  current: boolean
  down: boolean
}

/**
 * Кто в панели: герои комнаты. Игрок видит отряд (свой герой первым), мастер —
 * всех. Порядок остальных — как в комнате, чтобы панель не прыгала.
 */
export function selectParty(characters: CharacterCard[], opts: { mine: string | null; map: BattleMap | null; combat: CombatView | null }): PartyMember[] {
  const { mine, map, combat } = opts
  const active = combat && combat.status === 'active' ? combat : null
  const current = active?.combatants.find((c) => c.id === active.current_combatant_id)
  const list = characters.map((card) => {
    const unit = combat?.combatants.find((c) => c.kind === 'character' && c.ref_id === card.id)
    const token = map?.tokens.find((t) => t.character_id === card.id || (!!unit && t.combatant_id === unit.id))
    return {
      card,
      mine: card.id === mine,
      tokenId: token?.id ?? null,
      current: !!current && current.kind === 'character' && current.ref_id === card.id,
      down: card.hp.current <= 0,
    }
  })
  return [...list.filter((m) => m.mine), ...list.filter((m) => !m.mine)]
}

/* ---------- эффекты ---------- */

/** Эффекты героя с id и длительностью; у старых карточек — только подписи */
export function effectsOfCard(card: CharacterCard): EffectBrief[] {
  if (card.effects_detail?.length) return card.effects_detail
  return (card.effects ?? []).map((label) => ({ id: '', label, expires: 'never', rounds_left: null }))
}

const EXPIRES_RU: Record<string, string> = {
  never: 'пока не снимут',
  short_rest: 'до короткого отдыха',
  long_rest: 'до продолжительного отдыха',
  turn_start: 'до начала следующего хода',
  turn_end: 'до конца хода',
  save_ends: 'до успешного спасброска',
}

/** Сколько ещё продлится — словами */
export function durationText(e: Pick<EffectBrief, 'expires' | 'rounds_left'>): string {
  if (e.rounds_left != null && e.rounds_left > 0) return `ещё ${e.rounds_left} ${roundWord(e.rounds_left)}`
  return EXPIRES_RU[e.expires] ?? 'пока не снимут'
}

export function roundWord(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return 'раунд'
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'раунда'
  return 'раундов'
}

/* ---------- чей ход ---------- */

export type TurnCue = 'now' | 'next' | null

/**
 * Следующий в очереди после текущего: побеждённых сервер пропускает.
 * Список уже в порядке хода; после последнего — снова первый.
 */
export function nextUp(combatants: CombatantView[], currentId: string | null): CombatantView | null {
  const at = currentId ? combatants.findIndex((c) => c.id === currentId) : -1
  if (at < 0) return null
  for (let i = 1; i < combatants.length; i++) {
    const c = combatants[(at + i) % combatants.length]
    if (!c.defeated) return c
  }
  return null
}

/**
 * Подсказка зрителю при смене хода: «Ваш ход», если ход перешёл к его
 * участнику, «Ваш ход следующий», если его участник идёт сразу за текущим.
 * mineIds — свой герой и призванные, которыми он управляет.
 */
export function turnCue(combat: CombatView | null, mineIds: ReadonlySet<string>): TurnCue {
  if (!combat || combat.status !== 'active' || !combat.current_combatant_id || mineIds.size === 0) return null
  if (mineIds.has(combat.current_combatant_id)) return 'now'
  const next = nextUp(combat.combatants, combat.current_combatant_id)
  return next && mineIds.has(next.id) ? 'next' : null
}

/** Ключ хода: подсказка показывается один раз на каждую смену */
export const turnKey = (combat: CombatView | null): string | null => (combat && combat.status === 'active' && combat.current_combatant_id ? `${combat.id}:${combat.round}:${combat.current_combatant_id}` : null)

/** Участники, за которых действует зритель */
export function myCombatants(combat: CombatView | null, me: { user_id: string; room_character_id: string | null }): Set<string> {
  const out = new Set<string>()
  for (const c of combat?.combatants ?? []) {
    const ruled = c.controller_id === me.user_id || (!!c.creature && 'controller_id' in c.creature && c.creature.controller_id === me.user_id)
    if ((c.kind === 'character' && c.ref_id === me.room_character_id) || ruled) out.add(c.id)
  }
  return out
}
