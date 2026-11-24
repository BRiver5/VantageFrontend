/**
 * Описание вида 2024 приходит плоским текстом (абзацы через пустую строку):
 *   1) «Тип существа: Гуманоид. Размер: …. Скорость: 30 футов.»
 *   2) особенности строками «Название. Текст» (продолжения — отдельными строками; строка,
 *      кончающаяся «:», открывает варианты — следующие «Название. Текст» идут внутрь);
 *   3) «Варианты: Высший эльф, …» — если у вида есть линии наследия;
 *   4) рассказ о виде.
 * Здесь это раскладывается на части для красивой страницы.
 */

export interface RaceTrait {
  name: string
  /** абзацы особенности */
  body: string[]
  /** варианты внутри особенности: формы Небесного откровения и т.п. */
  options: { name: string; body: string }[]
}

export interface RaceText {
  params: [string, string][]
  traits: RaceTrait[]
  variants: string | null
  lore: string
}

const PARAM = /(Тип существа|Размер|Скорость)\s*:\s*/g
const POINT = /^([А-ЯЁA-Z][^.:!?\n]{1,60})\.\s+(\S[\s\S]*)$/
const SENTENCE_START = /^(Вы|Вам|Вас|Ваш|Ваша|Ваше|Ваши|Когда|Если|Пока|Это|Эта|Этот|При|После|Каждый|Каждая|Один|Одна|Как|Тот|Та|Те|В|На|С|До|Чтобы|Существо|Цель|Затем|Также|Кроме)(?=\s|$)/

function point(line: string): { name: string; body: string } | null {
  const m = POINT.exec(line.trim())
  if (!m) return null
  const name = m[1].trim()
  if (SENTENCE_START.test(name) || name.split(/\s+/).length > 5) return null
  return { name, body: m[2].trim() }
}

/** Похоже ли описание на плоский текст вида 2024 */
export const isRaceText2024 = (text: string | null | undefined) => /^\s*Тип существа\s*:/.test(text ?? '')

export function parseRaceText(text: string): RaceText {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const out: RaceText = { params: [], traits: [], variants: null, lore: '' }
  const lore: string[] = []
  blocks.forEach((block, i) => {
    if (i === 0 && isRaceText2024(block)) {
      const parts = block.split(PARAM).slice(1)
      for (let j = 0; j + 1 < parts.length; j += 2) out.params.push([parts[j], parts[j + 1].trim().replace(/\.$/, '')])
      return
    }
    if (/^Варианты\s*:/.test(block)) {
      out.variants = block.replace(/^Варианты\s*:\s*/, '').replace(/\.$/, '')
      return
    }
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    // блок особенностей: первая строка — «Название. Текст»
    if (!out.traits.length && lines.length && point(lines[0])) {
      let cur: RaceTrait | null = null
      let options = false
      for (const line of lines) {
        const p = point(line)
        if (p && cur && options) {
          cur.options.push(p)
          continue
        }
        if (p) {
          cur = { name: p.name, body: [p.body], options: [] }
          out.traits.push(cur)
          options = false
          continue
        }
        if (!cur) continue
        cur.body.push(line)
        options = line.endsWith(':')
      }
      return
    }
    lore.push(block)
  })
  out.lore = lore.join('\n\n')
  return out
}
