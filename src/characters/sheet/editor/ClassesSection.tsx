/** Раздел «Класс и уровень»: классы, подклассы, мультикласс */
import { GraduationCap, Plus, Trash2 } from 'lucide-react'
import type { GameClass, Subclass } from '../../../api'
import type { Character, ClassLevel } from '../../../types/character'
import { EdField, EdSection, Stepper } from '../../editorFields'

type Props = {
  c: Character
  level: number
  classCatalog: GameClass[]
  subclasses: Record<string, Subclass[]>
  setClasses: (fn: (list: ClassLevel[]) => ClassLevel[]) => void
  setClass: (i: number, patch: Partial<ClassLevel>) => void
}

export function ClassesSection({ c, level, classCatalog, subclasses, setClasses, setClass }: Props) {
  return (
    <EdSection
      id="classes"
      icon={GraduationCap}
      title="Класс и уровень"
      lead="Обычно уровень повышают кнопкой «Новый уровень» на листе: там бросок хитов, выбор подкласса и список новых умений. Здесь — правка вручную."
      actions={
        <button
          type="button"
          className="ed-btn"
          onClick={() => setClasses((list) => [...list, { class_id: '', level: 1, subclass_id: null, hp_rolls: [] }])}
          disabled={level >= 20}
        >
          <Plus aria-hidden="true" /> мультикласс
        </button>
      }
    >
      <div className="ed-table ed-table--classes">
        <div className="ed-tr ed-th">
          <span>Класс</span>
          <span>Подкласс</span>
          <span>Уровень</span>
          <span>Кость хитов</span>
          <span />
        </div>
        {c.classes.map((cl, i) => {
          const cat = classCatalog.find((x) => x.id === cl.class_id)
          const subs = subclasses[cl.class_id] ?? []
          return (
            <div key={i} className="ed-tr">
              <select
                className="ed-input ed-select"
                value={cl.class_id}
                onChange={(e) => setClass(i, { class_id: e.target.value, subclass_id: null })}
                aria-label="Класс"
              >
                <option value="">— класс —</option>
                {classCatalog.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.class_name}
                  </option>
                ))}
              </select>
              <select
                className="ed-input ed-select"
                value={cl.subclass_id ?? ''}
                disabled={subs.length === 0}
                onChange={(e) => setClass(i, { subclass_id: e.target.value || null })}
                aria-label="Подкласс"
              >
                <option value="">{cat?.subclass_level && cl.level < cat.subclass_level ? `с ${cat.subclass_level} ур.` : 'нет'}</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subclass_name}
                  </option>
                ))}
              </select>
              <Stepper
                value={cl.level}
                min={1}
                max={20 - (level - cl.level)}
                onChange={(v) =>
                  // броски хитов — по одному на уровень после первого
                  setClass(i, { level: v, hp_rolls: cl.hp_rolls.slice(0, Math.max(0, i === 0 ? v - 1 : v)) })
                }
              />
              <span className="ed-readout">к{cat?.hit_dice ?? '—'}</span>
              <button
                type="button"
                className="ed-btn ed-btn--icon is-danger"
                onClick={() => setClasses((list) => list.filter((_, j) => j !== i))}
                disabled={c.classes.length <= 1}
                title="Убрать класс"
                aria-label="Убрать класс"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="ed-grid">
        <EdField label="Общий уровень" hint="сумма классов">
          <span className="ed-readout">{level}</span>
        </EdField>
      </div>
    </EdSection>
  )
}
