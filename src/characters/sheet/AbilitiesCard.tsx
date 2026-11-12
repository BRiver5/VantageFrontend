import { Eye, ShieldCheck } from 'lucide-react'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'
import type { AbilityName, SheetView } from '../../types/character'
import type { SheetRoller } from '../sheetPlay'
import { abilityPath } from '../sheetView'
import { WhyDot } from '../WhyPopover'
import { signed } from './rules'
import { Card } from './parts'

/** Карточка «Характеристики и навыки»: проверки, спасброски и навыки — кликом */
export function AbilitiesCard({
  sheet,
  mod,
  score,
  pb,
  rollD20,
  rolling,
}: {
  sheet: SheetView
  mod: (k: AbilityName) => number
  score: (k: AbilityName) => number
  pb: number
  rollD20: SheetRoller['rollD20']
  rolling: boolean
}) {
  // навыки с владением — первыми: ими пользуются чаще; компетентность — двойное мастерство
  const skillRows = DEFAULT_SKILLS.map((s) => {
    const entry = sheet.skills[s.key]
    const prof = !!entry?.proficient
    const expert = prof && !!entry?.expertise
    const ability = entry?.ability ?? s.ability
    return { ...s, ability, prof, expert, bonus: entry?.modifier ?? mod(ability) + (expert ? pb * 2 : prof ? pb : 0) }
  }).sort((a, b) => Number(b.prof) - Number(a.prof) || a.label.localeCompare(b.label, 'ru'))

  return (
    <Card title="Характеристики и навыки" icon={ShieldCheck} className="cw-sheet-card--abilities">
      <div className="cw-abil-grid">
        {ABILITY_KEYS.map((k) => {
          const label = ABILITY_LABELS[k]
          const saveProf = sheet.ability_scores[k].saving_throw_proficient
          const save = sheet.ability_scores[k].save ?? mod(k) + (saveProf ? pb : 0)
          return (
            <div key={k} className={`cw-abil${saveProf ? ' is-prof' : ''}`}>
              <button
                type="button"
                className="cw-abil-check"
                onClick={() => void rollD20(`${label.label}, проверка`, mod(k), undefined, { kind: 'check', ability: k })}
                disabled={rolling}
                title={`Проверка: к20 ${signed(mod(k))}`}
              >
                <i>{label.abbr}</i>
                <b>{score(k)}</b>
                <em>{signed(mod(k))}</em>
                <WhyDot req={{ path: abilityPath(k, 'score'), title: label.label, total: score(k), baseLabel: 'Базовое значение' }} />
              </button>
              <button
                type="button"
                className="cw-abil-save"
                onClick={() => void rollD20(`${label.label}, спасбросок`, save, undefined, { kind: 'save', ability: k })}
                disabled={rolling}
                title={saveProf ? 'Спасбросок — владение' : 'Спасбросок'}
              >
                спас <b>{signed(save)}</b>
                <WhyDot req={{ path: abilityPath(k, 'save'), title: `Спасбросок: ${label.label}`, total: save }} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="beast-skills cw-skill-buttons cw-skill-cols">
        {skillRows.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`beast-skill${s.prof ? ' is-prof' : ''}${s.expert ? ' is-expert' : ''}`}
            onClick={() => void rollD20(s.label, s.bonus, undefined, { kind: 'skill', skill: s.key, ability: s.ability })}
            disabled={rolling}
            title={s.expert ? 'Компетентность: двойной бонус мастерства' : undefined}
          >
            <span className="beast-skill-bonus">{signed(s.bonus)}</span>
            <span className="beast-skill-name">{s.label}</span>
            <span className="beast-skill-ab">{ABILITY_LABELS[s.ability].abbr}</span>
            <WhyDot req={{ path: `char.skills.${s.key}.bonus`, title: s.label, total: s.bonus }} />
          </button>
        ))}
      </div>
      <p className="cw-passive">
        <Eye aria-hidden="true" /> пассивная внимательность <b>{sheet.combat.passive_perception}</b>
      </p>
    </Card>
  )
}
