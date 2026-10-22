/**
 * Заклинания, которые герой получает сам по себе — от расы или подкласса — и
 * уровень, на котором они приходят.
 *
 * Расовые записаны в тексте особенностей: «Начиная с 3-го уровня, вы можете
 * накладывать заклинание огонь фей [faerie fire]…», «вы знаете заговор
 * пляшущие огоньки [dancing lights]». Сопоставляем их с каталогом по названию.
 *
 * Подклассовые есть в самом каталоге (`available_subclasses`: «клятва
 * преданности (паладин)»); уровень выводим из круга: у полных заклинателей
 * круг N приходит на уровне 2N−1, у полузаклинателей — на 3, 5, 9, 13, 17.
 */
import { cleanDescription } from '../api'
import type { Spell } from '../api'

export interface GrantedSpell {
  spell: Spell
  /** уровень персонажа, на котором заклинание появляется */
  level: number
  origin: 'race' | 'subclass'
  /** откуда — «Тёмный эльф», «Клятва преданности» */
  from: string
}

const fold = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/** Подклассы, чьи заклинания всегда подготовлены или известны (а не просто доступны для выбора) */
const GRANTING = new Set(['жрец', 'друид', 'паладин', 'изобретатель', 'следопыт', 'чародей'])
const HALF = new Set(['паладин', 'изобретатель', 'следопыт'])
const HALF_LEVELS = [0, 3, 5, 9, 13, 17]

/** Расовые заклинания из текста особенностей расы или подрасы */
export function racialSpells(text: string | null | undefined, from: string, catalog: Spell[]): GrantedSpell[] {
  const plain = cleanDescription(text)
  if (!plain) return []
  const byName = new Map(catalog.map((s) => [fold(s.spell_name), s]))
  // запасной ключ — основы слов: в тексте бывает винительный падеж («палящую кару»)
  const stemKey = (name: string) =>
    fold(name)
      .split(' ')
      .map((w) => w.slice(0, 3))
      .join(' ')
  // неоднозначные ключи (у разных заклинаний одна основа) не используем
  const byStem = new Map<string, Spell | null>()
  for (const s of catalog) {
    const k = stemKey(s.spell_name)
    byStem.set(k, byStem.has(k) ? null : s)
  }
  const out: GrantedSpell[] = []
  const seen = new Set<string>()
  // каждое упоминание «… название [english]» внутри одного предложения
  for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
    if (!/заклинани|заговор/i.test(sentence)) continue
    const lvl = /(\d+)\s*-?\s*(?:го|й)?\s*уровн/i.exec(sentence)
    const level = lvl ? Number(lvl[1]) : 1
    const re = /(?:накладывать|знаете|известен)(?:\s+(?:заклинание|заговор))?\s+([^[\].,;]+?)\s*\[[^\]]+\]/gi
    for (const m of sentence.matchAll(re)) {
      const spell = byName.get(fold(m[1])) ?? byStem.get(stemKey(m[1]))
      if (!spell || seen.has(spell.id)) continue
      seen.add(spell.id)
      out.push({ spell, level: spell.spell_level === 0 ? 1 : level, origin: 'race', from })
    }
  }
  return out
}

/** Заклинания подкласса из каталога, с уровнем получения */
export function subclassSpells(subclassName: string, className: string, catalog: Spell[]): GrantedSpell[] {
  const cls = fold(className)
  if (!GRANTING.has(cls)) return []
  const sub = fold(subclassName)
  const out: GrantedSpell[] = []
  for (const spell of catalog) {
    const hit = spell.available_subclasses?.some((s) => {
      const f = fold(s)
      return f === `${sub} (${cls})` || (f.startsWith(sub) && f.includes(cls))
    })
    if (!hit || spell.spell_level < 1) continue
    const circle = spell.spell_level
    const level = HALF.has(cls) ? (HALF_LEVELS[circle] ?? 20) : circle * 2 - 1
    out.push({ spell, level, origin: 'subclass', from: subclassName })
  }
  return out.sort((a, b) => a.level - b.level || a.spell.spell_name.localeCompare(b.spell.spell_name, 'ru'))
}

/** Всё дарованное для черновика: раса (или подраса) и подкласс */
export function grantedSpells(
  opts: {
    raceName: string
    raceText: string | null | undefined
    subraceName: string | null
    subraceText: string | null | undefined
    className: string
    subclassName: string | null
  },
  catalog: Spell[],
): GrantedSpell[] {
  if (catalog.length === 0) return []
  // у выбранной подрасы смотрим только её особенности: статья расы целиком
  // описывает и чужие подрасы (магия дроу лежит в статье эльфа)
  const race = opts.subraceName
    ? racialSpells(opts.subraceText, opts.subraceName, catalog)
    : racialSpells(opts.raceText, opts.raceName, catalog)
  const sub = opts.subclassName ? subclassSpells(opts.subclassName, opts.className, catalog) : []
  return [...race, ...sub]
}
