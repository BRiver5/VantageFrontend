/** Магия уровня: новые ячейки, заговоры и заклинания */
import { normSpellName } from '../../../spellIndex'
import type { Edition } from '../../../editions/edition'
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
  /** уже есть у героя или выбрано на других уровнях — по id и по названию (normSpellName) */
  takenSpellIds: Set<string>
  takenSpellNames?: Set<string>
  spellsLoading: boolean
  patchLevel: (patch: Partial<LevelChoice>) => void
  /** редакция заклинаний шага: при поиске найдутся и заклинания другой редакции */
  edition?: Edition | null
}

export function MagicBlock({ req, choice, className, prepared, cantripOptions, classSpells, takenSpellIds, takenSpellNames, spellsLoading, patchLevel, edition }: Props) {
  const owned = (s: Spell) =>
    takenSpellIds.has(s.id) || !!takenSpellNames?.has(normSpellName(s.spell_name)) ? 'уже есть' : null
  const ofClass = (s: Spell) => !!s.available_classes?.some((c) => c.toLocaleLowerCase('ru').trim() === className.toLocaleLowerCase('ru'))
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
          options={cantripOptions}
          ownedReason={owned}
          loading={spellsLoading}
          onChange={(cantrips) => patchLevel({ cantrips })}
          edition={edition}
          acceptOther={(s) => s.spell_level === 0 && ofClass(s)}
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
              s.spell_level <= req.maxCircle,
          )}
          onChange={(spells) => patchLevel({ spells })}
          loading={spellsLoading}
          edition={edition}
          acceptOther={(s) => s.spell_level >= 1 && s.spell_level <= req.maxCircle && ofClass(s)}
          ownedReason={owned}
        />
      )}
    </section>
  )
}
