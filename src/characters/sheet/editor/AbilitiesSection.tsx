/** Раздел «Характеристики»: базовые значения и КД, хиты, мастерство */
import type { Dispatch, SetStateAction } from 'react'
import { Dumbbell } from 'lucide-react'
import { ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT } from '../../../types/character'
import type { Character, SheetView } from '../../../types/character'
import { AutoNum, EdSection, Stepper } from '../../editorFields'
import { abilityPath, whyText } from '../../sheetView'
import type { CombatField } from '../editorData'
import { signed } from '../rules'

type Combat = { ac: CombatField; hp: CombatField; pb: CombatField }

type Props = {
  c: Character
  set: (patch: Partial<Character>) => void
  view: SheetView
  combat: Combat
  setCombat: Dispatch<SetStateAction<Combat>>
}

export function AbilitiesSection({ c, set, view, combat, setCombat }: Props) {
  return (
    <EdSection
      id="abilities"
      icon={Dumbbell}
      title="Характеристики"
      lead="Базовые значения — бросок или покупка очков ДО расовых бонусов. Бонусы расы, черт и предметов сервер добавит сам; справа — итог на листе. КД, хиты и мастерство ниже можно зафиксировать вручную."
    >
      <div className="ed-abils">
        {ABILITY_KEYS.map((k) => {
          const short = ABILITY_SHORT[k]
          const base = c.base_scores[short] ?? 10
          const total = view.ability_scores[k]
          return (
            <div key={k} className={`ed-abil${total.saving_throw_proficient ? ' is-prof' : ''}`}>
              <span className="ed-abil-head">
                <b>{ABILITY_LABELS[k].abbr}</b>
                <i>{ABILITY_LABELS[k].label}</i>
              </span>
              <Stepper value={base} min={1} max={30} onChange={(v) => set({ base_scores: { ...c.base_scores, [short]: v } })} />
              <span className="ed-abil-mod" title={whyText(view.breakdown, abilityPath(k, 'score'), view.sourceNames)}>
                <i>на листе</i> <b>{total.score}</b>
              </span>
            </div>
          )
        })}
      </div>
      <div className="ed-sub">
        <h5>КД, хиты, мастерство</h5>
        <div className="ed-grid">
          <AutoNum
            label="Класс доспеха"
            auto={combat.ac.auto}
            computed={combat.ac.computed}
            value={combat.ac.value}
            min={0}
            max={40}
            note={combat.ac.auto ? 'по доспеху и ловкости' : `авто было ${combat.ac.computed}`}
            onAuto={(auto) => setCombat((p) => ({ ...p, ac: { ...p.ac, auto, value: auto ? p.ac.value : p.ac.computed } }))}
            onChange={(v) => setCombat((p) => ({ ...p, ac: { ...p.ac, auto: false, value: v } }))}
          />
          <AutoNum
            label="Максимум хитов"
            auto={combat.hp.auto}
            computed={combat.hp.computed}
            value={combat.hp.value}
            min={1}
            max={999}
            note={combat.hp.auto ? 'по костям хитов' : `авто было ${combat.hp.computed}`}
            onAuto={(auto) => setCombat((p) => ({ ...p, hp: { ...p.hp, auto, value: auto ? p.hp.value : p.hp.computed } }))}
            onChange={(v) => setCombat((p) => ({ ...p, hp: { ...p.hp, auto: false, value: v } }))}
          />
          <AutoNum
            label="Бонус мастерства"
            auto={combat.pb.auto}
            computed={combat.pb.computed}
            value={combat.pb.value}
            min={1}
            max={12}
            sign
            note={combat.pb.auto ? 'по уровню героя' : `авто было ${signed(combat.pb.computed)}`}
            onAuto={(auto) => setCombat((p) => ({ ...p, pb: { ...p.pb, auto, value: auto ? p.pb.value : p.pb.computed } }))}
            onChange={(v) => setCombat((p) => ({ ...p, pb: { ...p.pb, auto: false, value: v } }))}
          />
        </div>
      </div>
    </EdSection>
  )
}
