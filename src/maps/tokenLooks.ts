/**
 * Вид жетона по состояниям: эффекты героя (карточка) или существа
 * (conditions / effects) → набор визуальных признаков, которые рисует
 * render/looks.ts. Таблица кодов состояний — данные, без React.
 *
 * Состояние — по коду (src/rules/codes.ts): сервер шлёт его рядом с подписью,
 * у старых данных код выводится из подписи. «Горит» и «мёртв» — коды проекта,
 * в 5e это не состояния.
 */
import { cardEffects, creatureEffects } from '../rooms/table/effectDefs'
import { codeOf, type EffectRef } from '../rules/codes'
import { isFullCreature, type AnyCreature, type CharacterCard } from '../types/rooms'
import { subjectOf, type OverlaySource } from './partyOverlays'
import type { BattleMap } from './types'

export type LookKey = 'invisible' | 'burning' | 'poisoned' | 'grey' | 'stone' | 'frightened' | 'concentration' | 'dead' | 'prone'

/** код состояния → признаки вида */
export const LOOK_BY_CONDITION: Record<string, LookKey[]> = {
  invisible: ['invisible'],
  poisoned: ['poisoned'],
  paralyzed: ['grey'],
  petrified: ['stone'],
  frightened: ['frightened'],
  concentration: ['concentration'],
  prone: ['prone'],
  unconscious: ['prone', 'grey'],
  burning: ['burning'],
  dead: ['dead'],
}

/** признаки, которые двигаются: нужен кадр за кадром */
export const ANIMATED: ReadonlySet<LookKey> = new Set<LookKey>(['invisible', 'burning', 'poisoned', 'frightened', 'concentration'])

export type TokenLook = Partial<Record<LookKey, true>>

/** признаки по эффектам (подпись + код или просто подпись) и поверженности */
export function lookOf(effects: readonly (EffectRef | string)[], opts: { defeated?: boolean; down?: boolean } = {}): TokenLook | null {
  const out: TokenLook = {}
  let any = false
  const set = (k: LookKey) => {
    out[k] = true
    any = true
  }
  for (const e of effects) {
    const code = codeOf(e)
    for (const k of (code && LOOK_BY_CONDITION[code]) || []) set(k)
  }
  // повержен: существо на 0 хитов или выбыло из боя; герой на 0 — без сознания
  if (opts.defeated) set('dead')
  else if (opts.down) {
    set('prone')
    set('grey')
  }
  if (out.dead) {
    delete out.prone
    delete out.grey
  }
  return any ? out : null
}

export const isAnimated = (l: TokenLook | null | undefined) => !!l && (Object.keys(l) as LookKey[]).some((k) => ANIMATED.has(k))

const effectsOf = (card?: CharacterCard, creature?: AnyCreature): EffectRef[] => (card ? cardEffects(card) : creatureEffects(creature))

/** вид каждого жетона; жетоны без признаков не попадают */
export function tokenLooks(map: BattleMap, src: OverlaySource): Record<string, TokenLook> {
  const out: Record<string, TokenLook> = {}
  for (const t of map.tokens) {
    const { card, creature } = subjectOf(t, src)
    const unit = t.combatant_id ? src.combat?.combatants.find((c) => c.id === t.combatant_id) : undefined
    let down = false
    let defeated = false
    if (card) down = card.hp.current <= 0 && card.hp.max > 0
    else if (creature) {
      const hp = isFullCreature(creature) ? creature.hp_current : creature.hp?.current
      const band = isFullCreature(creature) ? null : creature.hp_band
      defeated = (hp != null && hp <= 0) || band === 'down'
    }
    if (unit?.defeated && unit.kind !== 'character') defeated = true
    const look = lookOf(effectsOf(card, creature), { defeated, down })
    if (look) out[t.id] = look
  }
  return out
}
