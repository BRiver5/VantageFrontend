/** Шапка уровня: медаль, класс, бонус мастерства, кость хитов */
import { Check } from 'lucide-react'
import { DieImage, hitDieType } from '../../../dice/diceAssets'
import { proficiencyBonus } from '../../dnd5e'
import type { CharacterDraft, LevelChoice } from '../../draft'

type Props = {
  draft: CharacterDraft
  choice: LevelChoice
  level: number
  className: string
  hitDie: number
  charLevel: number
  subclassLevel: number
  characterLevel: number | undefined
}

export function LevelHero({ draft, choice, level, className, hitDie, charLevel, subclassLevel, characterLevel }: Props) {
  return (
    <header className="cw-lvl-hero">
      <span className="cw-path-medal cw-lvl-medal">
        <span>
          <b key={level}>{level}</b>
          <i>уровень</i>
        </span>
      </span>
      <div className="cw-lvl-title">
        <b className="gold-text">{className}</b>
        <span>
          {characterLevel ? `${characterLevel} ур. героя · ` : ''}бонус мастерства +{proficiencyBonus(charLevel)}
          {draft.subclass && level >= subclassLevel ? ` · ${draft.subclass.subclass_name}` : ''}
        </span>
      </div>
      <span className="cw-lvl-die" title={`Кость хитов к${hitDie}`}>
        <DieImage type={hitDieType(hitDie)} size={54} />
        <i>к{hitDie}</i>
      </span>
      {choice.done && (
        <span className="cw-level-done" aria-label="Уровень принят">
          <Check aria-hidden="true" /> принят
        </span>
      )}
    </header>
  )
}
