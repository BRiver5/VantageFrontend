/**
 * Из чего сложен бросок — карточки бонусов для анимации и режим преимущества.
 *
 * Правил здесь нет: всё берётся из листа сервера. Модификатор характеристики,
 * мастерство и вклады способностей (`breakdown`) — для проверок, спасбросков и
 * навыков; для атак и урона — бонусы по тегам броска (`char.attack_bonus.*`,
 * `char.dmg_bonus.*`: Ярость +2 к урону силовой рукопашной), а преимущество —
 * если тег броска есть в `char.adv.*` (Безрассудная атака, ярость на Силу).
 */
import type { AbilityKey, AbilityName, AttackEntry, Contribution, SheetView } from '../types/character'
import { ABILITY_LABELS, ABILITY_SHORT } from '../types/character'

export interface RollBonusCard {
  label: string
  value: number
  /** ability — характеристика, prof — мастерство, feature — умение, item — предмет, other */
  kind: 'ability' | 'prof' | 'feature' | 'item' | 'other'
}

export type RollMode = 'normal' | 'adv' | 'dis'

/** Что за бросок — по этому выбираются теги преимущества и бонусов */
export interface RollContext {
  kind: 'check' | 'save' | 'skill' | 'attack' | 'damage' | 'init' | 'spell' | 'death' | 'other'
  ability?: AbilityName
  skill?: string
  /** теги атаки: weapon, melee_str, ranged, heavy… */
  tags?: string[]
  /** готовые карточки (если известны лучше, чем раскладка по листу) */
  bonuses?: RollBonusCard[]
}

const short = (k?: AbilityName): AbilityKey | undefined => (k ? ABILITY_SHORT[k] : undefined)

/** Карточки вкладов способностей и предметов из breakdown (только прибавки-числа) */
function featureCards(view: SheetView, path: string): RollBonusCard[] {
  return (view.breakdown?.[path] ?? [])
    .filter((c: Contribution) => c.op === 'add' && typeof c.value === 'number' && c.value !== 0)
    .map((c) => ({
      label: view.sourceNames?.[c.source] ?? sourceName(c.source),
      value: c.value as number,
      kind: c.source.startsWith('item:') ? ('item' as const) : ('feature' as const),
    }))
}

const sourceName = (source: string) => {
  const name = source.includes(':') ? source.split(':').slice(1).join(':') : source.split('.').pop() ?? source
  const t = name.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Докладывает «Прочее», если карточки не сходятся с итоговым бонусом */
function balance(cards: RollBonusCard[], total: number): RollBonusCard[] {
  const out = cards.filter((c) => c.value !== 0)
  const rest = total - out.reduce((s, c) => s + c.value, 0)
  if (rest !== 0) out.push({ label: 'Прочее', value: rest, kind: 'other' })
  return out
}

/** Раскладка бонуса броска к20 по карточкам */
export function d20Cards(view: SheetView, ctx: RollContext | undefined, total: number): RollBonusCard[] {
  if (!ctx) return total ? [{ label: 'Бонус', value: total, kind: 'other' }] : []
  if (ctx.bonuses) return balance(ctx.bonuses, total)
  const pb = view.proficiency_bonus
  const ab = ctx.ability ? view.ability_scores[ctx.ability] : null
  const abLabel = ctx.ability ? ABILITY_LABELS[ctx.ability].label : ''
  const mod = ab?.modifier ?? 0

  switch (ctx.kind) {
    case 'check':
      return balance([{ label: abLabel, value: mod, kind: 'ability' }, ...featureCards(view, `char.abilities.${short(ctx.ability)}.mod`)], total)
    case 'save': {
      const cards: RollBonusCard[] = [{ label: abLabel, value: mod, kind: 'ability' }]
      if (ab?.saving_throw_proficient) cards.push({ label: 'Мастерство', value: pb, kind: 'prof' })
      return balance([...cards, ...featureCards(view, `char.abilities.${short(ctx.ability)}.save`)], total)
    }
    case 'skill': {
      const entry = ctx.skill ? view.skills[ctx.skill] : null
      const ability = entry?.ability ?? ctx.ability
      const m = ability ? (view.ability_scores[ability].modifier ?? 0) : 0
      const cards: RollBonusCard[] = ability ? [{ label: ABILITY_LABELS[ability].label, value: m, kind: 'ability' }] : []
      if (entry?.expertise) cards.push({ label: 'Компетентность', value: pb * 2, kind: 'prof' })
      else if (entry?.proficient) cards.push({ label: 'Мастерство', value: pb, kind: 'prof' })
      return balance([...cards, ...featureCards(view, `char.skills.${ctx.skill}.bonus`)], total)
    }
    case 'init':
      return balance([{ label: 'Ловкость', value: view.ability_scores.dexterity.modifier ?? 0, kind: 'ability' }, ...featureCards(view, 'char.init')], total)
    case 'attack':
    case 'spell': {
      // модификатор и мастерство «запечены» в бонус атаки — раскладываем, если сходится
      const cards: RollBonusCard[] = []
      if (ab && total - mod === pb) cards.push({ label: abLabel, value: mod, kind: 'ability' }, { label: 'Мастерство', value: pb, kind: 'prof' })
      else if (ab) cards.push({ label: abLabel, value: mod, kind: 'ability' })
      return balance(cards, total)
    }
    default:
      return total ? [{ label: 'Бонус', value: total, kind: 'other' }] : []
  }
}

/** Дополнительные бонусы по тегам атаки или урона — с именами способностей */
export function tagCards(view: SheetView, field: 'attackBonus' | 'dmgBonus', tags: string[]): RollBonusCard[] {
  const map = view.extras?.[field] ?? {}
  const prefix = field === 'attackBonus' ? 'char.attack_bonus.' : 'char.dmg_bonus.'
  const out: RollBonusCard[] = []
  for (const tag of new Set(tags)) {
    const value = map[tag]
    if (!value) continue
    const named = featureCards(view, `${prefix}${tag}`)
    // вклады с именами (Ярость +2), а если их нет — одной карточкой
    if (named.length && named.reduce((s, c) => s + c.value, 0) === value) out.push(...named)
    else out.push({ label: 'Бонус', value, kind: 'feature' })
  }
  return out
}

/** Сумма бонусов по тегам — чтобы число на кнопке атаки совпадало с броском */
export const tagBonus = (view: SheetView, field: 'attackBonus' | 'dmgBonus', tags: string[]) =>
  [...new Set(tags)].reduce((s, t) => s + (view.extras?.[field]?.[t] ?? 0), 0)

/** Режим броска и откуда он: «Безрассудная атака», «Ярость» */
export function rollMode(view: SheetView, ctx: RollContext | undefined): { mode: RollMode; label: string | null } {
  const ex = view.extras
  if (!ex || !ctx) return { mode: 'normal', label: null }
  const field = ctx.kind === 'save' ? 'save' : ctx.kind === 'attack' || ctx.kind === 'spell' ? 'attack' : ctx.kind === 'check' || ctx.kind === 'skill' || ctx.kind === 'init' ? 'check' : null
  if (!field) return { mode: 'normal', label: null }
  const keys = [short(ctx.ability), ctx.skill, ...(ctx.tags ?? []), 'all'].filter(Boolean) as string[]
  const hit = (list: string[]) => keys.find((k) => list.includes(k))
  const adv = hit(ex.adv[field])
  const dis = hit(ex.disadv[field])
  // и преимущество, и помеха — взаимно гасятся
  if (adv && dis) return { mode: 'normal', label: null }
  const path = `char.${adv ? 'adv' : 'disadv'}.${field}`
  const tag = adv ?? dis
  if (!tag) return { mode: 'normal', label: null }
  const who = (view.breakdown?.[path] ?? []).find((c) => Array.isArray(c.value) && (c.value as unknown[]).includes(tag))
  return { mode: adv ? 'adv' : 'dis', label: who ? (view.sourceNames?.[who.source] ?? sourceName(who.source)) : null }
}

/** Теги атаки оружием по её свойствам: силовая ли, дальняя, тяжёлая, метательная */
export function attackTags(a: Pick<AttackEntry, 'type' | 'properties'>, view: SheetView): { tags: string[]; ability: AbilityName } {
  const props = a.properties.map((p) => p.toLocaleLowerCase('ru'))
  const has = (stem: string) => props.some((p) => p.startsWith(stem))
  const str = view.ability_scores.strength.modifier ?? 0
  const dex = view.ability_scores.dexterity.modifier ?? 0
  if (a.type === 'spell') return { tags: ['spell'], ability: 'intelligence' }
  if (a.type === 'ranged') {
    return { tags: ['weapon', 'ranged', 'ranged_weapon', ...(has('тяж') ? ['heavy'] : [])], ability: 'dexterity' }
  }
  const finesseDex = has('фехтов') && dex > str
  const tags = ['weapon', 'melee_weapon', ...(finesseDex ? ['melee_dex'] : ['melee_str']), ...(has('тяж') ? ['heavy'] : []), ...(has('метат') ? ['thrown_weapon'] : [])]
  return { tags, ability: finesseDex ? 'dexterity' : 'strength' }
}
