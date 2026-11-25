/**
 * Выборы черты прямо в конструкторе: заклинания «Тронутого тенью», класс и заговоры
 * «Посвящённого в магию», характеристика… Варианты считает сервер (/engine/feat-choices)
 * по тем же правилам, что на листе; ответ на один выбор может поменять варианты другого.
 * Ответы лежат в черновике и после создания героя уходят в его отложенные решения.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { getFeatChoices, type FeatChoices } from '../../api'
import { Field, answerOf, initialValue, ready } from '../../characters/ActionDialog'
import type { Prompt } from '../../types/character'

type Answers = Record<string, Record<string, unknown>>

type Props = {
  featId: string
  edition: string
  answers: Answers
  onChange: (answers: Answers) => void
}

export function FeatChoicesPanel({ featId, edition, answers, onChange }: Props) {
  const [data, setData] = useState<FeatChoices | null>(null)
  const [failed, setFailed] = useState(false)
  const key = JSON.stringify(answers)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      getFeatChoices(featId, edition, JSON.parse(key) as Answers)
        .then((r) => alive && (setData(r), setFailed(false)))
        .catch(() => alive && setFailed(true))
    }, 150)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [featId, edition, key])

  const items = useMemo(
    () => (data?.feat_id === featId ? data.abilities.flatMap((a) => a.choices.filter((c) => c.prompt?.inputs.length)) : []),
    [data, featId],
  )

  if (failed) return null
  if (!data || data.feat_id !== featId) {
    return (
      <p className="cw-block-note cw-featch-load">
        <Loader2 className="spin" aria-hidden="true" /> Загружаю выборы черты…
      </p>
    )
  }
  if (!items.length) return null

  const total = items.length
  const done = items.filter((c) => answers[c.key]).length

  return (
    <div className="cw-featch">
      <h5 className="cw-featch-title">
        <Sparkles aria-hidden="true" /> Выборы черты
        <b className={done === total ? 'is-done' : undefined}>
          {done} / {total}
        </b>
      </h5>
      <p className="cw-block-note">Можно выбрать сейчас — или оставить, тогда лист напомнит после создания.</p>
      {items.map((c) => (
        <ChoiceForm
          key={c.key}
          prompt={c.prompt!}
          answer={answers[c.key]}
          onAnswer={(a) => {
            const { [c.key]: _, ...rest } = answers
            onChange(a ? { ...rest, [c.key]: a } : rest)
          }}
        />
      ))}
    </div>
  )
}

function ChoiceForm({
  prompt,
  answer,
  onAnswer,
}: {
  prompt: Prompt
  answer: Record<string, unknown> | undefined
  onAnswer: (a: Record<string, unknown> | null) => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(prompt.inputs.map((inp) => [inp.key, answer?.[inp.key] ?? initialValue(inp)])),
  )
  const set = (k: string, v: unknown) => {
    const next = { ...values, [k]: v }
    setValues(next)
    onAnswer(ready(prompt.inputs, next) ? answerOf(prompt.inputs, next) : null)
  }
  return (
    <div className={`cw-featch-item${answer ? ' is-done' : ''}`}>
      <span className="cw-featch-name">{prompt.title}</span>
      {prompt.inputs.map((inp) => (
        <Field key={inp.key} inp={inp} value={values[inp.key]} onChange={(v) => set(inp.key, v)} />
      ))}
    </div>
  )
}
