/**
 * Превращение черновика визарда в готовый лист персонажа.
 *
 * Всё, что в D&D выводится из расы, класса, предыстории и уровня, считается
 * здесь: характеристики с расовыми бонусами и усилениями, хиты, бонус
 * мастерства, владения, ячейки заклинаний и список умений. Редактор листа
 * получает уже заполненного персонажа, а не заготовку с десятками.
 */
import { cleanDescription } from '../api'
import type { Equipment, EquipmentIndex } from '../api'
import { skillKeysFromNames } from '../skills'
import { ABILITY_KEYS, emptyCharacter } from '../types/character'
import type {
  AbilityName,
  CharacterCreate,
  FeatureEntry as SheetFeature,
  SpellKnown,
} from '../types/character'
import type { FeatureEntry } from '../classArticle'
import { scoreOf, type CharacterDraft, type LevelChoice } from './draft'
import { featureText } from './featureText'
import type { GrantedSpell } from './grantedSpells'
import { customInventory, inventoryItem, resolveGear, weaponAttack, wornDefense } from './startingGear'
import {
  abilityFromAny,
  abilityMod,
  cantripsAt,
  casterKind,
  isPreparedCaster,
  preparedSpellsMax,
  proficiencyBonus,
  savingThrowsFallback,
  spellSlotBlocks,
  spellcastingAbility,
} from './dnd5e'

/** Среднее значение кости хитов за уровень (как в PHB — округление вверх) */
export function averageHitDie(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1
}

/** Прибавка хитов за уровень без модификатора Телосложения */
export function hitPointsForLevel(choice: LevelChoice, hitDie: number): number {
  // первый уровень всегда даёт максимум кости
  if (choice.level === 1) return hitDie
  if (choice.hpRoll != null) return choice.hpRoll
  return averageHitDie(hitDie)
}

/** Сумма усилений характеристик, распределённых по всем уровням */
export function asiTotals(levels: LevelChoice[]): Partial<Record<AbilityName, number>> {
  const out: Partial<Record<AbilityName, number>> = {}
  for (const lvl of levels) {
    for (const [ability, value] of Object.entries(lvl.asi)) {
      if (!value) continue
      const key = ability as AbilityName
      out[key] = (out[key] ?? 0) + value
    }
  }
  return out
}

/** Расовые и подрасовые бонусы к характеристикам */
export function racialBonuses(draft: CharacterDraft): Partial<Record<AbilityName, number>> {
  const out: Partial<Record<AbilityName, number>> = {}
  const add = (scores: Record<string, number> | null | undefined) => {
    for (const [raw, value] of Object.entries(scores ?? {})) {
      const key = abilityFromAny(raw)
      if (!key || !value) continue
      out[key] = (out[key] ?? 0) + value
    }
  }
  add(draft.race?.increase_ability_scores)
  add(draft.subrace?.increase_ability_scores)
  return out
}

/** Итоговые характеристики: база + раса + усиления, не выше 20 */
export function finalScores(draft: CharacterDraft): Record<AbilityName, number> {
  const racial = racialBonuses(draft)
  const asi = asiTotals(draft.levels)
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [
      k,
      Math.min(20, scoreOf(draft.baseScores, k) + (racial[k] ?? 0) + (asi[k] ?? 0)),
    ]),
  ) as Record<AbilityName, number>
}

/** Максимум хитов с учётом Телосложения — минимум 1 за уровень */
export function maxHitPoints(draft: CharacterDraft, hitDie: number, conScore: number): number {
  const conMod = abilityMod(conScore)
  let total = 0
  for (const lvl of draft.levels) {
    total += Math.max(1, hitPointsForLevel(lvl, hitDie) + conMod)
  }
  return Math.max(1, total)
}

function toSheetFeature(
  entry: FeatureEntry,
  source: SheetFeature['source'],
  featureSource: string | null,
  ownerName: string,
): SheetFeature {
  return {
    name: entry.name,
    source,
    level: entry.level,
    // без повтора «НАЗВАНИЕ 1-й уровень, умение паладина» в начале описания
    description: featureText(entry.html, entry.name, ownerName),
    feature_source: featureSource,
  }
}

function uniqueStrings(values: (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const text = value?.trim()
    if (!text) continue
    const key = text.toLocaleLowerCase('ru')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

export interface DeriveInput {
  draft: CharacterDraft
  /** умения класса по уровням (разобранные из статьи класса) */
  classFeatures: FeatureEntry[]
  /** умения выбранного подкласса */
  subclassFeatures: FeatureEntry[]
  /** имя игрока для шапки листа */
  playerDisplayName?: string | null
  /** каталог снаряжения — из него берутся предметы стартового набора */
  equipmentIndex?: EquipmentIndex | null
  /** заклинания от расы и подкласса (с уровнем получения) */
  granted?: GrantedSpell[]
}

export function buildCharacter({
  draft,
  classFeatures,
  subclassFeatures,
  playerDisplayName,
  equipmentIndex = null,
  granted = [],
}: DeriveInput): CharacterCreate {
  const className = draft.cls?.class_name ?? 'Воин'
  const raceName = draft.race?.race_name ?? 'Человек'
  const level = draft.targetLevel
  const hitDie = draft.cls?.hit_dice ?? 10
  const scores = finalScores(draft)
  const pb = proficiencyBonus(level)

  const base = emptyCharacter({
    name: draft.name.trim() || 'Новый герой',
    raceName,
    className,
    level,
    visibility: draft.visibility,
    hitDie,
  })

  /* ---------- характеристики и спасброски ---------- */

  const savingThrows = new Set<AbilityName>(
    (draft.cls?.saving_throw_proficiencies ?? [])
      .map(abilityFromAny)
      .filter((a): a is AbilityName => a !== null),
  )
  if (savingThrows.size === 0) {
    for (const a of savingThrowsFallback(className)) savingThrows.add(a)
  }

  for (const key of ABILITY_KEYS) {
    base.ability_scores[key] = {
      score: scores[key],
      saving_throw_proficient: savingThrows.has(key),
    }
  }
  base.proficiency_bonus = pb

  /* ---------- навыки ---------- */

  const chosenSkills = new Set<string>(draft.levels.flatMap((l) => l.skills))
  for (const key of skillKeysFromNames(draft.background?.skill_proficiencies)) {
    chosenSkills.add(key)
  }
  for (const key of chosenSkills) {
    const entry = base.skills[key]
    if (entry) base.skills[key] = { ...entry, proficient: true }
  }

  /* ---------- бой ---------- */

  const dexMod = abilityMod(scores.dexterity)
  const wisMod = abilityMod(scores.wisdom)
  base.combat.hit_points.max = maxHitPoints(draft, hitDie, scores.constitution)
  base.combat.hit_points.current = base.combat.hit_points.max
  base.combat.hit_dice = { total: `${level}d${hitDie}`, remaining: level }
  base.combat.speed = (draft.race?.speed ?? 30) + (draft.subrace?.speed_bonus ?? 0)
  base.combat.initiative = dexMod
  base.combat.passive_perception =
    10 + wisMod + (base.skills.perception?.proficient ? pb : 0)

  /* ---------- владения ---------- */

  base.proficiencies = {
    armor: uniqueStrings(draft.cls?.armor_proficiencies ?? []),
    weapons: uniqueStrings(draft.cls?.weapon_proficiencies ?? []),
    tools: uniqueStrings(draft.background?.tool_proficiencies ?? []),
    languages: uniqueStrings([
      ...(draft.race?.languages ?? []),
      ...(draft.subrace?.extra_languages ?? []),
      ...(draft.background?.languages ?? []),
    ]),
  }

  /* ---------- стартовое снаряжение: инвентарь, доспех, атаки ---------- */

  const gear = resolveGear(draft, equipmentIndex)
  // ручной инвентарь с итога (если ещё актуален) — вместо стартового набора
  const custom = customInventory(draft)
  const worn = wornDefense(
    custom ? custom.flatMap((it) => (it.equipment ? [it.equipment] : [])) : gear.items.map((g) => g.eq),
    className,
    scores,
  )
  base.combat.armor_class = worn.ac
  base.combat.shield = worn.shield !== null

  const slotOf = (eq: Equipment | null) => (eq === worn.armor ? 'armor' : eq === worn.shield ? 'shield' : null)
  const items = custom
    ? custom.map((it) => {
        const slot = slotOf(it.equipment)
        return { ...it, equipped: slot !== null, equip_slot: slot }
      })
    : gear.items.map(({ eq, quantity }, i) => {
        const slot = slotOf(eq)
        return inventoryItem(eq, quantity, i, { equipped: slot !== null, slot })
      })
  base.inventory = {
    ...base.inventory,
    items,
    currency: { ...base.inventory.currency, ...gear.currency },
  }
  base.attacks = items
    .map((it) =>
      it.equipment
        ? weaponAttack(it.equipment, it.instance_id, scores, pb, base.proficiencies.weapons)
        : null,
    )
    .filter((a): a is NonNullable<typeof a> => a !== null)

  /* ---------- умения ---------- */

  const subclassName = draft.subclass?.subclass_name ?? null
  const features: SheetFeature[] = [
    ...classFeatures
      .filter((f) => f.level <= level)
      .map((f) => toSheetFeature(f, 'class', draft.cls?.id ?? null, className)),
    ...subclassFeatures
      .filter((f) => f.level <= level)
      .map((f) => toSheetFeature(f, 'subclass', draft.subclass?.id ?? null, subclassName ?? className)),
  ]

  if (draft.subrace?.traits) {
    features.push({
      name: `Особенности: ${draft.subrace.subrace_name}`,
      source: 'subrace',
      level: 1,
      description: cleanDescription(draft.subrace.traits),
      feature_source: draft.subrace.id,
    })
  }
  if (draft.background?.feature_name) {
    features.push({
      name: draft.background.feature_name,
      source: 'background',
      level: 1,
      description: cleanDescription(draft.background.feature_description),
      feature_source: draft.background.id,
    })
  }
  base.features = features
  // сервер хранит черты по UUID; названия — в каталоге
  base.feats = uniqueStrings(draft.levels.map((l) => l.featId))

  /* ---------- заклинания ---------- */

  const kind = casterKind(className, draft.cls?.is_caster)
  if (kind !== 'none') {
    const ability = spellcastingAbility(className)
    const mod = ability ? abilityMod(scores[ability]) : 0
    const pickedCantrips = draft.levels.flatMap((l) => l.cantrips)
    const pickedSpells = draft.levels.flatMap((l) => l.spells)
    const pickedIds = new Set(pickedSpells.map((s) => s.id))
    const preparedIds = new Set(draft.preparedSpells.map((s) => s.id))

    const known: SpellKnown[] = [
      ...pickedCantrips.map((s) => ({
        name: s.spell_name,
        level: 0,
        prepared: true,
        spell_source: s.spell_source ?? null,
        snapshot: null,
      })),
      ...pickedSpells.map((s) => ({
        name: s.spell_name,
        level: s.spell_level,
        // у волшебника книга ≠ подготовленные: отмечено на шаге «Заклинания»
        prepared: !isPreparedCaster(className) || preparedIds.has(s.id),
        spell_source: s.spell_source ?? null,
        snapshot: null,
      })),
      // жрец, друид, паладин, изобретатель готовят из всего списка класса
      ...draft.preparedSpells
        .filter((s) => !pickedIds.has(s.id))
        .map((s) => ({
          name: s.spell_name,
          level: s.spell_level,
          prepared: true,
          spell_source: s.spell_source ?? null,
          snapshot: null,
        })),
    ]

    base.spellcasting = {
      is_spellcaster: true,
      spellcasting_ability: ability,
      spell_save_dc: ability ? 8 + pb + mod : null,
      spell_attack_bonus: ability ? pb + mod : null,
      spell_slots: spellSlotBlocks(kind, level),
      spells_known: known,
      cantrips_amount: Math.max(cantripsAt(className, level), pickedCantrips.length),
      prepared_spells_max: preparedSpellsMax(className, level, mod),
    }
  }

  // дарованные расой и подклассом — всегда «подготовлены»; у не-заклинателей
  // (тёмный эльф-воин) это единственные заклинания листа
  const have = new Set(base.spellcasting.spells_known.map((s) => s.name))
  for (const g of granted) {
    if (g.level > level || have.has(g.spell.spell_name)) continue
    have.add(g.spell.spell_name)
    base.spellcasting.spells_known.push({
      name: g.spell.spell_name,
      level: g.spell.spell_level,
      prepared: true,
      spell_source: g.spell.spell_source ?? null,
      snapshot: { granted: g.origin, from: g.from, from_level: g.level, spell_id: g.spell.id },
    })
  }

  /* ---------- шапка листа ---------- */

  base.basic_info.race = {
    name: raceName,
    source: draft.race?.id ?? null,
    size: draft.race?.size ?? null,
    speed: base.combat.speed,
    darkvision: draft.subrace?.darkvision_override ?? draft.race?.darkvision ?? null,
    languages: draft.race?.languages ?? [],
    increase_ability_scores: draft.race?.increase_ability_scores ?? {},
  }
  base.basic_info.subrace = draft.subrace
    ? {
        name: draft.subrace.subrace_name,
        source: draft.subrace.id,
        increase_ability_scores: draft.subrace.increase_ability_scores ?? {},
      }
    : null
  base.basic_info.background = draft.background
    ? { name: draft.background.background_name, source: draft.background.id }
    : null
  base.basic_info.classes = [
    {
      name: className,
      level,
      hit_die: hitDie,
      is_caster: kind !== 'none',
      subclass_name: subclassName,
      subclass_source: draft.subclass?.id ?? null,
      source: draft.cls?.id ?? null,
      spellcasting_ability: spellcastingAbility(className),
    },
  ]
  base.basic_info.total_level = level
  base.basic_info.alignment = draft.alignment
  base.basic_info.avatar_url = draft.avatarUrl.trim() || null
  base.basic_info.player_display_name = playerDisplayName ?? null
  base.basic_info.gender = draft.gender
  base.basic_info.height = draft.height
  base.basic_info.weight = draft.weight
  base.basic_info.eyes = draft.eyes
  base.basic_info.hair = draft.hair
  base.basic_info.skin = draft.skin
  const age = parseInt(draft.age, 10)
  base.basic_info.age = Number.isNaN(age) ? null : age

  base.personality = {
    traits: draft.traits,
    ideals: draft.ideals,
    bonds: draft.bonds,
    flaws: draft.flaws,
  }
  base.backstory = draft.backstory

  return base
}
