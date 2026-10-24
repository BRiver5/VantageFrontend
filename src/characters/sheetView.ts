/**
 * Вид листа сохранённого героя: документ v2 (выбор игрока) + вычисленный лист
 * сервера. Все числа — из `sheet.values`; здесь их только раскладывают по
 * карточкам, ничего не пересчитывая. Названия расы, класса и предыстории в
 * документе больше нет — их подставляет каталог (`Names`).
 */
import { ABILITY_KEYS, ABILITY_SHORT, DEFAULT_SKILLS } from '../types/character'
import type {
  AbilityName,
  Character,
  Contribution,
  FeatureEntry,
  Sheet,
  SheetView,
  SpellSlot,
} from '../types/character'
import type { EngineDictionaries, GameClass } from '../api'

/** Названия из каталога по id — документ хранит только ссылки */
export interface Names {
  race: (id: string) => string | null
  subrace: (id: string) => string | null
  background: (id: string) => string | null
  cls: (id: string) => GameClass | null
  subclass: (id: string) => string | null
  feat: (id: string) => string | null
}

const SHORT_TO_NAME = Object.fromEntries(
  Object.entries(ABILITY_SHORT).map(([long, short]) => [short, long]),
) as Record<string, AbilityName>

/** Читатели значений листа с запасным значением на случай пропуска */
export function valuesOf(sheet: Sheet) {
  const v = sheet.values
  const num = (path: string, fallback = 0): number => {
    const x = v[path]
    if (typeof x === 'number') return x
    if (typeof x === 'boolean') return x ? 1 : 0
    return fallback
  }
  const list = (path: string): string[] => {
    const x = v[path]
    return Array.isArray(x) ? x.map(String) : []
  }
  const str = (path: string): string | null => {
    const x = v[path]
    return typeof x === 'string' && x ? x : null
  }
  return { num, list, str, has: (path: string) => path in v }
}

/**
 * Slug-и классов персонажа в порядке `character.classes`. Сервер регистрирует
 * кости хитов только для классов героя, в том же порядке; slug из каталога,
 * если он есть, надёжнее.
 */
export function classSlugs(character: Character, sheet: Sheet, names: Names): string[] {
  const fromSheet = Object.keys(sheet.values)
    .map((k) => /^char\.hit_dice\.([^.]+)\.max$/.exec(k)?.[1])
    .filter((s): s is string => !!s)
  return character.classes.map((cl, i) => names.cls(cl.class_id)?.slug ?? fromSheet[i] ?? `class_${i}`)
}

/** source_kind движка → группа на странице умений */
function featureSource(kind: string): FeatureEntry['source'] {
  return kind === 'class' || kind === 'subclass' || kind === 'race' || kind === 'subrace' || kind === 'background' || kind === 'feat'
    ? kind
    : 'other'
}

/** Подписи состояний: сервер отдаёт английские ключи (poisoned, prone…) */
const label = (dict: { value: string; label: string }[] | undefined, key: string) =>
  dict?.find((d) => d.value === key)?.label ?? key

export function buildSheetView(
  character: Character,
  sheet: Sheet,
  names: Names,
  dict: EngineDictionaries | null,
): SheetView {
  const { num, list, str, has } = valuesOf(sheet)
  const slugs = classSlugs(character, sheet, names)

  /* ---------- характеристики и навыки ---------- */

  const ability_scores = Object.fromEntries(
    ABILITY_KEYS.map((k) => {
      const p = `char.abilities.${ABILITY_SHORT[k]}`
      return [
        k,
        {
          score: num(`${p}.score`, 10),
          saving_throw_proficient: num(`${p}.save_prof`) > 0,
          modifier: num(`${p}.mod`),
          save: num(`${p}.save`, num(`${p}.mod`)),
        },
      ]
    }),
  ) as SheetView['ability_scores']

  const skills: SheetView['skills'] = {}
  for (const s of DEFAULT_SKILLS) {
    const p = `char.skills.${s.key}`
    const prof = num(`${p}.prof`)
    skills[s.key] = {
      ability: SHORT_TO_NAME[str(`${p}.ability`) ?? ''] ?? s.ability,
      proficient: prof >= 1,
      expertise: prof >= 2,
      modifier: num(`${p}.bonus`),
      passive_score: num(`${p}.passive`, 10),
    }
  }

  /* ---------- классы и кости хитов ---------- */

  const classes = character.classes.map((cl, i) => {
    const slug = slugs[i]
    const cat = names.cls(cl.class_id)
    return {
      name: cat?.class_name ?? slug,
      level: cl.level,
      source: cl.class_id,
      subclass_name: cl.subclass_id ? names.subclass(cl.subclass_id) : null,
      subclass_source: cl.subclass_id,
      hit_die: num(`char.class.${slug}.hit_die`, cat?.hit_dice ?? 8),
      is_caster: has(`char.class.${slug}.spell_dc`),
      spellcasting_ability: str(`char.class.${slug}.spell_ability`),
    }
  })
  const hitDiceTotal = classes.map((c) => `${c.level}d${c.hit_die}`).join(' + ')
  const hitDiceLeft = slugs.reduce((sum, slug) => sum + num(`char.hit_dice.${slug}.current`), 0)

  /* ---------- магия: первый класс-заклинатель и ячейки ---------- */

  const casterSlug = slugs.find((s) => has(`char.class.${s}.spell_dc`)) ?? null
  const spell_slots: Record<string, SpellSlot> = {}
  for (const s of sheet.slots) {
    const key = String(s.level)
    const cur = spell_slots[key] ?? { max: 0, used: 0 }
    // ячейки договора складываются с обычными того же круга;
    // созданные сверх максимума (очки чародейства) — used уходит в минус
    spell_slots[key] = {
      max: cur.max + s.max,
      used: cur.used + (s.max - s.current),
      pact: s.pool === 'pact' && cur.max === 0 ? true : undefined,
    }
  }

  /* ---------- умения и черты ---------- */

  const features: FeatureEntry[] = sheet.abilities.map((a) => ({
    name: a.name,
    source: featureSource(a.source_kind),
    level: null,
    description: a.description,
    feature_source: a.source_id,
    grant_id: a.grant_id,
    implementation_status: a.implementation_status,
    active: a.active,
  }))
  // черта, за которой у движка нет умения, остаётся строкой из каталога
  const featSources = new Set(sheet.abilities.filter((a) => a.source_kind === 'feat').map((a) => a.source_id))
  const feats = character.feat_ids.filter((id) => !featSources.has(id))

  const raceName = character.race_id ? names.race(character.race_id) : null
  const conditions = list('char.conditions').map((c) => label(dict?.conditions, c))

  return {
    visibility: character.visibility,
    basic_info: {
      name: character.character_name,
      race: { name: raceName ?? '—', source: character.race_id, size: str('char.size'), speed: num('char.speed.walk') },
      subrace: character.subrace_id ? { name: names.subrace(character.subrace_id) ?? '—', source: character.subrace_id } : null,
      classes,
      total_level: num('char.level', classes.reduce((s, c) => s + c.level, 0)),
      background: character.background_id
        ? { name: names.background(character.background_id) ?? '—', source: character.background_id }
        : null,
      alignment: character.alignment ?? '',
      experience_points: num('char.xp', character.experience_points),
      gender: character.gender,
      age: character.age,
      height: character.height,
      weight: character.weight,
      eyes: character.eyes,
      skin: character.skin,
      hair: character.hair,
      avatar_url: character.avatar_url,
      player_display_name: character.player_display_name,
    },
    ability_scores,
    proficiency_bonus: num('char.pb', 2),
    skills,
    combat: {
      armor_class: num('char.ac', 10),
      initiative: num('char.init'),
      speed: num('char.speed.walk'),
      hit_points: { max: num('char.hp.max', 1), current: num('char.hp.current'), temp: num('char.hp.temp') },
      hit_dice: { total: hitDiceTotal, remaining: hitDiceLeft },
      death_saves: { successes: num('char.death_saves.success'), failures: num('char.death_saves.failure') },
      passive_perception: num('char.skills.perception.passive', 10),
      conditions,
      inspiration: num('char.inspiration') > 0,
      shield: num('char.armor.shield') > 0,
    },
    attacks: character.attacks,
    proficiencies: {
      armor: list('char.prof.armor'),
      weapons: list('char.prof.weapons'),
      tools: list('char.prof.tools'),
      languages: list('char.prof.languages'),
    },
    features,
    feats,
    spellcasting: {
      is_spellcaster: casterSlug !== null,
      spellcasting_ability: casterSlug ? (SHORT_TO_NAME[str(`char.class.${casterSlug}.spell_ability`) ?? ''] ?? null) : null,
      spell_save_dc: casterSlug ? num(`char.class.${casterSlug}.spell_dc`) : null,
      spell_attack_bonus: casterSlug ? num(`char.class.${casterSlug}.spell_attack`) : null,
      spell_slots,
      spells_known: character.spells,
      cantrips_amount: character.spells.filter((s) => s.level === 0).length,
      prepared_spells_max: null,
    },
    inventory: character.inventory,
    personality: character.personality,
    backstory: character.backstory,
    notes: character.notes,
    breakdown: sheet.breakdown,
  }
}

/* ---------- «откуда число» ---------- */

const OP_SIGN: Record<string, string> = { add: '+', mul: '×', set: '=', base: 'база', candidate: 'вариант', max: '≥', min: '≤' }

/** Подпись источника вклада: slug способности, race:…, item:…, form:…, override */
function sourceLabel(source: string): string {
  if (source === 'override') return 'правка мастера'
  if (source === 'core') return 'правила'
  const [kind, rest] = source.includes(':') ? source.split(/:(.*)/s) : ['', source]
  const name = (rest || source).replace(/^[a-z0-9]+\./, '').replace(/[._]/g, ' ')
  const kinds: Record<string, string> = { race: 'раса', subrace: 'подраса', item: 'предмет', form: 'облик', class: 'класс', feat: 'черта' }
  return kind ? `${kinds[kind] ?? kind}: ${name}` : name
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.join(', ')
  if (v && typeof v === 'object') return JSON.stringify(v)
  return String(v ?? '')
}

/** Подсказка к числу из breakdown; undefined — расшифровки нет */
export function whyText(breakdown: Record<string, Contribution[]> | undefined, path: string): string | undefined {
  const parts = breakdown?.[path]
  if (!parts?.length) return undefined
  return parts
    .map((c) => {
      const op = OP_SIGN[c.op] ?? c.op
      return `${sourceLabel(c.source)}: ${op} ${formatValue(c.value)}`
    })
    .join('\n')
}

/** Путь значения характеристики в листе: abilityPath('strength', 'save') */
export const abilityPath = (k: AbilityName, field: 'score' | 'mod' | 'save') => `char.abilities.${ABILITY_SHORT[k]}.${field}`
