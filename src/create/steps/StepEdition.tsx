/**
 * Переключатель редакции каталога шага конструктора: компактный шестигранник
 * с подписью. По умолчанию шаг показывает записи редакции героя; другой
 * вариант — смешение (раса 2014 у героя 2024). Выбранное на шаге не
 * сбрасывается: запись остаётся со своим id.
 */
import { EditionToggle } from '../../ui/EditionToggle'
import { stepEdition, withStepEdition, type StepSection } from '../createEdition'
import type { StepProps } from '../draft'

const LABEL: Record<StepSection, string> = {
  races: 'Расы',
  classes: 'Классы',
  backgrounds: 'Предыстории',
  feats: 'Черты',
  spells: 'Заклинания',
}

export function StepEdition({ draft, update, section, note }: StepProps & { section: StepSection; note?: string | null }) {
  const value = stepEdition(draft, section)
  const mixed = value !== draft.edition
  return (
    <div className={`cw-step-ed${mixed ? ' is-mixed' : ''}`}>
      <span className="cw-step-ed-label">{LABEL[section]} редакции</span>
      <EditionToggle
        size="compact"
        value={value}
        onChange={(e) => update(withStepEdition(draft, section, e))}
        title={`${LABEL[section]}: каталог ${value}. Герой — по правилам ${draft.edition}`}
      />
      {mixed && <span className="cw-step-ed-note">герой — {draft.edition}</span>}
      {note && <span className="cw-step-ed-note">{note}</span>}
    </div>
  )
}
