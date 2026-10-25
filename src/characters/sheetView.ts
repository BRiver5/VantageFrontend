/**
 * Вид листа сохранённого героя: документ v2 (выбор игрока) + вычисленный лист
 * сервера. Все числа — из `sheet.values`; здесь их только раскладывают по
 * карточкам, ничего не пересчитывая. Названия расы, класса и предыстории в
 * документе больше нет — их подставляет каталог (`Names`).
 */
import { ABILITY_KEYS, ABILITY_SHORT, DEFAULT_SKILLS } from '../types/character'
import type {
  AbilityName,
  AttackEntry,
  Character,
  Contribution,
  EngineExtras,
  FeatureEntry,
  GrantedSpell,
  NaturalAttack,
  Sheet,
  SheetView,
  SpellKnown,
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
const SOURCES = new Set(['class', 'subclass', 'race', 'subrace', 'background', 'feat', 'choice', 'item'])
function featureSource(kind: string): FeatureEntry['source'] {
  return SOURCES.has(kind) ? (kind as FeatureEntry['source']) : 'other'
}

/** «snake_case» → «Snake case», когда в каталоге нет подписи */
const humanize = (key: string) => {
  const t = key.replace(/[._]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Значение var.* для показа: кубик, число, список */
function varText(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'string') return String(v)
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  if (Array.isArray(v)) return v.map(varText).join(', ')
  if (v && typeof v === 'object') {
    // кубик приходит объектом {n, sides} или {count, die}
    const o = v as Record<string, unknown>
    const n = o.n ?? o.count
    const sides = o.sides ?? o.die ?? o.s
    if (typeof n === 'number' && typeof sides === 'number') return `${n}к${sides}`
    return JSON.stringify(v)
  }
  return ''
}

/** Подписи состояний: сервер отдаёт английские ключи (poisoned, prone…) */
const label = (dict: { value: string; label: string }[] | undefined, key: string) =>
  dict?.find((d) => d.value === key)?.label ?? key

export function buildSheetView(
  character: Character,
  sheet: Sheet,
  names: Names,
  dict: EngineDictionaries | null,
  /** подписи переменных персонажа из каталога движка */
  labels: Record<string, string> = {},
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
    slug: a.slug,
    implementation_status: a.implementation_status,
    active: a.active,
    // отключённые игроком сервер отдаёт с enabled: false — в списке они приглушены
    disabled: a.enabled === false,
  }))
  // черта, за которой у движка нет умения, остаётся строкой из каталога
  const featSources = new Set(sheet.abilities.filter((a) => a.source_kind === 'feat').map((a) => a.source_id))
  const feats = character.feat_ids.filter((id) => !featSources.has(id))

  /* ---------- что выдают способности: атаки, заклинания, правила ---------- */

  const pb = num('char.pb', 2)
  const abilityMod = (ab: string | undefined) => num(`char.abilities.${ab ?? 'str'}.mod`)
  const raw = (path: string) => sheet.values[path]
  const natural = ((raw('char.attacks.natural') as NaturalAttack[] | undefined) ?? []).filter((a) => a && a.name)
  const naturalAttacks: AttackEntry[] = natural.map((a) => {
    const mod = abilityMod(a.ability)
    return {
      name: a.name,
      type: 'melee',
      attack_bonus: mod + pb,
      damage: a.dice ? `${a.dice}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}` : String(Math.max(1, 1 + mod)),
      damage_type: a.type ? label(dict?.damage_types, a.type) : '',
      range: '',
      properties: a.note ? [a.note] : [],
      inventory_instance_id: null,
    }
  })

  // дарованные заклинания — в книгу заклинаний рядом со своими
  const granted = ((raw('char.spells.granted') as GrantedSpell[] | undefined) ?? []).filter((g) => g && g.name)
  const ownSpells = new Set(character.spells.map((sp) => sp.name.toLocaleLowerCase('ru')))
  const grantedSpells: SpellKnown[] = granted
    .filter((g) => !ownSpells.has(g.name.toLocaleLowerCase('ru')))
    .map((g) => ({
      name: g.name,
      // круг неизвестен — книга возьмёт его из каталога заклинаний
      level: typeof g.level === 'number' ? g.level : -1,
      prepared: true,
      spell_source: null,
      snapshot: { granted: 'engine', uses: g.uses ?? null, note: g.note ?? null, ability: g.ability ?? null },
    }))

  /** Числовые значения с общим префиксом: char.dmg_bonus.melee_str → { melee_str: 2 } */
  const tagged = (prefix: string) =>
    Object.fromEntries(
      Object.entries(sheet.values)
        .filter(([path, v]) => path.startsWith(prefix) && typeof v === 'number' && v !== 0)
        .map(([path, v]) => [path.slice(prefix.length), v as number]),
    )

  const extras: EngineExtras = {
    perAction: num('char.attacks.per_action', 1),
    critMin: num('char.attacks.crit_min', 20),
    unarmedDie: num('char.attacks.unarmed_die', 1),
    maneuvers: list('char.maneuvers'),
    flags: Object.entries(sheet.values)
      .filter(([path, v]) => path.startsWith('char.flags.') && v !== false && v !== 0 && v != null && v !== '')
      .map(([path]) => ({ key: path.slice(11), label: labels[path] ?? humanize(path.slice(11)) })),
    vars: Object.entries(sheet.values)
      .filter(([path, v]) => path.startsWith('var.') && v != null && v !== '' && v !== false)
      .map(([path, v]) => ({ key: path.slice(4), label: labels[path] ?? humanize(path.slice(4)), value: varText(v) }))
      .filter((x) => x.value && x.value !== '0'),
    adv: { check: list('char.adv.check'), save: list('char.adv.save'), attack: list('char.adv.attack') },
    disadv: { check: list('char.disadv.check'), save: list('char.disadv.save'), attack: list('char.disadv.attack') },
    attackBonus: tagged('char.attack_bonus.'),
    dmgBonus: tagged('char.dmg_bonus.'),
  }

  const sourceNames = Object.fromEntries(sheet.abilities.map((a) => [a.slug, a.name]))

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
    attacks: [...character.attacks, ...naturalAttacks],
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
      spells_known: [...character.spells, ...grantedSpells],
      cantrips_amount: character.spells.filter((s) => s.level === 0).length,
      prepared_spells_max: null,
    },
    inventory: character.inventory,
    personality: character.personality,
    backstory: character.backstory,
    notes: character.notes,
    breakdown: sheet.breakdown,
    bases: sheet.bases,
    sourceNames,
    extras,
  }
}

/* ---------- «откуда число» ---------- */

const OP_SIGN: Record<string, string> = { add: '+', mul: '×', set: '=', base: 'база', candidate: 'вариант', max: '≥', min: '≤' }

/** Подпись источника вклада: slug способности, race:…, item:…, form:…, override */
function sourceLabel(source: string, names?: Record<string, string>): string {
  if (source === 'override') return 'правка мастера'
  if (source === 'core') return 'правила'
  if (names?.[source]) return names[source]
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

/** Вклад в число для поп-апа «откуда число» */
export interface WhyRow {
  /** race | subrace | class | background | feat | item | form | override | core | ability */
  kind: string
  label: string
  op: string
  /** число для add/mul/set…; null — значение не числовое (список, кубик) */
  value: number | null
  text: string
}

const SOURCE_KINDS = new Set(['race', 'subrace', 'class', 'subclass', 'background', 'feat', 'item', 'form'])

/** Вклады в значение по пути — для поп-апа; пустой список — расшифровки нет */
export function contributionsOf(
  breakdown: Record<string, Contribution[]> | undefined,
  path: string,
  names?: Record<string, string>,
): WhyRow[] {
  return (breakdown?.[path] ?? []).map((c) => {
    const prefix = c.source.includes(':') ? c.source.split(':')[0] : ''
    const kind = c.source === 'override' ? 'override' : c.source === 'core' ? 'core' : SOURCE_KINDS.has(prefix) ? prefix : 'ability'
    const label = names?.[c.source] ?? sourceLabel(c.source, names)
    return {
      kind,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      op: c.op,
      value: typeof c.value === 'number' ? c.value : null,
      text: formatValue(c.value),
    }
  })
}

/** Подсказка к числу из breakdown; undefined — расшифровки нет */
export function whyText(
  breakdown: Record<string, Contribution[]> | undefined,
  path: string,
  /** slug способности → название, иначе подпись из slug */
  names?: Record<string, string>,
): string | undefined {
  const parts = breakdown?.[path]
  if (!parts?.length) return undefined
  return parts
    .map((c) => {
      const op = OP_SIGN[c.op] ?? c.op
      return `${sourceLabel(c.source, names)}: ${op} ${formatValue(c.value)}`
    })
    .join('\n')
}

/** Путь значения характеристики в листе: abilityPath('strength', 'save') */
export const abilityPath = (k: AbilityName, field: 'score' | 'mod' | 'save') => `char.abilities.${ABILITY_SHORT[k]}.${field}`
