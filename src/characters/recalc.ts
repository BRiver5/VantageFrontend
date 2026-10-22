/**
 * Сохранённый лист хранит производные числа (инициатива, пассивная
 * внимательность, Сл заклинаний, атаки, КД, бонус мастерства, кости хитов).
 * После правки характеристик или инвентаря их пересчитываем теми же правилами,
 * что и в конструкторе, — но только те, что игрок оставил «авто».
 */
import { abilityMod, proficiencyBonus } from '../create/dnd5e'
import { weaponAttack, wornDefense } from '../create/startingGear'
import { ABILITY_KEYS, emptyCharacter } from '../types/character'
import type { AbilityName, Character, CharacterCreate } from '../types/character'

/** Что пересчитать; остальное остаётся как вписано */
export interface RecalcOptions {
  /** КД и надетые доспех/щит по инвентарю */
  armor?: boolean
  /** атаки оружием из инвентаря (вписанные вручную не трогаются) */
  attacks?: boolean
  initiative?: boolean
  passive?: boolean
  /** Сл спасброска и бонус атаки заклинаниями */
  spell?: boolean
}

/** Значения «по правилам» для текущего листа */
export interface Derived {
  /** КД по снаряжению; null — предметов нет, КД вписан руками */
  ac: number | null
  initiative: number
  passive: number
  spellDc: number | null
  spellAttack: number | null
  /** бонус мастерства по общему уровню */
  proficiency: number
  /** «5d10» или «5d10 + 2d8» для мультикласса */
  hitDice: string
}

const scoresOf = (c: CharacterCreate) =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, c.ability_scores[k].score])) as Record<AbilityName, number>

export function derive(c: CharacterCreate): Derived {
  const scores = scoresOf(c)
  const pb = c.proficiency_bonus
  const perception = c.skills.perception
  const perceptionBonus = perception?.proficient ? (perception.expertise ? pb * 2 : pb) : 0
  const sc = c.spellcasting
  const castMod = sc.spellcasting_ability ? abilityMod(scores[sc.spellcasting_ability]) : null
  const gear = c.inventory.items.flatMap((it) => (it.equipment ? [it.equipment] : []))

  // кости хитов по классам: одинаковые кости складываются
  const dice = new Map<number, number>()
  for (const cl of c.basic_info.classes) dice.set(cl.hit_die ?? 8, (dice.get(cl.hit_die ?? 8) ?? 0) + cl.level)
  const hitDice = [...dice.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([d, n]) => `${n}d${d}`)
    .join(' + ')

  return {
    ac: gear.length ? wornDefense(gear, c.basic_info.classes[0]?.name ?? '', scores).ac : null,
    initiative: abilityMod(scores.dexterity),
    passive: 10 + abilityMod(scores.wisdom) + perceptionBonus,
    spellDc: castMod != null ? 8 + pb + castMod : null,
    spellAttack: castMod != null ? pb + castMod : null,
    proficiency: proficiencyBonus(c.basic_info.total_level),
    hitDice: hitDice || `${c.basic_info.total_level}d8`,
  }
}

export function recalcCharacter<T extends CharacterCreate>(c: T, opts: RecalcOptions): T {
  const scores = scoresOf(c)
  const pb = c.proficiency_bonus
  const d = derive(c)

  /* ---------- магия ---------- */

  const sc = c.spellcasting
  const spellcasting =
    opts.spell && sc.is_spellcaster && d.spellDc != null
      ? { ...sc, spell_save_dc: d.spellDc, spell_attack_bonus: d.spellAttack }
      : sc

  /* ---------- инвентарь: надетый доспех и атаки оружием ---------- */

  let items = c.inventory.items
  let { armor_class, shield } = c.combat
  // у импортированных листов предметов нет — их КД вписан руками, не трогаем
  if (opts.armor && items.some((it) => it.equipment)) {
    const worn = wornDefense(
      items.flatMap((it) => (it.equipment ? [it.equipment] : [])),
      c.basic_info.classes[0]?.name ?? '',
      scores,
    )
    items = items.map((it) => {
      const slot = !it.equipment ? null : it.equipment === worn.armor ? 'armor' : it.equipment === worn.shield ? 'shield' : null
      return { ...it, equipped: slot !== null, equip_slot: slot }
    })
    armor_class = worn.ac
    shield = worn.shield !== null
  }
  let attacks = c.attacks
  if (opts.attacks) {
    const ids = new Set(items.map((it) => it.instance_id))
    // атаки, вписанные вручную или из импорта, остаются как есть
    const manual = c.attacks.filter((a) => !a.inventory_instance_id || !ids.has(a.inventory_instance_id))
    const fromItems = items
      .map((it) => (it.equipment ? weaponAttack(it.equipment, it.instance_id, scores, pb, c.proficiencies.weapons) : null))
      .filter((a): a is NonNullable<typeof a> => a !== null)
    attacks = [...fromItems, ...manual]
  }

  return {
    ...c,
    combat: {
      ...c.combat,
      armor_class,
      shield,
      initiative: opts.initiative ? d.initiative : c.combat.initiative,
      passive_perception: opts.passive ? d.passive : c.combat.passive_perception,
    },
    attacks,
    spellcasting,
    inventory: { ...c.inventory, items },
  }
}

/** Достраивает лист с сервера до полной формы: старые листы бывают без части полей */
export function normalizeCharacter(c: Character): Character {
  const base = emptyCharacter()
  const bi = c.basic_info ?? base.basic_info
  return {
    ...base,
    ...c,
    basic_info: {
      ...base.basic_info,
      ...bi,
      race: bi.race ?? base.basic_info.race,
      classes: bi.classes?.length ? bi.classes : base.basic_info.classes,
    },
    ability_scores: { ...base.ability_scores, ...c.ability_scores },
    skills: { ...base.skills, ...c.skills },
    combat: {
      ...base.combat,
      ...c.combat,
      hit_points: { ...base.combat.hit_points, ...c.combat?.hit_points },
      hit_dice: { ...base.combat.hit_dice, ...c.combat?.hit_dice },
      death_saves: { ...base.combat.death_saves, ...c.combat?.death_saves },
      conditions: c.combat?.conditions ?? [],
    },
    attacks: c.attacks ?? [],
    proficiencies: { ...base.proficiencies, ...c.proficiencies },
    features: c.features ?? [],
    feats: c.feats ?? [],
    spellcasting: {
      ...base.spellcasting,
      ...c.spellcasting,
      spell_slots: c.spellcasting?.spell_slots ?? {},
      spells_known: c.spellcasting?.spells_known ?? [],
    },
    inventory: {
      ...base.inventory,
      ...c.inventory,
      currency: { ...base.inventory.currency, ...c.inventory?.currency },
      items: (c.inventory?.items ?? []).map((it, i) => ({
        ...it,
        position: it.position ?? { col: i % 7, row: Math.floor(i / 7) },
      })),
    },
    personality: { ...base.personality, ...c.personality },
    backstory: c.backstory ?? '',
    notes: c.notes ?? '',
  }
}
