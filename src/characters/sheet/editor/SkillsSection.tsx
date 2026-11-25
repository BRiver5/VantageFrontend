/**
 * Раздел «Навыки и спасброски»: владение и компетентность вручную.
 * «Авто» — как считает движок (раса, класс, предыстория, черты); иначе — ручное значение
 * листа (оверрайд пути char.skills.<навык>.prof / char.abilities.<хар>.save_prof).
 */
import { Target } from 'lucide-react'
import { ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT, DEFAULT_SKILLS } from '../../../types/character'
import type { SheetView } from '../../../types/character'
import { EdSection } from '../../editorFields'

type Props = {
  view: SheetView
  /** сохранённые оверрайды листа */
  overrides: Record<string, unknown>
  /** правки в этом окне: путь → значение (null — снять) */
  manual: Record<string, unknown>
  setManual: (path: string, value: unknown) => void
}

const SKILL_STATES: { value: number | null; label: string; title: string }[] = [
  { value: null, label: 'авто', title: 'Как считает лист' },
  { value: 0, label: '—', title: 'Без владения' },
  { value: 1, label: 'влад.', title: 'Владение' },
  { value: 2, label: 'комп.', title: 'Компетентность (двойной бонус)' },
]
const SAVE_STATES = SKILL_STATES.slice(0, 3)

export function SkillsSection({ view, overrides, manual, setManual }: Props) {
  /** текущий выбор: правка в окне → сохранённый оверрайд → авто */
  const current = (path: string): number | null => {
    const v = path in manual ? manual[path] : overrides[path]
    return typeof v === 'number' ? v : null
  }
  const row = (path: string, label: string, auto: string, states: typeof SKILL_STATES) => {
    const cur = current(path)
    return (
      <div key={path} className="ed-skill">
        <span className="ed-skill-name">
          {label}
          <i>{cur === null ? `авто: ${auto}` : 'вручную'}</i>
        </span>
        <span className="ed-seg ed-seg--sm" role="radiogroup" aria-label={label}>
          {states.map((s) => (
            <button
              key={String(s.value)}
              type="button"
              role="radio"
              aria-checked={cur === s.value}
              className={cur === s.value ? 'is-on' : undefined}
              title={s.title}
              onClick={() => setManual(path, s.value)}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>
    )
  }

  return (
    <EdSection
      id="skills"
      icon={Target}
      title="Навыки и спасброски"
      lead="Владение и компетентность поверх расчёта: добавить навык, которого нет, или убрать лишний. «Авто» возвращает как считает лист."
    >
      <div className="ed-sub">
        <h5>Навыки</h5>
        <div className="ed-skills">
          {DEFAULT_SKILLS.map((s) => {
            const sk = view.skills[s.key]
            const auto = sk?.expertise ? 'компетентность' : sk?.proficient ? 'владение' : 'нет'
            return row(`char.skills.${s.key}.prof`, s.label, auto, SKILL_STATES)
          })}
        </div>
      </div>
      <div className="ed-sub">
        <h5>Спасброски</h5>
        <div className="ed-skills">
          {ABILITY_KEYS.map((k) =>
            row(
              `char.abilities.${ABILITY_SHORT[k]}.save_prof`,
              ABILITY_LABELS[k].label,
              view.ability_scores[k]?.saving_throw_proficient ? 'владение' : 'нет',
              SAVE_STATES,
            ),
          )}
        </div>
      </div>
    </EdSection>
  )
}
