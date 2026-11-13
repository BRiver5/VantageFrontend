/**
 * Данные комнаты → то, что карта рисует поверх жетонов: здоровье (игроку о
 * врагах — только состояние), чей ход, и подписи существ под тем именем,
 * которое открыто зрителю. Без React: проверяется тестами.
 */
import { creatureHealth, creatureLabel, heroHealth, type HealthView } from '../rooms/health'
import type { AnyCreature, CharacterCard, CombatView } from '../types/rooms'
import type { BattleMap, MapToken } from './types'

export interface OverlaySource {
  characters: CharacterCard[]
  creatures: AnyCreature[]
  combat: CombatView | null
}

/** Карточка героя или существо за жетоном: по прямой ссылке или через участника боя */
export function subjectOf(t: MapToken, src: OverlaySource): { card?: CharacterCard; creature?: AnyCreature } {
  const unit = t.combatant_id ? src.combat?.combatants.find((c) => c.id === t.combatant_id) : undefined
  if (t.character_id || unit?.card) {
    const card = src.characters.find((c) => c.id === (t.character_id ?? unit?.ref_id)) ?? unit?.card
    if (card) return { card }
  }
  const creatureId = t.creature_id ?? (unit?.kind === 'creature' ? unit.ref_id : undefined)
  const creature = (creatureId ? src.creatures.find((c) => c.id === creatureId) : undefined) ?? unit?.creature
  return creature ? { creature } : {}
}

/** Здоровье под каждым жетоном. Скрытое не рисуется вовсе */
export function tokenHealth(map: BattleMap, src: OverlaySource, isDm: boolean): Record<string, HealthView> {
  const out: Record<string, HealthView> = {}
  for (const t of map.tokens) {
    const { card, creature } = subjectOf(t, src)
    const h = card ? heroHealth(card) : creature ? creatureHealth(creature, isDm) : null
    if (h && h.kind !== 'hidden') out[t.id] = h
  }
  return out
}

/**
 * Подписи жетонов существ игроку — из карточки существа (там уже public_name,
 * пока имя скрыто). Сервер прячет имя и в самом жетоне, это вторая страховка.
 * Мастеру и при отсутствии изменений возвращается та же карта.
 */
export function maskTokenLabels(map: BattleMap, creatures: AnyCreature[], isDm: boolean): BattleMap {
  if (isDm) return map
  let changed = false
  const tokens = map.tokens.map((t) => {
    if (!t.creature_id) return t
    const cr = creatures.find((c) => c.id === t.creature_id)
    const label = cr ? creatureLabel(cr, false) : t.label
    if (label === t.label) return t
    changed = true
    return { ...t, label }
  })
  return changed ? { ...map, tokens } : map
}

/** Жетон того, чей сейчас ход; null вне боя и в ход скрытого участника */
export function turnTokenId(map: BattleMap, combat: CombatView | null): string | null {
  if (!combat || combat.status !== 'active' || !combat.current_combatant_id) return null
  const cur = combat.current_combatant_id
  const unit = combat.combatants.find((c) => c.id === cur)
  const t =
    map.tokens.find((x) => x.combatant_id === cur) ??
    (unit?.kind === 'character' ? map.tokens.find((x) => x.character_id === unit.ref_id) : unit ? map.tokens.find((x) => x.creature_id === unit.ref_id) : undefined)
  return t?.id ?? null
}
