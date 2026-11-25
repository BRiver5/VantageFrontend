/**
 * Раздел «Особые правила»: что выдают способности (величины и «помнить за столом»)
 * можно скрыть из листа, переписать карандашом, а свои напоминания — дописать.
 */
import { useState } from 'react'
import { Check, Eye, EyeOff, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import type { Character, SheetView } from '../../../types/character'
import { EdSection } from '../../editorFields'

type Props = {
  c: Character
  set: (patch: Partial<Character>) => void
  view: SheetView
}

export function RulesSection({ c, set, view }: Props) {
  const rules = view.extras?.allRules ?? []
  const hidden = new Set(c.hidden_rules ?? [])
  const custom = c.custom_rules ?? []
  const toggle = (key: string) =>
    set({ hidden_rules: hidden.has(key) ? [...hidden].filter((k) => k !== key) : [...hidden, key] })
  const setCustom = (list: string[]) => set({ custom_rules: list })
  const names = c.rule_labels ?? {}
  const [editing, setEditing] = useState<string | null>(null)
  /** своя подпись правила; пустая — вернуть подпись умения */
  const rename = (key: string, text: string) => {
    const { [key]: _, ...rest } = names
    set({ rule_labels: text.trim() ? { ...rest, [key]: text } : rest })
  }

  return (
    <EdSection
      id="rules"
      icon={Sparkles}
      title="Особые правила"
      lead="Величины и напоминания, которые выдают умения. Ненужное можно скрыть с листа, своё — дописать."
      actions={
        <button type="button" className="ed-btn" onClick={() => setCustom([...custom, ''])}>
          <Plus aria-hidden="true" /> правило
        </button>
      }
    >
      {rules.length > 0 && (
        <div className="ed-sub">
          <h5>От умений</h5>
          <div className="ed-rules">
            {rules.map((r) => {
              const off = hidden.has(r.key)
              const own = names[r.key]
              return (
                <div key={`${r.kind}:${r.key}`} className={`ed-rule${off ? ' is-hidden' : ''}`}>
                  {editing === r.key ? (
                    <input
                      className="ed-input"
                      autoFocus
                      value={own ?? r.label}
                      maxLength={300}
                      onChange={(e) => rename(r.key, e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setEditing(null)}
                      aria-label="Подпись правила"
                    />
                  ) : (
                    <span>
                      {own ?? r.label}
                      {r.value ? <b> · {r.value}</b> : null}
                      {own && <i className="ed-grant-note"> · изменено</i>}
                    </span>
                  )}
                  {editing === r.key ? (
                    <button type="button" className="ed-btn ed-btn--icon is-on" onClick={() => setEditing(null)} title="Готово" aria-label="Готово">
                      <Check aria-hidden="true" />
                    </button>
                  ) : (
                    <button type="button" className="ed-btn ed-btn--icon" onClick={() => setEditing(r.key)} title="Переписать" aria-label={`Переписать «${own ?? r.label}»`}>
                      <Pencil aria-hidden="true" />
                    </button>
                  )}
                  {own && editing !== r.key && (
                    <button type="button" className="ed-btn ed-btn--icon" onClick={() => rename(r.key, '')} title="Вернуть исходную подпись" aria-label="Вернуть исходную подпись">
                      <RotateCcw aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`ed-btn ed-btn--icon${off ? '' : ' is-on'}`}
                    onClick={() => toggle(r.key)}
                    title={off ? 'Показывать в листе' : 'Скрыть из листа'}
                    aria-label={off ? 'Показывать в листе' : 'Скрыть из листа'}
                  >
                    {off ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="ed-sub">
        <h5>Свои напоминания</h5>
        {custom.length > 0 ? (
          <div className="ed-rules">
            {custom.map((text, i) => (
              <div key={i} className="ed-rule">
                <input
                  className="ed-input"
                  value={text}
                  maxLength={300}
                  placeholder="Например: преимущество на спасброски от яда"
                  onChange={(e) => setCustom(custom.map((t, j) => (j === i ? e.target.value : t)))}
                  aria-label="Своё правило"
                />
                <button
                  type="button"
                  className="ed-btn ed-btn--icon is-danger"
                  onClick={() => setCustom(custom.filter((_, j) => j !== i))}
                  title="Удалить"
                  aria-label="Удалить правило"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="ed-empty">Своих напоминаний нет — добавьте кнопкой справа сверху.</p>
        )}
      </div>
    </EdSection>
  )
}
