/**
 * Ответы на выборы способностей тем, что игрок уже решил в конструкторе.
 *
 * После создания и повышения уровней сервер выдаёт отложенные решения:
 * навыки класса, «Увеличение характеристик» на 4, 8… уровне. Игрок уже
 * выбрал это на шагах визарда — повторно спрашивать незачем. Отвечаем только
 * на то, что узнаём наверняка (навыки — поле типа skill, ASI — поле mode с
 * вариантами plus2 / plus11 / feat); остальное остаётся плашкой «Требует
 * решения» на листе. Любая ошибка здесь не мешает созданию героя.
 */
import { getSheet, resolvePending } from '../api'
import { ABILITY_SHORT } from '../types/character'
import type { AbilityName, Prompt, PromptInput } from '../types/character'
import type { CharacterDraft } from './draft'

/** Очередь решений визарда: ASI по уровням и навыки первого уровня */
interface Queue {
  asi: { asi: Partial<Record<AbilityName, number>>; feat: boolean }[]
  skills: string[] | null
}

const values = (inp: PromptInput) => new Set((inp.options ?? []).map((o) => String(o.value)))

/** Ответ на поп-ап ASI: mode + a (+ b); null — не наш случай */
function asiAnswer(prompt: Prompt, q: Queue): Record<string, unknown> | null {
  const mode = prompt.inputs.find((i) => i.key === 'mode')
  if (!mode) return null
  const modes = values(mode)
  if (!modes.has('plus2') && !modes.has('plus11')) return null
  const next = q.asi[0]
  if (!next) return null
  const a = prompt.inputs.find((i) => i.key === 'a')
  const b = prompt.inputs.find((i) => i.key === 'b')
  let answer: Record<string, unknown> | null = null
  if (next.feat && modes.has('feat')) {
    answer = { mode: 'feat' }
  } else {
    const ups = Object.entries(next.asi).filter(([, v]) => v) as [AbilityName, number][]
    const two = ups.find(([, v]) => v >= 2)
    if (two && modes.has('plus2')) answer = { mode: 'plus2', a: ABILITY_SHORT[two[0]] }
    else if (ups.length >= 2 && modes.has('plus11')) answer = { mode: 'plus11', a: ABILITY_SHORT[ups[0][0]], b: ABILITY_SHORT[ups[1][0]] }
  }
  if (!answer) return null
  // характеристики должны быть среди вариантов сервера
  if (answer.a && a?.options && !values(a).has(String(answer.a))) return null
  if (answer.b && b?.options && !values(b).has(String(answer.b))) return null
  q.asi.shift()
  return answer
}

/** Ответ на выбор навыков: единственное поле типа skill, все наши навыки в вариантах */
function skillsAnswer(prompt: Prompt, q: Queue): Record<string, unknown> | null {
  if (!q.skills?.length || prompt.inputs.length !== 1) return null
  const inp = prompt.inputs[0]
  if (inp.type !== 'skill' && !(inp.type === 'multi_choice' && [...values(inp)].every((v) => /^[a-z_]+$/.test(v)))) return null
  const allowed = values(inp)
  const picks = q.skills.filter((s) => allowed.has(s))
  const count = inp.count ?? (inp.multiple || inp.type === 'multi_choice' ? picks.length : 1)
  if (picks.length < count || count === 0) return null
  q.skills = null
  const multi = inp.multiple || inp.type === 'multi_choice'
  return { [inp.key]: multi ? picks.slice(0, count) : picks[0] }
}

export async function autoResolveDecisions(characterId: string, draft: CharacterDraft): Promise<void> {
  const q: Queue = {
    asi: draft.levels
      .filter((l) => l.featId || Object.values(l.asi).some(Boolean))
      .map((l) => ({ asi: l.asi, feat: !!l.featId })),
    skills: draft.levels[0]?.skills.length ? [...draft.levels[0].skills] : null,
  }
  if (!q.asi.length && !q.skills) return

  const sheet = await getSheet(characterId)
  for (const d of sheet.pending_decisions) {
    if (d.kind !== 'choice') continue
    if (!q.asi.length && !q.skills) break
    try {
      const first = await resolvePending(characterId, d.id, {})
      if (first.status !== 'needs_input' || !first.prompt) continue
      const answer = asiAnswer(first.prompt, q) ?? skillsAnswer(first.prompt, q)
      if (!answer) continue
      await resolvePending(characterId, d.id, { [first.prompt.key]: answer })
    } catch {
      // не вышло — решение останется на листе, игрок ответит сам
    }
  }
}
