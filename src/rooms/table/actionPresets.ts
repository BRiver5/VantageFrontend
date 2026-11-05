/**
 * Заготовки для панели действия в бою: оружие героя (с картинкой из
 * инвентаря), действия существа, заклинания героя. У заклинаний в каталоге
 * урон, лечение и спасбросок записаны только текстом, поэтому их достаём
 * из описания — это подсказка, поля после выбора можно поправить.
 */
import { realImage, type EngineDictionaries, type Spell, type SpellMechanics } from '../../api'
import { normSpellName } from '../../spellIndex'
import type { AttackEntry, CharacterInventory, SpellKnown } from '../../types/character'
import type { StatKey } from '../../types/rooms'

export const normDice = (s: string) => s.replace(/[кk]/gi, 'd').replace(/\s+/g, '')

export interface Preset {
  key: string
  name: string
  bonus: number | null
  dice: string
  type: string
  /** картинка оружия из инвентаря */
  image?: string | null
  look: 'melee' | 'ranged' | 'spell' | 'beast'
  /** сохранён игроком прямо из боя */
  custom?: boolean
  /* только у заклинаний */
  level?: number
  heal?: string
  save?: { ability: StatKey; half: boolean } | null
  /** «на себя»: цель — сам заклинатель */
  self?: boolean
  school?: string | null
  /** заклинание на концентрации */
  conc?: boolean
  /** цель повторяет спасбросок в конце своих ходов: эффект «до успешного спасброска» */
  saveEnds?: StatKey | null
  /** бонусным действием */
  bonusAction?: boolean
  /** механика с сервера: есть — заклинание творит сервер, а не формула клиента */
  mech?: SpellMechanics | null
  /** имя заклинания в каталоге: его ждёт POST /cast */
  spellName?: string
}

/** Тип урона в словаре движка по подписи («огненный», «огонь») или значению */
export function damageTypeOf(raw: string | null | undefined, dict: EngineDictionaries | null): string {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s || !dict) return ''
  const direct = dict.damage_types.find((t) => t.value === s || t.label.toLowerCase() === s)
  if (direct) return direct.value
  return typeFromText(s, dict)
}

/** Как тип урона пишут в тексте → с чего начинается его подпись в словаре */
const TYPE_STEMS: [RegExp, string[]][] = [
  [/огн|огон|пламен/, ['огон', 'огн']],
  [/холод|мороз|лед|лёд/, ['холод']],
  [/кислот/, ['кислот']],
  [/молни|электр/, ['электр', 'молни']],
  [/звук|гром/, ['звук', 'гром']],
  [/яд/, ['яд']],
  [/некрот/, ['некрот']],
  [/излуч|свет|сиян/, ['излуч', 'свет']],
  [/псих/, ['псих']],
  [/силов/, ['силов']],
  [/колющ/, ['колющ']],
  [/рубящ/, ['рубящ']],
  [/дробящ/, ['дробящ']],
]

function typeFromText(text: string, dict: EngineDictionaries): string {
  for (const [re, prefixes] of TYPE_STEMS) {
    if (!re.test(text)) continue
    const hit = dict.damage_types.find((t) => prefixes.some((p) => t.label.toLowerCase().startsWith(p)))
    if (hit) return hit.value
  }
  return ''
}

/* ---------- оружие героя ---------- */

export function attackPresets(attacks: AttackEntry[], inventory: CharacterInventory | null | undefined, dict: EngineDictionaries | null, custom: Set<string>): Preset[] {
  const items = inventory?.items ?? []
  const byId = new Map(items.map((it) => [it.instance_id, it]))
  const byName = (name: string) => items.find((it) => (it.equipment?.equipment_name ?? it.magic_item?.item_name ?? '').toLowerCase() === name.toLowerCase())
  return attacks.map((a, i) => {
    const it = (a.inventory_instance_id ? byId.get(a.inventory_instance_id) : undefined) ?? byName(a.name)
    const image = realImage(it?.equipment?.equipment_image_gallery) ?? realImage(it?.magic_item?.item_image_gallery)
    return {
      key: `atk-${i}-${a.name}`,
      name: a.name,
      bonus: a.attack_bonus,
      dice: normDice(a.damage ?? ''),
      type: damageTypeOf(a.damage_type, dict),
      image,
      look: a.type === 'ranged' ? 'ranged' : a.type === 'spell' ? 'spell' : 'melee',
      custom: custom.has(a.name),
    }
  })
}

/* ---------- действия существа ---------- */

/** Из текста действия существа: «+4 к попаданию… 4 (1к4+2) дробящего урона» */
export function presetFromText(name: string, text: string, dict: EngineDictionaries | null): Preset | null {
  const bonus = /([+-]\s*\d+)\s*к\s*попаданию/i.exec(text)
  const dmg = /\((\d+\s*[кd]\s*\d+(?:\s*[+-]\s*\d+)?)\)\s*([а-яё]+)?/i.exec(text)
  if (!bonus && !dmg) return null
  const type = dmg?.[2] && dict ? typeFromText(dmg[2].toLowerCase(), dict) : ''
  return { key: `act-${name}`, name, bonus: bonus ? Number(bonus[1].replace(/\s/g, '')) : null, dice: dmg ? normDice(dmg[1]) : '', type, look: 'beast' }
}

/* ---------- заклинания ---------- */

const SAVE_OF: Record<string, StatKey> = { сил: 'str', лов: 'dex', тел: 'con', инт: 'int', муд: 'wis', хар: 'cha' }
const DICE_RE = /(\d+)\s*[кkd]\s*(\d+)(\s*\+\s*(?:\d+|ваш\s+модификатор[а-яё ]*|модификатор[а-яё ]*))?/gi

export interface CasterHints {
  /** бонус атаки заклинанием */
  attack?: number
  /** модификатор базовой характеристики: его добавляют к лечению */
  mod?: number
  /** уровень героя: от него растут заговоры */
  level: number
}

export function spellPreset(known: SpellKnown, spell: Spell | undefined, hints: CasterHints, dict: EngineDictionaries | null): Preset {
  const base: Preset = { key: `sp-${known.name}`, name: known.name, bonus: null, dice: '', type: '', look: 'spell', level: known.level, school: spell?.school ?? null, mech: spell?.mechanics ?? null, spellName: spell?.spell_name ?? known.name }
  const text = (spell?.description ?? '').replace(/\s+/g, ' ')
  if (!text) return base
  const low = text.toLowerCase()

  let dmg: string | null = null
  let heal: string | null = null
  let typeWin = ''
  for (const m of text.matchAll(DICE_RE)) {
    const at = m.index ?? 0
    const near = low.slice(Math.max(0, at - 70), at + m[0].length + 70)
    const plus = m[3] ? (/\d/.test(m[3]) ? `+${m[3].replace(/\D/g, '')}` : hints.mod ? `+${hints.mod}` : '') : ''
    const expr = `${m[1]}d${m[2]}${plus}`
    if (!dmg && /урон/.test(near)) {
      dmg = expr
      typeWin = low.slice(at, at + m[0].length + 50) + ' ' + low.slice(Math.max(0, at - 40), at)
    } else if (!heal && /хит/.test(near) && /восстан|лечит|получает/.test(near)) {
      heal = expr
    }
    if (dmg && heal) break
  }
  // заговор растёт на 5, 11 и 17 уровнях: столько же костей добавляется
  if (dmg && known.level === 0 && /17/.test(low)) {
    const tier = 1 + (hints.level >= 5 ? 1 : 0) + (hints.level >= 11 ? 1 : 0) + (hints.level >= 17 ? 1 : 0)
    dmg = dmg.replace(/^(\d+)/, (n) => String(Number(n) * tier))
  }
  const save = /спасброс[а-яё]*\s+(сил|лов|тел|инт|муд|хар)/i.exec(text)
  const attack = /атак[а-яё]*\s+(?:[а-яё]+\s+)?заклинани/i.test(text)
  // «в конце каждого своего хода цель повторяет спасбросок» — эффект снимается успехом
  const repeat = /в\s+конце\s+(?:каждого\s+)?(?:своего\s+|её\s+|его\s+)?хода[^.]{0,80}спасброс/i.test(text) || /повторн[а-яё]*\s+спасброс/i.test(text)
  return {
    ...base,
    dice: dmg ?? '',
    type: dmg && dict ? typeFromText(typeWin, dict) : '',
    heal: heal ?? undefined,
    bonus: attack && hints.attack != null ? hints.attack : null,
    save: save ? { ability: SAVE_OF[save[1].toLowerCase()], half: /половин/.test(low) } : null,
    self: /^\s*(на\s+)?себя|personal|self/i.test(spell?.range ?? ''),
    conc: !!spell?.concentration,
    saveEnds: repeat && save ? SAVE_OF[save[1].toLowerCase()] : null,
    bonusAction: /бонусн/i.test(spell?.casting_time ?? ''),
  }
}

/** Какие заклинания показывать: заговоры, подготовленные и дарованные */
export function castable(spells: SpellKnown[]): SpellKnown[] {
  const ready = spells.filter((s) => s.level === 0 || s.prepared || !!(s.snapshot as { granted?: string } | null)?.granted)
  const list = ready.length > 0 ? ready : spells
  return [...list].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ru'))
}

/** Заклинание каталога для известного: по id из снимка, иначе по имени */
export function spellLookup(catalog: Spell[]): (sp: SpellKnown) => Spell | undefined {
  const byId = new Map(catalog.map((s) => [s.id, s]))
  const byName = new Map(catalog.map((s) => [normSpellName(s.spell_name), s]))
  return (sp) => byId.get((sp.snapshot as { spell_id?: string } | null)?.spell_id ?? '') ?? byName.get(normSpellName(sp.name))
}

/* ---------- свои приёмы существ (у мастера, в браузере) ---------- */

const BEAST_KEY = (id: string) => `vantage-beast-presets:${id}`

export function loadBeastPresets(id: string): Preset[] {
  try {
    const raw = localStorage.getItem(BEAST_KEY(id))
    return raw ? (JSON.parse(raw) as Preset[]).map((p) => ({ ...p, custom: true })) : []
  } catch {
    return []
  }
}

export function saveBeastPresets(id: string, list: Preset[]) {
  try {
    localStorage.setItem(BEAST_KEY(id), JSON.stringify(list))
  } catch {
    /* хранилище недоступно — приём проживёт до перезагрузки */
  }
}
