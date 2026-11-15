/**
 * Канонические коды состояний, эффектов и видов урона — зеркало app/rules/codes.py.
 *
 * Логика (вид жетона, печати, подборщик состояний, панель отряда) смотрит на код,
 * подпись — только для показа и для своих эффектов мастера («Метка охотника»).
 * Старые эффекты приходят без кода: тогда код выводится из подписи (effectCode),
 * терпимо к регистру, «ё», окончаниям и синонимам.
 *
 * Таблица и примеры разбора общие с сервером: src/rules/codesParity.json здесь
 * и tests/rules/codes_parity.json на сервере (codes.test.ts сверяет).
 */

export type EffectKind = 'condition' | 'effect'

export interface EffectCodeDef {
  code: string
  ru: string
  en: string
  kind: EffectKind
  /** включает «недееспособен»: ни действий, ни реакций */
  incapacitating: boolean
}

const def = (code: string, ru: string, en: string, kind: EffectKind = 'condition', incapacitating = false): EffectCodeDef => ({ code, ru, en, kind, incapacitating })

export const EFFECTS: readonly EffectCodeDef[] = [
  def('blinded', 'Ослеплён', 'Blinded'),
  def('charmed', 'Очарован', 'Charmed'),
  def('deafened', 'Оглох', 'Deafened'),
  def('exhaustion', 'Истощение', 'Exhaustion'),
  def('frightened', 'Испуган', 'Frightened'),
  def('grappled', 'Схвачен', 'Grappled'),
  def('incapacitated', 'Недееспособен', 'Incapacitated', 'condition', true),
  def('invisible', 'Невидим', 'Invisible'),
  def('paralyzed', 'Парализован', 'Paralyzed', 'condition', true),
  def('petrified', 'Окаменел', 'Petrified', 'condition', true),
  def('poisoned', 'Отравлен', 'Poisoned'),
  def('prone', 'Сбит с ног', 'Prone'),
  def('restrained', 'Опутан', 'Restrained'),
  def('stunned', 'Ошеломлён', 'Stunned', 'condition', true),
  def('unconscious', 'Без сознания', 'Unconscious', 'condition', true),
  // не состояния 5e, но правила и вид жетона на них опираются
  def('concentration', 'Концентрация', 'Concentration', 'effect'),
  def('disengage', 'Отход', 'Disengage', 'effect'),
  def('dodge', 'Уклонение', 'Dodge', 'effect'),
  def('burning', 'Горит', 'Burning', 'effect'),
  def('blessed', 'Благословение', 'Blessed', 'effect'),
  def('hasted', 'Ускорение', 'Hasted', 'effect'),
  def('dead', 'Мёртв', 'Dead', 'effect'),
]

export const EFFECT_BY_CODE: Readonly<Record<string, EffectCodeDef>> = Object.fromEntries(EFFECTS.map((e) => [e.code, e]))

export const CONCENTRATION = 'concentration'

/** подписи целиком (после normalize) */
const EXACT: Record<string, string> = {
  ослепленный: 'blinded',
  слепота: 'blinded',
  очарованный: 'charmed',
  оглохший: 'deafened',
  глухота: 'deafened',
  истощен: 'exhaustion',
  испуганный: 'frightened',
  напуган: 'frightened',
  страх: 'frightened',
  схваченный: 'grappled',
  захвачен: 'grappled',
  недееспособный: 'incapacitated',
  невидимый: 'invisible',
  невидимость: 'invisible',
  'великая невидимость': 'invisible',
  'greater invisibility': 'invisible',
  invisibility: 'invisible',
  парализованный: 'paralyzed',
  паралич: 'paralyzed',
  окаменевший: 'petrified',
  окаменение: 'petrified',
  отравленный: 'poisoned',
  отравление: 'poisoned',
  'сбитый с ног': 'prone',
  'лежит ничком': 'prone',
  ничком: 'prone',
  опутанный: 'restrained',
  скован: 'restrained',
  обездвижен: 'restrained',
  ошеломленный: 'stunned',
  оглушен: 'stunned',
  оглушенный: 'stunned',
  бессознательный: 'unconscious',
  уклонение: 'dodge',
  горящий: 'burning',
  'в огне': 'burning',
  'on fire': 'burning',
  bless: 'blessed',
  haste: 'hasted',
  мертв: 'dead',
  убит: 'dead',
  погиб: 'dead',
}

/** начало подписи → код: «Отравлен ядом виверны», «Истощение 2», «Disengage (бонусное)» */
const STEMS: readonly [string, string][] = [
  ['ослепл', 'blinded'], ['blind', 'blinded'],
  ['очаров', 'charmed'], ['charm', 'charmed'],
  ['оглох', 'deafened'], ['deaf', 'deafened'],
  ['истощ', 'exhaustion'], ['exhaust', 'exhaustion'],
  ['испуг', 'frightened'], ['напуг', 'frightened'], ['fright', 'frightened'],
  ['схвач', 'grappled'], ['захвач', 'grappled'], ['grappl', 'grappled'],
  ['недееспособ', 'incapacitated'], ['incapacitat', 'incapacitated'],
  ['невидим', 'invisible'], ['invisib', 'invisible'],
  ['парализ', 'paralyzed'], ['paraly', 'paralyzed'],
  ['окамен', 'petrified'], ['petrif', 'petrified'],
  ['отравл', 'poisoned'], ['poison', 'poisoned'],
  ['сбит', 'prone'], ['лежит', 'prone'], ['лежащ', 'prone'], ['ничком', 'prone'], ['prone', 'prone'],
  ['опута', 'restrained'], ['скова', 'restrained'], ['обездвиж', 'restrained'], ['restrain', 'restrained'],
  ['ошелом', 'stunned'], ['оглуш', 'stunned'], ['stun', 'stunned'],
  ['без созн', 'unconscious'], ['бессознат', 'unconscious'], ['unconscious', 'unconscious'],
  ['концентрац', 'concentration'], ['concentrat', 'concentration'],
  ['отход', 'disengage'], ['disengag', 'disengage'],
  ['уклонен', 'dodge'], ['dodg', 'dodge'],
  ['горит', 'burning'], ['горящ', 'burning'], ['подожж', 'burning'], ['охвачен огн', 'burning'],
  ['пылает', 'burning'], ['burning', 'burning'], ['ablaze', 'burning'],
  ['благослов', 'blessed'], ['blessed', 'blessed'],
  ['ускорен', 'hasted'], ['hasted', 'hasted'],
  ['мертв', 'dead'], ['dead', 'dead'],
]

/** нижний регистр, «ё» → «е», без кавычек и лишних пробелов */
export function normalize(text: unknown): string {
  return String(text ?? '')
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[ .,;!]+|[ .,;!]+$/g, '')
}

const BY_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = { ...EXACT }
  for (const e of EFFECTS) for (const k of [e.ru, e.en, e.code]) out[normalize(k)] ??= e.code
  return out
})()

/** код эффекта по подписи; null — свой эффект без правил */
export function effectCode(label: unknown): string | null {
  const n = normalize(label)
  if (!n) return null
  if (BY_LABEL[n]) return BY_LABEL[n]
  // «Парализован (Удержание личности)», «Истощение: 2» — смотрим на голову подписи
  const head = n.split(/\s*[(:—–-]\s*|\s+\d/)[0].trim()
  if (BY_LABEL[head]) return BY_LABEL[head]
  return STEMS.find(([stem]) => n.startsWith(stem))?.[1] ?? null
}

/** эффект в том виде, в каком его шлёт сервер */
export interface EffectRef {
  label: string
  code?: string | null
}

/** код эффекта: явный (сервер), иначе из подписи (старые данные) */
export const codeOf = (e: EffectRef | string): string | null => (typeof e === 'string' ? effectCode(e) : e.code || effectCode(e.label))

export const isIncapacitated = (list: readonly (EffectRef | string)[]) => list.some((e) => EFFECT_BY_CODE[codeOf(e) ?? '']?.incapacitating === true)

/** «Концентрация: Невидимость» → «Невидимость» */
export function concentrationSpell(label: string): string {
  const at = label.indexOf(':')
  return at >= 0 && effectCode(label.slice(0, at)) === CONCENTRATION ? label.slice(at + 1).trim() : ''
}

/** подпись по коду: русская для показа, английская — на будущее */
export const effectLabel = (code: string, lang: 'ru' | 'en' = 'ru') => EFFECT_BY_CODE[code]?.[lang] ?? code

/* ---------- виды урона ---------- */

export interface DamageCodeDef {
  code: string
  ru: string
  en: string
}

export const DAMAGE_TYPES: readonly DamageCodeDef[] = [
  { code: 'acid', ru: 'Кислота', en: 'Acid' },
  { code: 'bludgeoning', ru: 'Дробящий', en: 'Bludgeoning' },
  { code: 'cold', ru: 'Холод', en: 'Cold' },
  { code: 'fire', ru: 'Огонь', en: 'Fire' },
  { code: 'force', ru: 'Силовое поле', en: 'Force' },
  { code: 'lightning', ru: 'Электричество', en: 'Lightning' },
  { code: 'necrotic', ru: 'Некротическая', en: 'Necrotic' },
  { code: 'piercing', ru: 'Колющий', en: 'Piercing' },
  { code: 'poison', ru: 'Яд', en: 'Poison' },
  { code: 'psychic', ru: 'Психическая', en: 'Psychic' },
  { code: 'radiant', ru: 'Излучение', en: 'Radiant' },
  { code: 'slashing', ru: 'Рубящий', en: 'Slashing' },
  { code: 'thunder', ru: 'Звук', en: 'Thunder' },
]

const DAMAGE_ALIASES: Record<string, string> = {
  дробящий: 'bludgeoning',
  колющий: 'piercing',
  рубящий: 'slashing',
  гром: 'thunder',
  громовой: 'thunder',
  звук: 'thunder',
  звуковой: 'thunder',
  излучение: 'radiant',
  кислота: 'acid',
  кислотный: 'acid',
  некротическая: 'necrotic',
  некротический: 'necrotic',
  огонь: 'fire',
  огненный: 'fire',
  холод: 'cold',
  электричество: 'lightning',
  молния: 'lightning',
  яд: 'poison',
  психическая: 'psychic',
  психический: 'psychic',
  'силовое поле': 'force',
  сила: 'force',
  силовой: 'force',
}

const DAMAGE_BY_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(DAMAGE_ALIASES)) out[normalize(k)] = v
  for (const d of DAMAGE_TYPES) for (const k of [d.ru, d.en, d.code]) out[normalize(k)] ??= d.code
  return out
})()

/** вид урона по коду, русскому или английскому названию; иначе null */
export const damageCode = (text: unknown): string | null => DAMAGE_BY_LABEL[normalize(text)] ?? null
