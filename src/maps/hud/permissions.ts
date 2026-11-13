/**
 * Что можно сделать с жетоном из панели. Повторяет права сервера, чтобы не
 * показывать кнопки, которые ответят 403:
 * - хиты героя (POST …/characters/{c}/vitals) — владелец и мастер;
 * - хиты существа (POST …/creatures/{c}/vitals) — только мастер;
 * - состояния (…/effects, …/combat/{c}/effects) — только мастер;
 * - высота, скрытие (PATCH …/tokens/{t}) — только мастер: владельцу сервер даёт
 *   лишь vision_mode, rotation, light_id;
 * - участники боя (POST / DELETE …/combat/{c}/combatants) — только мастер;
 * - цель — любой, кто видит жетон: она живёт только у него.
 */
import type { MapToken } from '../types'

export interface HudSubject {
  kind: 'character' | 'creature' | 'none'
  /** id героя или существа комнаты */
  refId: string | null
  /** владелец героя */
  ownerId?: string | null
}

export interface HudCombatInfo {
  /** идёт бой (setup или active) */
  live: boolean
  /** участник боя, если жетон в нём */
  combatantId: string | null
}

export interface HudPermissions {
  hp: boolean
  effects: boolean
  elevation: boolean
  target: boolean
  combat: boolean
  hide: boolean
}

export function subjectOf(t: MapToken, owners: Record<string, string | null | undefined>): HudSubject {
  if (t.character_id) return { kind: 'character', refId: t.character_id, ownerId: owners[t.character_id] ?? null }
  if (t.creature_id) return { kind: 'creature', refId: t.creature_id }
  return { kind: 'none', refId: null }
}

export function hudPermissions(t: MapToken, s: HudSubject, combat: HudCombatInfo, who: { isDm: boolean; userId: string | null | undefined }): HudPermissions {
  const dm = who.isDm
  const owner = s.kind === 'character' && !!who.userId && s.ownerId === who.userId
  const linked = s.kind !== 'none'
  return {
    hp: linked && (dm || (s.kind === 'character' && owner)),
    effects: dm && linked,
    elevation: dm,
    target: dm || !t.hidden,
    combat: dm && combat.live && linked,
    hide: dm,
  }
}

/** Есть ли в панели хоть одно действие, кроме цели */
export const anyManage = (p: HudPermissions) => p.hp || p.effects || p.elevation || p.combat || p.hide
