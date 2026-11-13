/**
 * Вид жетона по состояниям: эффекты героя (card.effects) или существа
 * (conditions / effects) → набор визуальных признаков, которые рисует
 * render/looks.ts. Таблица ключей состояний — данные, без React.
 *
 * Состояние узнаём так же, как на столе (rooms/table/effects: CONDITIONS по
 * началу подписи); «горит» — своей строкой, в 5e это не состояние.
 */
import { describeEffect } from '../rooms/table/effects'
import { isFullCreature, type AnyCreature, type CharacterCard } from '../types/rooms'
import { subjectOf, type OverlaySource } from './partyOverlays'
import type { BattleMap } from './types'

export type LookKey = 'invisible' | 'burning' | 'poisoned' | 'grey' | 'stone' | 'frightened' | 'concentration' | 'dead' | 'prone'

/** ключ состояния (CONDITIONS.key) → признаки вида */
export const LOOK_BY_CONDITION: Record<string, LookKey[]> = {
  invisible: ['invisible'],
  poisoned: ['poisoned'],
  paralyzed: ['grey'],
  petrified: ['stone'],
  frightened: ['frightened'],
  concentration: ['concentration'],
  prone: ['prone'],
  unconscious: ['prone', 'grey'],
}

/** подписи, которых нет среди состояний 5e */
export const LOOK_BY_LABEL: [RegExp, LookKey][] = [
  [/^(гори|горящ|в огне|подожж|пыла|охвачен огн|burning|on fire|ablaze)/i, 'burning'],
  [/^(мёртв|мертв|убит|погиб|dead)/i, 'dead'],
]

/** признаки, которые двигаются: нужен кадр за кадром */
export const ANIMATED: ReadonlySet<LookKey> = new Set<LookKey>(['invisible', 'burning', 'poisoned', 'frightened', 'concentration'])

export type TokenLook = Partial<Record<LookKey, true>>

/** признаки по подписям эффектов и поверженности */
export function lookOf(labels: readonly string[], opts: { defeated?: boolean; down?: boolean } = {}): TokenLook | null {
  const out: TokenLook = {}
  let any = false
  const set = (k: LookKey) => {
    out[k] = true
    any = true
  }
  for (const raw of labels) {
    const label = raw.trim()
    if (!label) continue
    const hit = LOOK_BY_LABEL.find(([re]) => re.test(label))
    if (hit) {
      set(hit[1])
      continue
    }
    for (const k of LOOK_BY_CONDITION[describeEffect(label).def.key] ?? []) set(k)
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

function labelsOf(card?: CharacterCard, creature?: AnyCreature): string[] {
  if (card) return card.effects ?? []
  if (!creature) return []
  return isFullCreature(creature) ? (creature.conditions ?? []).map((e) => e.label) : (creature.effects ?? [])
}

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
    const look = lookOf(labelsOf(card, creature), { defeated, down })
    if (look) out[t.id] = look
  }
  return out
}
