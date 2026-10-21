/**
 * Проверка требований черт («Сила 13 или выше», «Эльф (дроу)», «4 уровень,
 * черта «…»», «Воин или Паладин или предыстория «…»») по черновику героя.
 *
 * Требование разбирается на части: «;» — всегда «и»; внутри части запятые
 * значат «и», если нет слова «или», и «или», если оно есть («Полуэльф,
 * Полуорк или Человек»). Чего проверить нельзя (кампания, метки драконов) —
 * не запрещает: решает мастер.
 */
import type { AbilityName } from '../types/character'
import { ABILITY_LABELS } from '../types/character'
import type { CasterKind } from './dnd5e'
import { spellSlotsAt } from './dnd5e'

export interface PrereqContext {
  level: number
  scores: Record<AbilityName, number>
  raceName: string
  subraceName: string
  raceSize: string | null
  className: string
  casterKind: CasterKind
  armorProficiencies: string[]
  weaponProficiencies: string[]
  backgroundName: string
  /** черты, взятые на прошлых уровнях */
  feats: string[]
}

export interface PrereqResult {
  ok: boolean
  /** почему нельзя — коротко, для подписи на карточке */
  reason: string | null
}

const low = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim()

const ABILITY_BY_NAME: [RegExp, AbilityName][] = [
  [/сил/i, 'strength'],
  [/ловк/i, 'dexterity'],
  [/телосл/i, 'constitution'],
  [/интел/i, 'intelligence'],
  [/мудр/i, 'wisdom'],
  [/харизм/i, 'charisma'],
]

const RACES = ['полуэльф', 'полуорк', 'полурослик', 'драконорожд', 'тифлинг', 'дварф', 'гном', 'эльф', 'человек', 'орк']
const CLASSES = ['бард', 'варвар', 'воин', 'волшебник', 'друид', 'жрец', 'изобретатель', 'колдун', 'монах', 'паладин', 'плут', 'следопыт', 'чародей']

/** Одна проверка: true / false / null — проверить нельзя */
type Check = { pass: boolean | null; need: string }

/** Проверки, найденные в куске текста требования */
function checksIn(part: string, ctx: PrereqContext): Check[] {
  const text = low(part)
  const out: Check[] = []

  const lvl = /(\d+)\s*-?\s*(?:й|го)?\s*уров/.exec(text)
  if (lvl) {
    const n = Number(lvl[1])
    out.push({ pass: ctx.level >= n, need: `${n} уровень` })
  }

  const score = /(\d+)\s*или\s*выше/.exec(text)
  if (score) {
    const n = Number(score[1])
    const abilities = ABILITY_BY_NAME.filter(([re]) => re.test(text)).map(([, a]) => a)
    for (const a of abilities) {
      out.push({
        pass: ctx.scores[a] >= n,
        need: `${ABILITY_LABELS[a].label} ${n} (у вас ${ctx.scores[a]})`,
      })
    }
  }

  if (/заклинан|магия договора/.test(text) && !/посвящ|высшее волшебство/.test(text)) {
    const casts = Object.keys(spellSlotsAt(ctx.casterKind, ctx.level)).length > 0
    out.push({ pass: casts, need: 'умение накладывать заклинания' })
  }

  const armor = /владени\S*\s+(легк|средн|тяжел)\S*\s+доспех/.exec(text)
  if (armor) {
    const profs = low(ctx.armorProficiencies.join(' '))
    out.push({
      pass: profs.includes('все') || profs.includes(armor[1]),
      need: `владение ${armor[1] === 'легк' ? 'лёгкими' : armor[1] === 'средн' ? 'средними' : 'тяжёлыми'} доспехами`,
    })
  }

  if (/воинск\S*\s+оружи/.test(text)) {
    out.push({ pass: low(ctx.weaponProficiencies.join(' ')).includes('воинск'), need: 'владение воинским оружием' })
  }

  // «черта «…»» / «предыстория «…»» — сверяем по названию без уточнения в скобках
  // название ищем в исходном тексте, чтобы в подписи остался его регистр
  const quoted = (kind: string) => {
    const m = new RegExp(`${kind}\\S*\\s*«\\s*([^»]+?)\\s*»`, 'i').exec(part)
    return m ? m[1].replace(/\(.*?\)/g, '').trim() : null
  }
  const feat = quoted('черт')
  if (feat) {
    out.push({ pass: ctx.feats.some((f) => low(f).includes(low(feat))), need: `черта «${feat}»` })
  }
  const background = quoted('предыстори')
  if (background) {
    out.push({ pass: low(ctx.backgroundName).includes(low(background)), need: `предыстория «${background}»` })
  }

  // раса — точным словом (полуэльф ≠ эльф), с уточнением подрасы в скобках
  const words = text.replace(/«[^»]*»/g, ' ').split(/[^a-zа-я]+/)
  const race = low(ctx.raceName)
  for (const stem of RACES) {
    if (!words.some((w) => w.startsWith(stem) && !(stem === 'эльф' && w.startsWith('полу')) && !(stem === 'орк' && w !== 'орк'))) continue
    // подрасу в данных часто не узнать по названию («Эльф — вариант 2»), поэтому
    // несовпавшее уточнение не запрещает — запрещает только другая раса
    const sub = /\(([^)]+)\)/.exec(text)?.[1]
    const subOk = !sub || low(ctx.subraceName).includes(sub.split(/\s+/)[0].slice(0, 4))
    out.push({
      pass: race.startsWith(stem) ? (subOk ? true : null) : false,
      need: sub ? `${stem} (${sub})` : stem,
    })
  }
  if (/маленьк\S*\s+рас/.test(text)) {
    out.push({ pass: low(ctx.raceSize ?? '') === 'small', need: 'Маленькая раса' })
  }

  for (const cls of CLASSES) {
    if (words.includes(cls)) out.push({ pass: low(ctx.className) === cls, need: cls })
  }

  if (out.length === 0 && /кампани|сеттинг|метк/.test(text)) out.push({ pass: null, need: part.trim() })
  return out
}

export function checkPrereq(prerequisite: string | null | undefined, ctx: PrereqContext): PrereqResult {
  if (!prerequisite?.trim()) return { ok: true, reason: null }
  const missing: string[] = []

  for (const clause of prerequisite.split(';')) {
    // «или» — перечисление вариантов, но не оборот «13 или выше»
    const isOr = /\sили\s(?!выше)/i.test(clause)
    const checks = isOr ? checksIn(clause, ctx) : clause.split(',').flatMap((p) => checksIn(p, ctx))
    if (checks.length === 0) continue
    if (isOr) {
      // «или»: хватит одного выполненного; непроверяемое не запрещает
      if (!checks.some((c) => c.pass !== false)) missing.push(`одно из: ${checks.map((c) => c.need).join(', ')}`)
    } else {
      for (const c of checks) if (c.pass === false) missing.push(c.need)
    }
  }

  return missing.length ? { ok: false, reason: `нужно: ${missing.join('; ')}` } : { ok: true, reason: null }
}
