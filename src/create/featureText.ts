/**
 * Текст умения без повтора заголовка. В статьях классов описание начинается с
 * «БОЖЕСТВЕННОЕ ЧУВСТВО 1-й уровень, умение паладина …» — название, уровень и
 * владелец и так видны рядом, поэтому их срезаем.
 */
import { cleanDescription } from '../api'

const fold = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е')

/** Убирает «НАЗВАНИЕ N-й уровень, умение владельца» из начала уже очищенного текста */
export function stripFeatureLead(text: string, name: string, owner: string): string {
  let out = text.trim()
  if (fold(out).startsWith(fold(name))) out = out.slice(name.length)
  // «1-й уровень, умение паладина …» / «3-й уровень, особенность Клятвы преданности …»
  out = out
    .replace(/^[\s.:—-]*\d+-?(?:й|го)?\s+уров\S*[,.]?\s*/iu, '')
    .replace(/^(?:умение|особенность|черта|способность)\s+/iu, '')
  // слова владельца в любом падеже («паладина», «Клятвы преданности») — по основам
  const stems = new Set(fold(owner).split(/\s+/).filter(Boolean).map((w) => w.slice(0, 4)))
  const words = out.split(/(\s+)/)
  let skip = 0
  while (skip < words.length && (words[skip].trim() === '' || stems.has(fold(words[skip]).slice(0, 4)))) skip++
  return words.slice(skip).join('').trim()
}

/** HTML умения → чистый текст без заголовка; `max` — обрезка по целому слову */
export function featureText(html: string | null | undefined, name: string, owner: string, max = Infinity): string {
  const text = stripFeatureLead(cleanDescription(html), name, owner)
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/u, '').replace(/[,.;:]$/, '') + '…'
}
