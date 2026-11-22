/**
 * Раздел «Особые правила»: что выдают способности (величины и «помнить за столом»)
 * можно скрыть из листа, а свои напоминания — дописать.
 */
import { Eye, EyeOff, Plus, Sparkles, Trash2 } from 'lucide-react'
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
              return (
                <div key={`${r.kind}:${r.key}`} className={`ed-rule${off ? ' is-hidden' : ''}`}>
                  <span>
                    {r.label}
                    {r.value ? <b> · {r.value}</b> : null}
                  </span>
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
