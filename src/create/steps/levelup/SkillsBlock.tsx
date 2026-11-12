/** Навыки первого уровня класса */
import { Award } from 'lucide-react'
import { ABILITY_LABELS } from '../../../types/character'
import type { LevelChoice } from '../../draft'
import type { LevelRequirements } from './LevelParts'
import { SKILL_BY_KEY } from './skillByKey'

type Props = {
  req: LevelRequirements
  choice: LevelChoice
  backgroundSkills: Set<string>
  patchLevel: (patch: Partial<LevelChoice>) => void
}

export function SkillsBlock({ req, choice, backgroundSkills, patchLevel }: Props) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <Award aria-hidden="true" /> Навыки — выберите {req.skillsNeeded}
        <span className="cw-block-count">
          {choice.skills.length} / {req.skillsNeeded}
        </span>
      </h4>
      {backgroundSkills.size > 0 && (
        <p className="cw-block-note">
          Предыстория уже дала:{' '}
          {[...backgroundSkills].map((k) => SKILL_BY_KEY.get(k)?.label ?? k).join(', ')}
        </p>
      )}
      <div className="cw-pills">
        {req.skillOptions.map((key) => {
          const skill = SKILL_BY_KEY.get(key)
          const on = choice.skills.includes(key)
          const full = choice.skills.length >= req.skillsNeeded
          return (
            <button
              key={key}
              type="button"
              className={`cw-pill${on ? ' is-on' : ''}`}
              disabled={!on && full}
              onClick={() =>
                patchLevel({
                  skills: on
                    ? choice.skills.filter((s) => s !== key)
                    : [...choice.skills, key],
                })
              }
            >
              {skill?.label ?? key}
              <i>{skill ? ABILITY_LABELS[skill.ability].abbr : ''}</i>
            </button>
          )
        })}
      </div>
    </section>
  )
}
