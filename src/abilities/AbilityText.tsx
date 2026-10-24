/**
 * Описание способности — опрятно и со ссылками.
 *
 * Тексты способностей собраны из статей dnd.su и несут следы вёрстки: первой
 * строкой служебное «3-й уровень, умение чемпиона» или «Требование: …»,
 * пробелы перед точками на месте вырезанных ссылок («приведены ниже .»),
 * подзаголовки внутри абзаца («Заговоры. Вы знаете…»), английские названия
 * заклинаний в скобках, перечни преимуществ сплошными абзацами. Здесь это
 * превращается в плашки, жирные подзаголовки и списки, а термины глоссария и
 * заклинания — в ссылки на их статьи.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { normSpellName, useSpellIndex } from '../spellIndex'
import { highlightTerms, useTermIndex, type TermIndex } from '../terms/terms'

export interface ParsedAbilityText {
  /** «3 ур. · умение чемпиона», «Требование: эльф или полуэльф» */
  meta: string[]
  blocks: ({ kind: 'p'; lead: string | null; text: string } | { kind: 'list'; intro: string; items: string[] })[]
}

/** Убирает следы вёрстки: пробел перед знаком, двойные пробелы, пустые скобки */
export function tidyText(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t ]+([.,:;!?»)])/g, '$1')
    .replace(/([«(])[ \t ]+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/\.{2}(?!\.)/g, '.')
    .trim()
}

const LEVEL_LINE = /^(\d+)-(?:й|го|ой)\s+уровень,\s*(.+)$/i
const REQUIRE_LINE = /^Требовани[ея]:\s*(.+)$/i
/** «Заговоры. Вы знаете…» — короткий заголовок без запятых до первой точки */
const LEAD = /^([А-ЯЁA-Z][^.,:;!?«»()\n]{1,58}?)\.\s+(?=[А-ЯЁA-Z«])/
/** С этих слов начинаются обычные предложения, а не подзаголовки */
const NOT_LEAD = /^(Вы|Вам|Вас|Ваш\S*|Если|Когда|Это\S*|Эт[аио]т?|При|В|На|У|Он[аи]?|Оно|Кажд\S*|Все|Некоторые|Теперь|Действием|Пока|После|До|Также|Кроме)\s/
/** …и подзаголовок — именная фраза: без «вы», связок и чисел */
const SENTENCE_HINT = /\d|—|\s(вы|вас|вам|ваш\S*|себя|есть|имеет|является|может|можете|становится|получает|дарят|научила|колеблются|улучшается|усиливается|изменяют|замедляет|считаются|остается|остаётся|должно|должен|требует)(\s|$)/i

export function parseAbilityText(raw: string | null | undefined): ParsedAbilityText {
  const lines = tidyText(raw ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  const meta: string[] = []
  // служебные строки идут в начале: уровень и требование
  while (lines.length) {
    const lvl = LEVEL_LINE.exec(lines[0])
    const req = REQUIRE_LINE.exec(lines[0])
    if (lvl) meta.push(`${lvl[1]} ур. · ${lvl[2]}`)
    else if (req && lines[0].length < 160) meta.push(`Требование: ${req[1]}`)
    else break
    lines.shift()
  }

  const blocks: ParsedAbilityText['blocks'] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // «Вы получаете следующие преимущества:» + короткие абзацы → список
    if (/:\s*$/.test(line) && /следующ|одно из|один из|выберите/i.test(line)) {
      const items: string[] = []
      while (i + 1 < lines.length && lines[i + 1].length <= 400 && !/:\s*$/.test(lines[i + 1])) items.push(lines[++i])
      if (items.length >= 2) {
        blocks.push({ kind: 'list', intro: line, items })
        continue
      }
      i -= items.length
    }
    const lead = LEAD.exec(line)
    const words = lead?.[1].trim().split(/\s+/).length ?? 0
    if (lead && words <= 7 && !NOT_LEAD.test(lead[1]) && !SENTENCE_HINT.test(lead[1]) && line.length > lead[0].length + 10) {
      blocks.push({ kind: 'p', lead: lead[1].trim(), text: line.slice(lead[0].length) })
    } else {
      blocks.push({ kind: 'p', lead: null, text: line })
    }
  }
  return { meta, blocks }
}

/**
 * Ссылки внутри строки: заклинание «волшебная рука [mage hand]» или «Лечащее
 * слово» в кавычках — на страницу заклинания, остальное — термины глоссария.
 */
function linkify(text: string, spells: Map<string, string>, terms: TermIndex, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  // заклинание с английским названием в скобках или любое «…» в кавычках
  const re = /([А-ЯЁа-яё][А-ЯЁа-яё’'\- ]{1,60}?)\s*\[([A-Za-z][A-Za-z’'\-/ ]*)\]|«([^«»]{2,60})»/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  const pushText = (s: string) => {
    if (s) out.push(...highlightTerms(s, terms, `${keyPrefix}t${n++}-`))
  }
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) {
      // хвост из 1–4 слов перед скобкой, который совпадает с русским названием
      const words = m[1].trim().split(/\s+/)
      let hit: { id: string; name: string } | null = null
      for (let k = Math.min(4, words.length); k >= 1 && !hit; k--) {
        const name = words.slice(-k).join(' ')
        const id = spells.get(normSpellName(name))
        if (id) hit = { id, name }
      }
      if (hit) {
        const before = text.slice(last, m.index) + m[1].slice(0, m[1].lastIndexOf(hit.name))
        pushText(before)
        out.push(
          <Link key={`${keyPrefix}s${n++}`} to={`/spells/${hit.id}`} className="term-link ab-spell-link" title={m[2]}>
            {hit.name}
          </Link>,
        )
      } else {
        // заклинания нет в базе — английское название просто убираем
        pushText(text.slice(last, m.index) + m[1])
      }
    } else {
      const id = spells.get(normSpellName(m[3]))
      pushText(text.slice(last, m.index))
      if (id) {
        out.push(
          <Link key={`${keyPrefix}q${n++}`} to={`/spells/${id}`} className="term-link ab-spell-link">
            {m[3]}
          </Link>,
        )
      } else {
        pushText(`«${m[3]}»`)
      }
    }
    last = m.index + m[0].length
  }
  pushText(text.slice(last))
  return out
}

/** Описание способности: плашки уровня и требований, абзацы, списки, ссылки */
export function AbilityText({
  text,
  showMeta = true,
  className = '',
}: {
  text: string | null | undefined
  /** плашки «3 ур. · умение чемпиона» — на листе уровень и так виден */
  showMeta?: boolean
  className?: string
}) {
  const terms = useTermIndex()
  const spells = useSpellIndex()
  const { meta, blocks } = parseAbilityText(text)
  if (!blocks.length && !meta.length) return null
  return (
    <div className={`ab-text rich ${className}`}>
      {showMeta && meta.length > 0 && (
        <p className="ab-meta">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </p>
      )}
      {blocks.map((b, i) =>
        b.kind === 'list' ? (
          <div key={i} className="ab-list">
            <p>{linkify(b.intro, spells, terms, `${i}i`)}</p>
            <ul>
              {b.items.map((it, j) => (
                <li key={j}>{linkify(it, spells, terms, `${i}-${j}`)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p key={i}>
            {b.lead && <b className="ab-lead">{b.lead}. </b>}
            {linkify(b.text, spells, terms, `${i}p`)}
          </p>
        ),
      )}
    </div>
  )
}
