/**
 * Редкость как прилагательное к названию предмета. Род берём с первого слова
 * имени; если по окончанию неясно — падаем обратно на тип («Оружие (булава)»).
 */

export type AdjGender = 'm' | 'f' | 'n' | 'p'

const RARITY_ADJ: Record<string, Record<AdjGender, string>> = {
  'обычный': { m: 'Обычный', f: 'Обычная', n: 'Обычное', p: 'Обычные' },
  'необычный': { m: 'Необычный', f: 'Необычная', n: 'Необычное', p: 'Необычные' },
  'редкий': { m: 'Редкий', f: 'Редкая', n: 'Редкое', p: 'Редкие' },
  'очень редкий': { m: 'Очень редкий', f: 'Очень редкая', n: 'Очень редкое', p: 'Очень редкие' },
  'легендарный': { m: 'Легендарный', f: 'Легендарная', n: 'Легендарное', p: 'Легендарные' },
  'артефакт': { m: 'Артефактный', f: 'Артефактная', n: 'Артефактное', p: 'Артефактные' },
}

const CONSONANT = /[бвгджзйклмнпрстфхцчшщ]$/u

/** Существительные типа, у которых окончание врёт — запасной путь. */
const GENDER_BY_HEAD: Record<string, AdjGender> = {
  палочка: 'f',
  булава: 'f',
  секира: 'f',
  рапира: 'f',
  кирка: 'f',
  глефа: 'f',
  пика: 'f',
  стрела: 'f',
  праща: 'f',
  пушка: 'f',
  дубинка: 'f',
  палица: 'f',
  кираса: 'f',
  кольчуга: 'f',
  рубаха: 'f',
  мантия: 'f',
  татуировка: 'f',
  флейта: 'f',
  фокусировка: 'f',
  винтовка: 'f',
  коса: 'f',
  кусаригама: 'f',
  цепь: 'f',
  оружие: 'n',
  кольцо: 'n',
  зелье: 'n',
  копьё: 'n',
  копье: 'n',
  ожерелье: 'n',
  латы: 'p',
  полулаты: 'p',
  доспехи: 'p',
  сапоги: 'p',
  боеприпасы: 'p',
  ножницы: 'p',
  наручи: 'p',
  перчатки: 'p',
  очки: 'p',
}

const SKIP_WORDS = new Set([
  'любой',
  'любая',
  'любое',
  'любые',
  'лёгкий',
  'легкий',
  'средний',
  'тяжёлый',
  'тяжелый',
  'кроме',
  'шкурного',
  'или',
  'и',
  'наносящий',
  'рубящий',
  'дробящий',
  'урон',
  'для',
  'одноручное',
  'рукопашное',
  'дальнобойное',
  'метательное',
  'хитрое',
  'огнестрельное',
])

function lastHead(text: string): string {
  const words = text
    .toLocaleLowerCase('ru')
    .replace(/[();:,+]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const meaningful = words.filter((w) => !SKIP_WORDS.has(w) && !/^\d/.test(w))
  return meaningful[meaningful.length - 1] ?? words[words.length - 1] ?? 'предмет'
}

function itemTypeHead(itemType: string | null | undefined): string {
  if (!itemType) return 'предмет'
  const cut = itemType.split(/,|редкость/)[0]
  const paren = [...cut.matchAll(/\(([^)]*)/g)].pop()
  const raw = (paren?.[1] || cut).trim()
  const head = lastHead(raw)
  if (!head || SKIP_WORDS.has(head)) return lastHead(cut.replace(/\(.*$/, '')) || 'предмет'
  return head
}

function genderFromType(itemType: string | null | undefined): AdjGender {
  const head = itemTypeHead(itemType)
  if (GENDER_BY_HEAD[head]) return GENDER_BY_HEAD[head]
  if (/[ая]$/u.test(head)) return 'f'
  if (/[оеё]$/u.test(head)) return 'n'
  if (/[иы]$/u.test(head)) return 'p'
  return 'm'
}

/** Первое слово названия без кавычек и пунктуации по краям. */
function firstNameWord(name: string | null | undefined): string {
  if (!name) return ''
  const raw = name.trim().split(/\s+/)[0] ?? ''
  return raw.replace(/^[^0-9\p{L}]+|[^0-9\p{L}]+$/gu, '').toLocaleLowerCase('ru')
}

/**
 * Род по окончанию первого слова названия.
 * Согласная → м; -а/-я → ж; -ые/-ие/-и → мн.; -о/-е → ср.; иначе null.
 */
function genderFromName(name: string | null | undefined): AdjGender | null {
  const word = firstNameWord(name)
  if (!word) return null
  if (CONSONANT.test(word)) return 'm'
  if (/[ая]$/u.test(word)) return 'f'
  if (/(?:ые|ие|и)$/u.test(word)) return 'p'
  if (/[оеё]$/u.test(word)) return 'n'
  return null
}

/** «Необычная», «Редкий». Нет известной редкости — ничего не приставляем. */
export function rarityAdjective(
  rarity: string | null | undefined,
  itemName: string | null | undefined,
  itemType: string | null | undefined,
): string | null {
  const key = rarity?.trim().toLocaleLowerCase('ru') ?? ''
  if (!key) return null
  const forms = RARITY_ADJ[key]
  if (!forms) return null
  const gender = genderFromName(itemName) ?? genderFromType(itemType)
  return forms[gender]
}
