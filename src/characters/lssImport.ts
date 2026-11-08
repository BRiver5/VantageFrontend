/**
 * Импорт персонажей из Long Story Short (longstoryshort.app, «Мои персонажи» →
 * экспорт JSON). Файл — массив записей, лист в каждой лежит строкой JSON в
 * поле `data`; тексты — документы ProseMirror.
 *
 * Твёрдых ссылок на наш каталог в LSS нет: класс, расу, предысторию, черты
 * и снаряжение ищем нечётким поиском сервера по названию (и английскому id
 * LSS, если он есть). Совпадение по названию берём сразу, по описанию —
 * только подсказкой, решает игрок. Всё, чему нет места в нашем листе,
 * уходит в заметки, чтобы ничего не потерялось.
 */
import { ApiError, createCharacter, getCharacter, getOne, getSheet, levelUp, request, resolvePending, updateCharacter, type Equipment, type Item } from '../api'
import { inventoryItem, magicInventoryItem } from '../create/startingGear'
import { DEFAULT_SKILLS, type AbilityKey, type AttackEntry, type CharacterInput, type InventoryItemInstance, type Prompt } from '../types/character'

/* ---------- разбор файла ---------- */

type PM = { type?: string; text?: string; content?: PM[]; attrs?: Record<string, unknown>; marks?: { type: string }[] }
type Val<T> = { value?: T } | undefined

export interface LssHero {
  key: string
  name: string
  edition: string
  classes: { name: string; id: string | null; level: number }[]
  subclass: { name: string; id: string | null } | null
  race: { name: string; id: string | null } | null
  subrace: { name: string; id: string | null } | null
  background: { name: string; id: string | null } | null
  level: number
  xp: number
  alignment: string
  info: { age: string; height: string; weight: string; eyes: string; skin: string; hair: string }
  scores: Record<AbilityKey, number>
  /** наши ключи навыков с владением */
  skills: string[]
  expertise: string[]
  hp: { max: number; current: number }
  ac: number | null
  speed: number | null
  weapons: { name: string; dmg: string; ability: string; prof: boolean }[]
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
  feats: { name: string; hint: string | null }[]
  gear: { name: string; qty: number }[]
  magic: { name: string; qty: number }[]
  texts: Record<string, string>
  avatar: string | null
  spellsCount: number
}

/** Документ ProseMirror → текст: абзацы строками, спойлеры — заголовок и тело */
export function pmText(doc: unknown): string {
  const out: string[] = []
  const walk = (n: PM | undefined, into: string[]) => {
    if (!n) return
    if (n.type === 'text') {
      into.push(n.text ?? '')
      return
    }
    if (n.type === 'resource') return
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'spoilerSummary' || n.type === 'listItem') {
      const line: string[] = []
      for (const c of n.content ?? []) walk(c, line)
      out.push(line.join('').trim())
      return
    }
    for (const c of n.content ?? []) walk(c, into)
  }
  const root = (doc as { data?: PM } | null)?.data ?? (doc as PM)
  if (root && typeof root === 'object') walk(root, out)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Названия черт: первые строки абзацев и заголовки спойлеров; id LSS — подсказка */
function featNames(doc: unknown): { name: string; hint: string | null }[] {
  const root = (doc as { data?: PM } | null)?.data
  const found = new Map<string, string | null>()
  const visit = (n: PM | undefined) => {
    if (!n) return
    if (n.type === 'spoiler') {
      const summary = n.content?.find((c) => c.type === 'spoilerSummary')
      const name = pmText({ data: summary }).trim()
      const block = typeof n.attrs?.blockId === 'string' ? (n.attrs.blockId as string) : null
      if (name) found.set(name, block && block !== 'all' ? block.replace(/-/g, ' ') : null)
      return
    }
    if (n.type === 'paragraph') {
      const t = pmText({ data: n }).trim()
      if (t && t.length <= 60 && !/[.:]$/.test(t)) for (const part of t.split(/[,;]/)) if (part.trim() && !found.has(part.trim())) found.set(part.trim(), null)
      return
    }
    for (const c of n.content ?? []) visit(c)
  }
  visit(root)
  return [...found].map(([name, hint]) => ({ name, hint }))
}

const NUM_WORDS: Record<string, number> = { один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 }
/** «Священный символ, 5 палочек благовоний, 10 дротиков» → предметы с количеством */
export function splitGear(text: string): { name: string; qty: number }[] {
  return text
    .split(/[,;\n•]+|\s+и\s+(?=\d)/)
    .map((s) => s.replace(/^[-–—*\s]+/, '').trim())
    .filter((s) => s.length > 1)
    .map((s) => {
      const m = /^(\d+)\s*(?:x|х|шт\.?)?\s+(.+)$/i.exec(s) ?? /^(.+?)\s*[x×х]\s*(\d+)$/i.exec(s)
      if (m) return /^\d/.test(m[1]) ? { name: m[2].trim(), qty: Number(m[1]) } : { name: m[1].trim(), qty: Number(m[2]) }
      const w = /^(\S+)\s+(.+)$/.exec(s)
      if (w && NUM_WORDS[w[1].toLowerCase()]) return { name: w[2].trim(), qty: NUM_WORDS[w[1].toLowerCase()] }
      return { name: s, qty: 1 }
    })
}

const SKILL_KEYS = new Map(DEFAULT_SKILLS.map((s) => [s.key.replace(/_/g, ' '), s.key]))

/** «Монах(4)», «Воин 3 / Плут 2», «Чародей» → классы с уровнями */
function parseClasses(raw: string, id: string | null, total: number): LssHero['classes'] {
  const parts = raw
    .split(/[/,;+]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return []
  const list = parts.map((p) => {
    const m = /^(.+?)\s*[([]?\s*(\d{1,2})\s*[)\]]?$/.exec(p)
    return m ? { name: m[1].trim(), id: null as string | null, level: Number(m[2]) } : { name: p, id: null as string | null, level: 0 }
  })
  if (list.length === 1) {
    list[0].id = id
    if (!list[0].level) list[0].level = Math.max(1, total)
  } else {
    const known = list.reduce((s, c) => s + c.level, 0)
    for (const c of list) if (!c.level) c.level = Math.max(1, total - known)
  }
  return list
}

export function parseLss(fileText: string): LssHero[] {
  const raw = JSON.parse(fileText) as unknown
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .map((entry, i) => {
      const e = entry as { data?: string | Record<string, unknown>; edition?: string; spells?: { book?: unknown[] } }
      const d = (typeof e.data === 'string' ? JSON.parse(e.data) : (e.data ?? entry)) as Record<string, unknown>
      const info = (d.info ?? {}) as Record<string, { value?: unknown; id?: string }>
      const sub = (d.subInfo ?? {}) as Record<string, Val<string>>
      const stats = (d.stats ?? {}) as Record<string, { score?: number }>
      const skills = (d.skills ?? {}) as Record<string, { isProf?: number | boolean }>
      const vit = (d.vitality ?? {}) as Record<string, Val<number>>
      const text = (d.text ?? {}) as Record<string, { value?: unknown }>
      const coins = (d.coins ?? {}) as Record<string, Val<number>>
      const str = (v: unknown) => (v == null ? '' : String(v)).trim()
      const opt = (k: string) => {
        const v = info[k]
        const name = str(v?.value)
        return name || v?.id ? { name, id: v?.id ? String(v.id) : null } : null
      }
      const level = Number(info.level?.value) || 1
      const texts: Record<string, string> = {}
      for (const [k, v] of Object.entries(text)) {
        const t = pmText(v?.value)
        if (t) texts[k] = t
      }
      const prof = (k: string) => skills[k]?.isProf
      const avatar = (d.avatar as { jpeg?: string; webp?: string } | undefined) ?? null
      const weapons = ((d.weaponsList ?? []) as { name?: Val<string>; dmg?: Val<string>; ability?: string; isProf?: boolean }[])
        .map((w) => ({ name: str(w.name?.value), dmg: str(w.dmg?.value), ability: w.ability ?? 'str', prof: !!w.isProf }))
        .filter((w) => w.name)
      const hero: LssHero = {
        key: `lss-${i}`,
        name: str((d.name as Val<string>)?.value) || 'Герой из LSS',
        edition: str(e.edition ?? d.sheetEdition) || '2024',
        classes: parseClasses(str(info.charClass?.value), info.charClass?.id ? String(info.charClass.id) : null, level),
        subclass: opt('charSubclass'),
        race: opt('race'),
        subrace: opt('subrace'),
        background: opt('background'),
        level,
        xp: Number(info.experience?.value) || 0,
        alignment: str(info.alignment?.value),
        info: { age: str(sub.age?.value), height: str(sub.height?.value), weight: str(sub.weight?.value), eyes: str(sub.eyes?.value), skin: str(sub.skin?.value), hair: str(sub.hair?.value).replace(/^-$/, '') },
        scores: Object.fromEntries((['str', 'dex', 'con', 'int', 'wis', 'cha'] as AbilityKey[]).map((k) => [k, Number(stats[k]?.score) || 10])) as Record<AbilityKey, number>,
        skills: Object.keys(skills).filter((k) => prof(k)).map((k) => SKILL_KEYS.get(k) ?? k.replace(/\s+/g, '_')),
        expertise: Object.keys(skills).filter((k) => Number(prof(k)) >= 2).map((k) => SKILL_KEYS.get(k) ?? k.replace(/\s+/g, '_')),
        hp: { max: Number(vit['hp-max']?.value) || 0, current: Number(vit['hp-current']?.value) || 0 },
        ac: Number(vit.ac?.value) || null,
        speed: Number(vit.speed?.value) || null,
        weapons,
        coins: { cp: Number(coins.cp?.value) || 0, sp: Number(coins.sp?.value) || 0, ep: Number(coins.ep?.value) || 0, gp: Number(coins.gp?.value) || 0, pp: Number(coins.pp?.value) || 0 },
        feats: featNames(text.feats?.value),
        gear: splitGear(texts.equipment ?? ''),
        magic: splitGear(texts.items ?? ''),
        texts,
        avatar: avatar?.jpeg ?? avatar?.webp ?? null,
        spellsCount: Array.isArray(e.spells?.book) ? e.spells!.book!.length : 0,
      }
      return hero
    })
    .filter((h) => h.name)
}

/* ---------- сопоставление с каталогом ---------- */

export interface Candidate {
  id: string
  title: string
  /** где совпало: название, синоним или только описание */
  match: string
  score: number
  sure: boolean
}

interface SearchHit {
  id: string
  title: string
  alias?: string | null
  search?: { match?: string; score?: number }
  match?: string
  score?: number
}

/** Основы слов (первые 4–5 букв): «дротиков» → «дрот», чтобы падеж не мешал */
const stems = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3 && !['для', 'или'].includes(w))
    .map((w) => w.slice(0, Math.min(5, Math.max(3, w.length - 2))))
/** Название каталога покрывает все слова из LSS */
const covers = (query: string, title: string) => {
  const t = title.toLowerCase().replace(/ё/g, 'е')
  const ws = stems(query)
  return ws.length > 0 && ws.every((w) => t.includes(w))
}

/** Старые и народные названия → как в нашем каталоге */
const SYNONYMS: Record<string, string> = {
  служитель: 'Прислужник',
  послушник: 'Прислужник',
  'народный герой': 'Народный герой',
  беспризорник: 'Беспризорник',
  отшельник: 'Отшельник',
  'набор искателя приключений': 'Набор путешественника',
}

/**
 * Нечёткий поиск раздела; уверенно — совпадение по названию или синониму.
 * strict — для предметов: ещё и все слова из LSS должны быть в названии.
 * loose — запасные запросы (первое слово): их результат только «похоже».
 */
async function find(section: string, queries: (string | null | undefined)[], extra = '', opts: { strict?: boolean; loose?: number } = {}): Promise<Candidate[]> {
  const seen = new Map<string, Candidate>()
  const original = queries.find((q) => q?.trim())?.trim() ?? ''
  const syn = SYNONYMS[original.toLowerCase()]
  const list = syn ? [syn, ...queries] : queries
  for (let qi = 0; qi < list.length; qi++) {
    const query = list[qi]?.trim()
    if (!query) continue
    const isLoose = opts.loose != null && qi - (syn ? 1 : 0) >= opts.loose
    const res = await request<{ items: SearchHit[] }>(`/search/${section}?q=${encodeURIComponent(query)}&limit=5${extra}`).catch(() => null)
    for (const h of res?.items ?? []) {
      const match = h.match ?? h.search?.match ?? 'description'
      const score = h.score ?? h.search?.score ?? 0
      const sure = (match === 'title' || match === 'alias') && score >= 0.3 && !isLoose && (!opts.strict || covers(syn && qi === 0 ? syn : original, h.title))
      const prev = seen.get(h.id)
      if (!prev || score > prev.score) seen.set(h.id, { id: h.id, title: h.title, match, score, sure })
    }
    if ([...seen.values()].some((c) => c.sure)) break
  }
  return [...seen.values()].sort((a, b) => Number(b.sure) - Number(a.sure) || b.score - a.score).slice(0, 5)
}

/** Подклассы — фильтром по классу: список раздела с нечётким q */
async function findSubclass(classId: string, name: string): Promise<Candidate[]> {
  const res = await request<{ items: { id: string; subclass_name: string; search?: { match?: string; score?: number } }[] }>(
    `/subclasses?q=${encodeURIComponent(name)}&parent_class_id=${classId}&limit=5`,
  ).catch(() => null)
  return (res?.items ?? []).map((s) => {
    const match = s.search?.match ?? 'description'
    const score = s.search?.score ?? 0
    return { id: s.id, title: s.subclass_name, match, score, sure: (match === 'title' || match === 'alias') && score >= 0.3 }
  })
}

export interface Matched {
  classes: { lss: LssHero['classes'][number]; cands: Candidate[]; pick: string | null }[]
  subclass: { cands: Candidate[]; pick: string | null } | null
  race: { cands: Candidate[]; pick: string | null } | null
  subrace: { cands: Candidate[]; pick: string | null } | null
  background: { cands: Candidate[]; pick: string | null } | null
  feats: { lss: string; cands: Candidate[]; pick: string | null }[]
  gear: { lss: { name: string; qty: number }; kind: 'equipment' | 'items'; cands: Candidate[]; pick: string | null }[]
}

const auto = (cands: Candidate[]) => cands.find((c) => c.sure)?.id ?? null
// английские id LSS («sorcerer», «soldier», «dwarf») ищем как синонимы
const enOf = (id: string | null | undefined) => (id && /^[a-z0-9-]+$/i.test(id) ? id.replace(/-/g, ' ') : null)

export async function matchHero(h: LssHero): Promise<Matched> {
  const classes = await Promise.all(h.classes.map(async (c) => {
    const cands = await find('classes', [enOf(c.id), c.name])
    return { lss: c, cands, pick: auto(cands) }
  }))
  const mainClass = classes[0]?.pick
  const subCands = h.subclass?.name && mainClass ? await findSubclass(mainClass, h.subclass.name) : []
  const [race, background] = await Promise.all([
    h.race ? find('races', [enOf(h.race.id), h.race.name]) : Promise.resolve([]),
    h.background ? find('backgrounds', [enOf(h.background.id), h.background.name]) : Promise.resolve([]),
  ])
  const subrace = h.subrace?.name ? await find('subraces', [enOf(h.subrace.id), h.subrace.name]) : []
  const feats = await Promise.all(h.feats.map(async (f) => {
    const cands = await find('feats', [f.hint, f.name])
    return { lss: f.name, cands, pick: auto(cands) }
  }))
  const gear = await Promise.all([
    ...h.gear.map(async (g) => {
      const cands = await find('equipment', [g.name, g.name.split(/\s+/)[0]], '', { strict: true, loose: 1 })
      return { lss: g, kind: 'equipment' as const, cands, pick: auto(cands) }
    }),
    ...h.magic.map(async (g) => {
      const cands = await find('items', [g.name], '', { strict: true })
      return { lss: g, kind: 'items' as const, cands, pick: auto(cands) }
    }),
  ])
  return {
    classes,
    subclass: h.subclass?.name ? { cands: subCands, pick: auto(subCands) } : null,
    race: h.race ? { cands: race, pick: auto(race) } : null,
    subrace: h.subrace?.name ? { cands: subrace, pick: auto(subrace) } : null,
    background: h.background ? { cands: background, pick: auto(background) } : null,
    feats,
    gear,
  }
}

/* ---------- создание ---------- */

const DMG_TYPES: [RegExp, string][] = [
  [/колющ/i, 'колющий'],
  [/рубящ/i, 'рубящий'],
  [/дробящ/i, 'дробящий'],
  [/огн/i, 'огонь'],
  [/холод/i, 'холод'],
  [/молни/i, 'молния'],
  [/яд/i, 'яд'],
  [/кислот/i, 'кислота'],
  [/излуч/i, 'излучение'],
  [/некрот/i, 'некротическая энергия'],
  [/силов/i, 'силовое поле'],
  [/психич/i, 'психическая энергия'],
  [/звук|гром/i, 'звук'],
]
const mod = (s: number) => Math.floor((s - 10) / 2)
const profOf = (lvl: number) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4)

function attacksOf(h: LssHero): AttackEntry[] {
  return h.weapons.map((w) => {
    const dice = /(\d+)\s*[кd]\s*(\d+)/i.exec(w.dmg)
    const ab = (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(w.ability) ? w.ability : 'str') as AbilityKey
    const m = mod(h.scores[ab])
    return {
      name: w.name,
      type: /лук|арбалет|дротик|праща|пистол|мушкет|сюрикен/i.test(w.name) ? 'ranged' : 'melee',
      attack_bonus: m + (w.prof ? profOf(h.level) : 0),
      damage: dice ? `${dice[1]}к${dice[2]}${m ? (m > 0 ? `+${m}` : `${m}`) : ''}` : w.dmg,
      damage_type: DMG_TYPES.find(([re]) => re.test(w.dmg))?.[1] ?? '',
      range: '',
      properties: /легк/i.test(w.dmg) ? ['лёгкое'] : /универс/i.test(w.dmg) ? ['универсальное'] : [],
      inventory_instance_id: null,
    }
  })
}

const LABELS: Record<string, string> = {
  traits: 'Умения и особенности',
  features: 'Черты расы и прочее',
  feats: 'Черты',
  prof: 'Владения и языки',
  equipment: 'Снаряжение',
  items: 'Предметы',
  attacks: 'Атаки',
  allies: 'Союзники и организации',
  appearance: 'Внешность',
  background: 'Предыстория',
  notes: 'Заметки',
}

export interface ImportReport {
  id: string
  log: string[]
  left: string[]
}

/** Создать героя по сопоставлению: 1-й уровень, затем повышения, навыки, поправка характеристик */
export async function importHero(h: LssHero, m: Matched, onStep: (t: string) => void): Promise<ImportReport> {
  const log: string[] = []
  const left: string[] = []
  const say = (t: string) => {
    log.push(t)
    onStep(t)
  }
  // сумка: то, что нашлось в каталоге
  const items: InventoryItemInstance[] = []
  const unmatchedGear: string[] = []
  let slot = 0
  for (const g of m.gear) {
    if (!g.pick) {
      unmatchedGear.push(g.lss.qty > 1 ? `${g.lss.qty} × ${g.lss.name}` : g.lss.name)
      continue
    }
    try {
      if (g.kind === 'equipment') {
        const eq = await getOne<Equipment>('equipment', g.pick)
        items.push(inventoryItem(eq, g.lss.qty, slot++, { equipped: false, slot: null }))
      } else {
        const it = await getOne<Item>('items', g.pick)
        const inst = magicInventoryItem(it)
        inst.position = { col: slot % 7, row: Math.floor(slot / 7) }
        slot++
        items.push(inst)
      }
    } catch {
      unmatchedGear.push(g.lss.name)
    }
  }

  const unmatchedFeats = m.feats.filter((f) => !f.pick).map((f) => f.lss)
  const notes = [
    `Импорт из Long Story Short (${h.edition}).`,
    !m.classes.every((c) => c.pick) && `Класс: ${h.classes.map((c) => `${c.name} ${c.level}`).join(' / ')}`,
    m.subclass && !m.subclass.pick && h.subclass?.name && `Подкласс: ${h.subclass.name}`,
    m.race && !m.race.pick && h.race?.name && `Раса: ${h.race.name}`,
    m.background && !m.background.pick && h.background?.name && `Предыстория: ${h.background.name}`,
    unmatchedFeats.length > 0 && `Черты не из каталога: ${unmatchedFeats.join(', ')}`,
    unmatchedGear.length > 0 && `Снаряжение не из каталога: ${unmatchedGear.join(', ')}`,
    h.spellsCount > 0 && `В LSS было заклинаний: ${h.spellsCount} — выберите их в книге заклинаний.`,
    ...Object.entries(h.texts)
      .filter(([k]) => !['personality', 'ideals', 'bonds', 'flaws', 'appearance', 'background'].includes(k))
      .map(([k, t]) => `${LABELS[k] ?? k}:\n${t}`),
  ]
    .filter(Boolean)
    .join('\n\n')

  const age = parseInt(h.info.age, 10)
  const main = m.classes[0]
  const body: CharacterInput = {
    character_name: h.name,
    visibility: 'private',
    race_id: m.race?.pick ?? null,
    subrace_id: m.subrace?.pick ?? null,
    background_id: m.background?.pick ?? null,
    feat_ids: [...new Set(m.feats.map((f) => f.pick).filter((x): x is string => !!x))],
    classes: main?.pick ? [{ class_id: main.pick, level: 1, subclass_id: null, hp_rolls: [] }] : [],
    base_scores: { ...h.scores },
    experience_points: h.xp,
    alignment: h.alignment || null,
    inventory: { grid_width: 7, currency: h.coins, items },
    attacks: attacksOf(h),
    personality: { traits: h.texts.personality ?? '', ideals: h.texts.ideals ?? '', bonds: h.texts.bonds ?? '', flaws: h.texts.flaws ?? '' },
    age: Number.isNaN(age) ? null : age,
    height: h.info.height,
    weight: h.info.weight,
    eyes: h.info.eyes,
    skin: h.info.skin,
    hair: h.info.hair,
    appearance: h.texts.appearance ?? '',
    avatar_url: h.avatar,
    backstory: h.texts.background ?? '',
    notes,
  }
  say(`Создаём «${h.name}»`)
  const created = await createCharacter(body)
  const id = created.id

  // уровни: основной класс до своего, затем остальные классы
  const subLevel = m.subclass?.pick ? await getOne<{ level_available: number | null }>('subclasses', m.subclass.pick).then((s) => s.level_available ?? 3).catch(() => 3) : 99
  const steps: { class_id: string; level: number }[] = []
  m.classes.forEach((c, i) => {
    if (!c.pick) return
    for (let lv = i === 0 ? 2 : 1; lv <= c.lss.level; lv++) steps.push({ class_id: c.pick, level: lv })
  })
  if (main?.pick && m.subclass?.pick && subLevel <= 1) {
    await updateCharacter(id, { classes: [{ class_id: main.pick, level: 1, subclass_id: m.subclass.pick, hp_rolls: [] }] }).catch(() => undefined)
  }
  for (const s of steps) {
    const withSub = s.class_id === main?.pick && m.subclass?.pick && s.level === subLevel ? m.subclass.pick : null
    try {
      await levelUp(id, { class_id: s.class_id, subclass_id: withSub, hp_roll: null })
    } catch (e) {
      if (withSub) {
        try {
          await levelUp(id, { class_id: s.class_id, hp_roll: null })
          left.push('Подкласс выберите вручную при повышении уровня')
        } catch (e2) {
          left.push(`Уровень ${s.level}: ${e2 instanceof Error ? e2.message : 'не поднялся'}`)
          break
        }
      } else {
        left.push(`Уровень ${s.level}: ${e instanceof Error ? e.message : 'не поднялся'}`)
        break
      }
    }
  }
  if (steps.length) say(`Уровни подняты до ${h.level}`)

  // навыки: отвечаем на вопросы сервера, где варианты совпадают с владениями LSS
  const picked = await answerSkillPrompts(id, h.skills, h.expertise)
  if (picked) say(`Выбрано навыков: ${picked}`)

  // характеристики: итог должен совпасть с LSS — бонусы расы и предыстории не задваиваем
  try {
    const sheet = await getSheet(id)
    const cur = await getCharacter(id)
    const base = { ...cur.base_scores }
    let changed = false
    for (const k of Object.keys(base) as AbilityKey[]) {
      const final = Number(sheet.values[`char.abilities.${k}.score`])
      if (!Number.isFinite(final)) continue
      const diff = h.scores[k] - final
      if (diff) {
        base[k] = Math.max(1, Math.min(30, base[k] + diff))
        changed = true
      }
    }
    if (changed) {
      await updateCharacter(id, { base_scores: base })
      say('Характеристики сверены с LSS')
    }
  } catch {
    left.push('Проверьте характеристики: бонусы расы могли задвоиться')
  }

  const after = await getCharacter(id).catch(() => null)
  const pending = after?.pending_decisions?.length ?? 0
  if (pending) left.push(`Осталось решений в листе: ${pending} (выбор навыков, черт или умений)`)
  if (h.hp.current && h.hp.current < h.hp.max) left.push(`Хиты в LSS: ${h.hp.current}/${h.hp.max} — текущие хиты поправьте в листе`)
  if (unmatchedGear.length) left.push(`Не нашлось в каталоге: ${unmatchedGear.join(', ')} — записано в заметки`)
  if (unmatchedFeats.length) left.push(`Черты не из каталога: ${unmatchedFeats.join(', ')} — записано в заметки`)
  if (h.spellsCount) left.push(`Заклинания (${h.spellsCount}) выберите заново: LSS не отдаёт их названий`)
  return { id, log, left }
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s-]+/g, '_')
const SKILL_LABEL = new Map(DEFAULT_SKILLS.map((s) => [norm(s.label), s.key]))
const skillOf = (v: unknown, label: unknown) => {
  const a = norm(v)
  const b = norm(label)
  for (const s of DEFAULT_SKILLS) if (a === s.key || a.endsWith(`.${s.key}`) || a.endsWith(`_${s.key}`)) return s.key
  return SKILL_LABEL.get(b) ?? SKILL_LABEL.get(a) ?? null
}

/** Вопросы о навыках: выбираем варианты, которые совпали с владениями LSS. Остальное — игроку */
async function answerSkillPrompts(id: string, skills: string[], expertise: string[]): Promise<number> {
  let total = 0
  const tried = new Set<string>()
  for (let round = 0; round < 12; round++) {
    const ch = await getCharacter(id).catch(() => null)
    const next = ch?.pending_decisions?.find((d) => !tried.has(d.id))
    if (!next) break
    tried.add(next.id)
    let res
    try {
      res = await resolvePending(id, next.id, {})
    } catch (e) {
      if (e instanceof ApiError) continue
      break
    }
    const prompt = res?.prompt as Prompt | null | undefined
    if (res?.status !== 'needs_input' || !prompt) continue
    const answers: Record<string, unknown> = {}
    let ok = true
    for (const input of prompt.inputs) {
      const opts = input.options ?? []
      const asSkill = opts.map((o) => ({ o, key: skillOf(o.value, o.label) }))
      const isSkill = input.type === 'skill' || (asSkill.length > 0 && asSkill.filter((x) => x.key).length >= asSkill.length * 0.6)
      if (!isSkill) {
        if (input.required) ok = false
        continue
      }
      const want = /компетент|экспертиз|expert/i.test(`${prompt.title} ${input.label}`) ? expertise : skills
      const need = Math.max(1, input.count ?? input.max ?? 1)
      const chosen = asSkill.filter((x) => x.key && want.includes(x.key)).slice(0, need).map((x) => x.o.value)
      if (chosen.length < need) {
        ok = false
        continue
      }
      answers[input.key] = input.multiple || input.type === 'multi_choice' || need > 1 ? chosen : chosen[0]
    }
    if (!ok || Object.keys(answers).length === 0) continue
    const done = await resolvePending(id, next.id, { [prompt.key]: answers }).catch(() => null)
    if (done?.status === 'completed') total += Object.values(answers).flat().length
  }
  return total
}
