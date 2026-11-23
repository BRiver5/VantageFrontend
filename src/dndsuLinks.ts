/**
 * Ссылки dnd.su / next.dnd.su из статей (классы, подклассы, умения) → страницы Vantage.
 *
 * Глоссарий и списки заклинаний класса по кругу переводятся сразу в адрес. Конкретная
 * черта, снаряжение, предмет, существо или класс — по названию: id у нас свой, его ищет
 * поиск по каталогу в момент клика. «Черту» без конкретики ведём в каталог черт.
 */

export type DndSuTarget =
  /** готовый адрес Vantage */
  | { route: string }
  /** найти запись раздела по названию (сущность поиска: feats, equipment, items, creatures, classes) */
  | { find: string; q: string; alt?: string; fallback: string }

/** Классы next.dnd.su: английские slug и числовые коды списка заклинаний */
const CLASS_RU: Record<string, string> = {
  artificer: 'изобретатель',
  bard: 'бард',
  barbarian: 'варвар',
  cleric: 'жрец',
  druid: 'друид',
  fighter: 'воин',
  monk: 'монах',
  paladin: 'паладин',
  ranger: 'следопыт',
  rogue: 'плут',
  sorcerer: 'чародей',
  warlock: 'колдун',
  wizard: 'волшебник',
  '12': 'бард',
  '13': 'жрец',
  '16': 'паладин',
  '17': 'следопыт',
  '19': 'чародей',
  '20': 'колдун',
  '21': 'волшебник',
  '22': 'друид',
}

/** Глоссарий next.dnd.su → slug термина Vantage, где они разошлись */
const TERM_ALIAS: Record<string, string> = {
  skill: 'skills',
  'opportunity-attacks': 'opportunity-attack',
  'charmed-condition': 'charmed',
  death: 'dead',
  size: 'creature-size',
  'hit-point-dice': 'hit-dice',
  'higher-level-spells': 'upcasting',
  'death-saving-throw': 'death-saves',
  condition: 'conditions',
  'half-cover': 'cover',
  'heroic-inspiration': 'inspiration',
  blindvision: 'blindsight',
  curses: 'curse',
}

/** Разделы с записями по id: путь dnd.su → сущность поиска и каталог на случай «не нашлось» */
const SECTIONS: Record<string, { find: string; list: string }> = {
  feats: { find: 'feats', list: '/feats' },
  equipment: { find: 'equipment', list: '/equipment' },
  items: { find: 'items', list: '/items' },
  bestiary: { find: 'creatures', list: '/bestiary' },
  class: { find: 'classes', list: '/classes' },
}

/** «27369-eldritch-cannon» → «eldritch cannon» — английское имя на случай склонённого русского текста */
const slugWords = (tail: string) => tail.replace(/^\d+-/, '').replace(/\/$/, '').replace(/[-_]+/g, ' ').trim()

/**
 * Куда ведёт ссылка. `text` — подпись ссылки, `pageClass` — класс страницы (для списков
 * заклинаний без класса в адресе). null — у нас такой страницы нет (механика, инвентарь).
 */
export function dndSuTarget(href: string, text: string, pageClass?: string | null): DndSuTarget | null {
  let url: URL
  try {
    url = new URL(href, 'https://next.dnd.su')
  } catch {
    return null
  }
  if (!/(^|\.)dnd\.su$/.test(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const [section, tail] = parts

  if (section === 'glossary' && tail) return { route: `/terms/${TERM_ALIAS[tail] ?? tail}` }

  if (section === 'spells' && !tail) {
    const q: string[] = []
    const cls = CLASS_RU[url.searchParams.get('class') ?? ''] ?? pageClassRu(pageClass)
    if (cls) q.push(`class=${cls}`)
    const level = url.searchParams.get('level')
    if (level && /^\d$/.test(level)) q.push(`level=${level}`)
    const qs = q.join('&')
    return { route: qs ? `/spells?${qs}` : '/spells' }
  }

  const sec = section ? SECTIONS[section] : undefined
  if (sec) {
    if (!tail) return { route: sec.list }
    const name = text.replace(/\s+/g, ' ').replace(/\[.*?\]/g, '').trim()
    return { find: sec.find, q: name, alt: slugWords(tail) || undefined, fallback: sec.list }
  }
  return null
}

function pageClassRu(name: string | null | undefined): string | undefined {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return undefined
  if (n === 'артефактор') return 'изобретатель'
  return Object.values(CLASS_RU).includes(n) ? n : undefined
}

/** Путь страницы Vantage для сущности поиска */
export const ENTITY_PATH: Record<string, string> = {
  feats: '/feats',
  equipment: '/equipment',
  items: '/items',
  creatures: '/bestiary',
  classes: '/classes',
}
