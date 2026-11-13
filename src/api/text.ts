
/** Имя записи каталога независимо от типа (class_name / race_name / name …) */
export function displayName(entry: Record<string, unknown>): string {
  for (const key of Object.keys(entry)) {
    if ((key === 'name' || key.endsWith('_name')) && typeof entry[key] === 'string') {
      return entry[key] as string
    }
  }
  return '—'
}

/** «Книга игрока [Player's Handbook]» → { ru: 'Книга игрока', en: "Player's Handbook" } */
export function splitTitle(title: string): { ru: string; en: string | null } {
  const m = title.match(/^(.*?)\s*\[(.+?)\]\s*$/)
  if (!m) return { ru: title, en: null }
  return { ru: m[1].trim() || m[2], en: m[2] }
}

const HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', shy: '',
}

/** Декодирует базовые HTML-сущности (именованные и числовые). */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    const rep = HTML_ENTITIES[code.toLowerCase()]
    return rep !== undefined ? rep : m
  })
}

/** Превращает HTML-разметку в читаемый простой текст (для превью-карточек и т.п.). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      // служебные блоки целиком
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      // дублирующее свёрнутое превью спойлера dnd.su
      .replace(/<blockquote class="spoiler_neck"[\s\S]*?<\/blockquote>/gi, '')
      // блочные теги → перенос строки
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|ul|ol|table)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // остальные теги убираем
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Убирает служебную строку «Источник: «…»» из начала описания */
export function cleanDescription(text: string | null | undefined): string {
  if (!text) return ''
  const isHtml = /<[a-z!/][\s\S]*>/i.test(text)
  // для превью выкидываем эпиграф-цитату (blockquote) — иначе карточка расы
  // начинается с художественной цитаты, а не с описания
  const src = isHtml ? text.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '') : text
  const plain = isHtml ? htmlToText(src) : src
  return plain.replace(/^Источник:\s*«[^»]*»\s*/u, '').trim()
}

/** Короткое превью описания для карточек каталога (очищает HTML и подрезает). */
export function descriptionPreview(text: string | null | undefined, max = 300): string {
  const clean = cleanDescription(text)
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '').trimEnd() + '…'
}

/**
 * Умное сокращение длинного заголовка: обрезает конец предпоследнего слова
 * и ставит «…», оставляя последнее слово целым.
 * «Потомок знаменитого авантюриста» → «Потомок знаменит… авантюриста»
 */
export function ellipsizePenultimate(text: string, maxLen: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (maxLen < 2) return '…'
  if (t.length <= maxLen) return t

  const words = t.split(' ')
  if (words.length < 2) return t.slice(0, maxLen - 1) + '…'

  const last = words[words.length - 1]
  const penult = words[words.length - 2]
  const prefix = words.slice(0, -2)
  const prefixStr = prefix.length ? prefix.join(' ') + ' ' : ''
  // `${prefixStr}${short}… ${last}`
  const reserved = prefixStr.length + 1 /*…*/ + 1 /* пробел */ + last.length
  const letterBudget = maxLen - reserved
  if (letterBudget < 2) return t.slice(0, maxLen - 1) + '…'
  if (penult.length <= letterBudget) return t.slice(0, maxLen - 1) + '…'
  return `${prefixStr}${penult.slice(0, letterBudget)}… ${last}`
}

/** Показатель опасности: 0.125 → «1/8» */
export function formatCR(cr: number | null): string {
  if (cr == null) return '—'
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

/** Категории размера приходят по-английски — показываем по-русски */
const SIZE_RU: Record<string, string> = {
  tiny: 'Крошечный',
  small: 'Маленький',
  medium: 'Средний',
  large: 'Большой',
  huge: 'Огромный',
  gargantuan: 'Громадный',
}

export function sizeRu(size: string | null | undefined): string | null {
  if (!size) return null
  return SIZE_RU[size.trim().toLowerCase()] ?? size
}

/** Тип существа (race_type / creature_type) — по-русски */
const CREATURE_TYPE_RU: Record<string, string> = {
  aberration: 'Аберрация',
  beast: 'Зверь',
  celestial: 'Небожитель',
  construct: 'Конструкт',
  dragon: 'Дракон',
  elemental: 'Элементаль',
  fey: 'Фея',
  fiend: 'Исчадие',
  giant: 'Великан',
  humanoid: 'Гуманоид',
  monstrosity: 'Монстр',
  ooze: 'Слизь',
  plant: 'Растение',
  undead: 'Нежить',
}

export function creatureTypeRu(type: string | null | undefined): string | null {
  if (!type) return null
  const key = type.trim().toLowerCase()
  return CREATURE_TYPE_RU[key] ?? type
}

export const ABILITY_RU: Record<string, string> = {
  strength: 'СИЛ',
  dexterity: 'ЛОВ',
  constitution: 'ТЕЛ',
  intelligence: 'ИНТ',
  wisdom: 'МДР',
  charisma: 'ХАР',
}
