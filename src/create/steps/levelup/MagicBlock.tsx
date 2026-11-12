/** Магия уровня: новые ячейки, заговоры и заклинания */
import { Sparkles } from 'lucide-react'
import type { Spell } from '../../../api'
import { Constellation } from '../../../characters/SpellBook'
import type { LevelChoice } from '../../draft'
import type { LevelRequirements } from './LevelParts'
import { SpellPicker } from './SpellPicker'

type Props = {
  req: LevelRequirements
  choice: LevelChoice
  className: string
  prepared: boolean
  cantripOptions: Spell[]
  classSpells: Spell[]
  takenSpellIds: Set<string>
  spellsLoading: boolean
  patchLevel: (patch: Partial<LevelChoice>) => void
}

export function MagicBlock({ req, choice, className, prepared, cantripOptions, classSpells, takenSpellIds, spellsLoading, patchLevel }: Props) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <Sparkles aria-hidden="true" /> Магия
      </h4>

      {req.newSlots.length > 0 && (
        <div className="cw-slot-rail cw-slot-rail--levelup">
          {req.slots.map((s) => (
            <Constellation
              key={s.circle}
              circle={s.circle}
              max={s.count}
              used={0}
              fresh={Math.max(0, s.count - s.before)}
              locked
            />
          ))}
        </div>
      )}

      {prepared && (
        <p className="cw-block-note">
          {className} готовит заклинания из всего списка — набор выберете на шаге «Заклинания».
        </p>
      )}

      {req.cantripsNeeded > 0 && (
        <SpellPicker
          title={`Заговоры — выберите ${req.cantripsNeeded}`}
          count={req.cantripsNeeded}
          picked={choice.cantrips}
          options={cantripOptions.filter((s) => !takenSpellIds.has(s.id))}
          loading={spellsLoading}
          onChange={(cantrips) => patchLevel({ cantrips })}
        />
      )}

      {req.spellsNeeded > 0 && (
        <SpellPicker
          title={`Заклинания — выберите ${req.spellsNeeded}`}
          count={req.spellsNeeded}
          picked={choice.spells}
          options={classSpells.filter(
            (s) =>
              s.spell_level >= 1 &&
              s.spell_level <= req.maxCircle &&
              !takenSpellIds.has(s.id),
          )}
          onChange={(spells) => patchLevel({ spells })}
          loading={spellsLoading}
        />
      )}
    </section>
  )
}
