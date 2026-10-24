/**
 * Поп-ап действия. Сервер описывает, что спросить (`prompt.inputs`), клиент
 * рисует поля и отдаёт ответы; варианты, min и max каждый раз берутся из
 * свежего ответа — они зависят от прежних ответов. Поле с `visible_if`
 * показывается, только пока условие истинно для текущих ответов, и скрытое
 * не отправляется. Закрыть поп-ап можно без последствий: состояние персонажа
 * меняется только на `completed`.
 */
import { useMemo, useState } from 'react'
import { Loader2, Search, TriangleAlert, Zap } from 'lucide-react'
import type { PromptInput, PromptOption } from '../types/character'
import { SheetModal } from './SheetModal'
import type { Flow } from './useCharacterEngine'
import { evalVisibleIf } from './visibleIf'
import { CreaturePodium } from './CreaturePodium'

/** Типы «один из списка»: у всех значение — value выбранного варианта */
const SINGLE = new Set(['choice', 'slot_level', 'creature', 'spell', 'skill', 'ability_score', 'damage_type', 'ability'])
/** Длинные списки — с поиском */
const SEARCHABLE = new Set(['creature', 'spell', 'ability'])

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Ответ — массив: multi_choice или список с count (два воззвания, три заклинания) */
const isMulti = (inp: PromptInput) => inp.type === 'multi_choice' || !!inp.multiple

function initialValue(inp: PromptInput): unknown {
  if (inp.default !== undefined && inp.default !== null) return isMulti(inp) && !Array.isArray(inp.default) ? [inp.default] : inp.default
  if (inp.type === 'bool') return false
  if (isMulti(inp)) return []
  if (inp.type === 'number') return inp.min ?? 0
  if (inp.type === 'text') return ''
  // единственный вариант выбираем сразу
  if (SINGLE.has(inp.type) && inp.options?.length === 1) return inp.options[0].value
  return undefined
}

function Options({
  inp,
  value,
  onChange,
}: {
  inp: PromptInput
  value: unknown
  onChange: (v: unknown) => void
}) {
  const raw = inp.options
  const multi = isMulti(inp)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const options = raw ?? []
    const needle = q.trim().toLocaleLowerCase('ru')
    return needle ? options.filter((o) => o.label.toLocaleLowerCase('ru').includes(needle)) : options
  }, [raw, q])
  const options = raw ?? []
  const searchable = SEARCHABLE.has(inp.type) || options.length > 12

  if (options.length === 0) {
    return (
      <p className="cw-field-note act-empty">
        {inp.filtered ? 'Нет подходящих вариантов.' : 'Вариантов нет.'}
        {inp.required ? ' Это решение можно отложить или отклонить.' : ''}
      </p>
    )
  }

  const picked = (o: PromptOption) => (multi ? ((value as unknown[]) ?? []).some((v) => same(v, o.value)) : same(value, o.value))
  const toggle = (o: PromptOption) => {
    // необязательный выбор можно снять повторным нажатием
    if (!multi) return onChange(picked(o) && !inp.required ? undefined : o.value)
    const cur = (value as unknown[]) ?? []
    onChange(picked(o) ? cur.filter((v) => !same(v, o.value)) : [...cur, o.value])
  }

  return (
    <>
      {searchable && (
        <label className="act-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" aria-label={`Поиск: ${inp.label}`} />
        </label>
      )}
      <div className={`act-options${multi ? ' is-multi' : ''}`} role={multi ? 'group' : 'radiogroup'} aria-label={inp.label}>
        {shown.map((o, i) => (
          <button
            key={i}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={picked(o)}
            className={`act-option${picked(o) ? ' is-on' : ''}`}
            onClick={() => toggle(o)}
          >
            <b>{o.label}</b>
            {o.description && <i>{o.description}</i>}
          </button>
        ))}
        {shown.length === 0 && <p className="cw-field-note">Ничего не нашлось.</p>}
      </div>
    </>
  )
}

function Field({
  inp,
  value,
  error,
  onChange,
}: {
  inp: PromptInput
  value: unknown
  error?: string
  onChange: (v: unknown) => void
}) {
  let control
  if (inp.type === 'number') {
    control = (
      <input
        type="number"
        className="ed-input"
        value={typeof value === 'number' ? value : ''}
        min={inp.min ?? undefined}
        max={inp.max ?? undefined}
        step={inp.step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  } else if (inp.type === 'bool') {
    control = (
      <label className="act-bool">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{value === true ? 'да' : 'нет'}</span>
      </label>
    )
  } else if (inp.type === 'text') {
    control = (
      <textarea className="ed-input ed-area" rows={3} maxLength={2000} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    )
  } else if (inp.type === 'creature' && !isMulti(inp)) {
    // дикий облик: звери каруселью на подиуме
    control = <CreaturePodium inp={inp} value={value} onChange={onChange} />
  } else {
    control = <Options inp={inp} value={value} onChange={onChange} />
  }

  const hint = [
    inp.description,
    inp.type === 'number' && (inp.min != null || inp.max != null) ? `от ${inp.min ?? '—'} до ${inp.max ?? '—'}` : null,
    isMulti(inp) && inp.count ? `выберите ровно ${inp.count}` : isMulti(inp) ? 'можно выбрать несколько' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`act-field${error ? ' has-error' : ''}`}>
      <span className="act-label">
        {inp.label}
        {inp.required && <em aria-label="обязательно">*</em>}
        {isMulti(inp) && inp.count ? (
          <b className="act-count">
            {Array.isArray(value) ? value.length : 0} / {inp.count}
          </b>
        ) : null}
      </span>
      {hint && <span className="act-hint">{hint}</span>}
      {control}
      {error && <span className="ed-error">{error}</span>}
    </div>
  )
}

/** Видимые сейчас поля: visible_if проверяется по ответам этого же поп-апа */
const visibleInputs = (inputs: PromptInput[], values: Record<string, unknown>) =>
  inputs.filter((inp) => evalVisibleIf(inp.visible_if, values))

/** Ответ без скрытых полей и без незаполненных необязательных */
function answerOf(inputs: PromptInput[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const inp of visibleInputs(inputs, values)) {
    const v = values[inp.key]
    if (v === undefined || v === '') continue
    out[inp.key] = v
  }
  return out
}

/** Можно ли отправить: обязательные видимые заполнены, у списков с count — ровно count */
function ready(inputs: PromptInput[], values: Record<string, unknown>): boolean {
  return visibleInputs(inputs, values).every((inp) => {
    const v = values[inp.key]
    if (isMulti(inp)) {
      const n = Array.isArray(v) ? v.length : 0
      return inp.count ? n === inp.count : !inp.required || n > 0
    }
    if (!inp.required) return true
    if (SINGLE.has(inp.type) && !(inp.options?.length)) return false
    return v !== undefined && v !== ''
  })
}

export function ActionDialog({
  flow,
  onAnswer,
  onClose,
}: {
  flow: Flow
  onAnswer: (values: Record<string, unknown>) => void
  onClose: () => void
}) {
  const prompt = flow.prompt
  // ответы держим по ключу поп-апа: новый поп-ап — новые значения по умолчанию
  const [state, setState] = useState<{ key: string; values: Record<string, unknown> }>({ key: '', values: {} })
  const values =
    prompt && state.key === prompt.key
      ? state.values
      : Object.fromEntries((prompt?.inputs ?? []).map((inp) => [inp.key, initialValue(inp)]))
  const set = (k: string, v: unknown) => prompt && setState({ key: prompt.key, values: { ...values, [k]: v } })

  const failed = !!flow.message && !flow.busy
  const canSend = !!prompt && !flow.busy && ready(prompt.inputs, values)
  const send = () => prompt && onAnswer(answerOf(prompt.inputs, values))
  const shown = prompt ? visibleInputs(prompt.inputs, values) : []

  return (
    <SheetModal
      title={prompt?.title ?? flow.title}
      kicker={prompt ? flow.title : undefined}
      tone="action"
      visual={<Zap className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            {failed && !prompt ? 'Закрыть' : 'Отмена'}
          </button>
          {prompt && (
            <button type="button" className="cs-btn cw-next" disabled={!canSend} onClick={send}>
              {flow.busy ? <Loader2 className="cw-spin" aria-hidden="true" /> : null}
              {prompt.confirm_label || 'OK'}
            </button>
          )}
        </>
      }
    >
      {prompt?.description && <p className="act-desc">{prompt.description}</p>}
      {flow.message && (
        <p className="act-message" role="alert">
          <TriangleAlert aria-hidden="true" /> {flow.message}
        </p>
      )}
      {!prompt && flow.busy && (
        <p className="muted act-wait">
          <Loader2 className="cw-spin" aria-hidden="true" /> Выполняется…
        </p>
      )}
      {prompt && (
        <form
          className="act-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSend) send()
          }}
        >
          {flow.errors?._ && <p className="act-message">{flow.errors._}</p>}
          {shown.map((inp) => (
            <Field key={inp.key} inp={inp} value={values[inp.key]} error={flow.errors?.[inp.key]} onChange={(v) => set(inp.key, v)} />
          ))}
        </form>
      )}
    </SheetModal>
  )
}
