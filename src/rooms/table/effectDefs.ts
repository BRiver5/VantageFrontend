/**
 * Состояния и эффекты для показа: печать (значок), аура на фигуре, подсказка правила.
 *
 * Ключ — канонический код (src/rules/codes.ts). Сервер шлёт код рядом с подписью
 * (effects_detail[].code, effect_codes, conditions[].code); у старых данных кода нет —
 * тогда он выводится из подписи: «Отравлен», «отравление» → poisoned.
 */
import {
  ArrowDownToLine,
  ArrowLeftFromLine,
  BatteryLow,
  CircleAlert,
  CircleSlash,
  EarOff,
  EyeOff,
  FastForward,
  Flame,
  FlaskConical,
  Ghost,
  Hand,
  Heart,
  Link2,
  Moon,
  Mountain,
  ShieldHalf,
  Snowflake,
  Sparkle,
  Sparkles,
  Sun,
  Wind,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CONCENTRATION, codeOf, concentrationSpell, effectCode, effectLabel, type EffectRef } from '../../rules/codes'
import type { AnyCreature, CharacterCard, EffectExpiry, StatKey } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'

export interface ConditionDef {
  /** код из src/rules/codes.ts */
  key: string
  label: string
  icon: LucideIcon
  /** класс ауры на фигуре */
  aura: string
  hint: string
}

const cond = (key: string, icon: LucideIcon, aura: string, hint: string): ConditionDef => ({ key, label: effectLabel(key), icon, aura, hint })

/** печати по кодам; порядок — как в сетке подборщика */
export const CONDITIONS: ConditionDef[] = [
  cond('poisoned', FlaskConical, 'poison', 'помеха к атакам и проверкам'),
  cond('blinded', EyeOff, 'blind', 'не видит, атаки по нему с преимуществом'),
  cond('charmed', Heart, 'charm', 'не нападает на очаровавшего'),
  cond('deafened', EarOff, 'deaf', 'не слышит'),
  cond('frightened', Ghost, 'fear', 'помеха, пока видит источник страха'),
  cond('grappled', Hand, 'grapple', 'скорость 0'),
  cond('incapacitated', CircleSlash, 'daze', 'ни действий, ни реакций'),
  cond('invisible', Wind, 'invisible', 'его не видно без особых чувств'),
  cond('paralyzed', Snowflake, 'freeze', 'недееспособен, критуют вблизи'),
  cond('petrified', Mountain, 'stone', 'превращён в камень'),
  cond('prone', ArrowDownToLine, 'prone', 'вблизи по нему с преимуществом'),
  cond('restrained', Link2, 'bind', 'скорость 0, помеха к атакам'),
  cond('stunned', Zap, 'stun', 'недееспособен, проваливает спасы Сил и Лов'),
  cond('unconscious', Moon, 'sleep', 'падает и роняет всё из рук'),
  cond('exhaustion', BatteryLow, 'tired', 'уровни истощения складываются'),
  cond('concentration', Sparkles, 'conc', 'держит заклинание'),
  cond('disengage', ArrowLeftFromLine, 'magic', 'уходит без атак по возможности'),
  cond('dodge', ShieldHalf, 'magic', 'атаки по нему с помехой'),
  cond('burning', Flame, 'magic', 'горит'),
  cond('blessed', Sun, 'bless', '+к4 к атакам и спасброскам'),
  cond('hasted', FastForward, 'haste', 'двойная скорость, +2 КД'),
]

const GENERIC: Omit<ConditionDef, 'label'> = { key: 'other', icon: Sparkle, aura: 'magic', hint: '' }

export interface ShownEffect {
  /** подпись как на сервере */
  label: string
  /** код (явный или из подписи); null — свой эффект */
  code: string | null
  /** что показать: без «Концентрация:» */
  title: string
  def: Omit<ConditionDef, 'label'>
  id?: string
  rounds?: number | null
}

/** Застигнут врасплох: не состояние 5e, но в первом раунде видно так же */
export const SURPRISED: ShownEffect = { label: 'Врасплох', code: null, title: 'Застигнут врасплох', def: { key: 'surprised', icon: CircleAlert, aura: 'surprise', hint: 'в первом раунде без действий и реакций' } }

export function describeEffect(label: string, extra?: { id?: string; rounds?: number | null; code?: string | null }): ShownEffect {
  const clean = label.trim()
  const code = codeOf({ label: clean, code: extra?.code })
  const def = CONDITIONS.find((c) => c.key === code) ?? GENERIC
  // «Концентрация: Невидимость» → «Невидимость»; своя подпись с кодом концентрации — как есть
  const title = code === CONCENTRATION ? concentrationSpell(clean) || (effectCode(clean) === CONCENTRATION ? effectLabel(CONCENTRATION) : clean) : clean
  return { label: clean, code, title, def, id: extra?.id, rounds: extra?.rounds }
}

/** Эффект цели: подпись, код (если сервер прислал) и, если есть, id с длительностью */
export interface EffectEntry extends EffectRef {
  id?: string
  rounds_left?: number | null
}

/** Эффекты героя: подробные (с id и кодом), иначе подписи с кодами по порядку */
export function cardEffects(card: Pick<CharacterCard, 'effects' | 'effects_detail' | 'effect_codes'> | null | undefined): EffectEntry[] {
  if (!card) return []
  if (card.effects_detail?.length) return card.effects_detail
  return (card.effects ?? []).map((label, i) => ({ label, code: card.effect_codes?.[i] ?? null }))
}

/** Эффекты существа: у мастера — состояния целиком, у игрока — то, что открыто */
export function creatureEffects(creature: AnyCreature | null | undefined): EffectEntry[] {
  if (!creature) return []
  if (isFullCreature(creature)) return creature.conditions ?? []
  if (creature.effects_detail?.length) return creature.effects_detail
  return (creature.effects ?? []).map((label, i) => ({ label, code: creature.effect_codes?.[i] ?? null }))
}

export const showEffect = (e: EffectEntry) => describeEffect(e.label, { id: e.id || undefined, rounds: e.rounds_left, code: e.code })

/** Классы аур для фигуры: по одному на состояние */
export const auraClass = (list: ShownEffect[]) => [...new Set(list.map((e) => `fx-${e.def.aura}`))].join(' ')

export interface EffectDraft {
  label: string
  /** код выбранного состояния; у своего эффекта — нет */
  code?: string | null
  expires: EffectExpiry
  rounds_left: number | null
  save_ability?: StatKey | null
  save_dc?: number | null
  concentration: boolean
}
