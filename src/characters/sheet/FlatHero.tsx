import { Award, Dices, Footprints, Heart, Shield, Zap } from 'lucide-react'
import type { SheetView } from '../../types/character'
import { formatDice } from '../../equipment'
import { alignmentAbbr } from '../../create/steps/AlignmentChart'
import type { SheetRoller } from '../sheetPlay'
import { signed } from './rules'
import { HeroPortrait } from './parts'

/** Шапка итога визарда: портрет целиком и главные числа строкой */
export function FlatHero({
  info,
  cls,
  level,
  combat,
  pb,
  portrait,
  fallbackPortrait,
  rollD20,
  rolling,
}: {
  info: SheetView['basic_info']
  cls: { name: string; subclass_name?: string | null }
  level: number
  combat: SheetView['combat']
  pb: number
  portrait: string | null
  fallbackPortrait: string | null
  rollD20: SheetRoller['rollD20']
  rolling: boolean
}) {
  const abbr = alignmentAbbr(info.alignment ?? '')
  return (
    <header className="cw-sheet-hero">
      <span className="cw-sheet-portrait">
        <HeroPortrait own={portrait} fallback={fallbackPortrait} />
        {abbr && <span className="cw-hero-align">{abbr}</span>}
      </span>
      <div className="cw-sheet-id">
        <h2 className="cw-sheet-name gold-text">{info.name}</h2>
        <p className="cw-sheet-who">
          {[info.subrace?.name ?? info.race.name, `${cls.name} ${level} ур.`, cls.subclass_name].filter(Boolean).join(' · ')}
        </p>
        {(info.background || info.alignment) && (
          <p className="cw-sheet-sub">
            {[info.background?.name && `предыстория: ${info.background.name}`, info.alignment].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="cw-sheet-stats">
          <span className="cw-stat cw-stat--ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{combat.armor_class}</b>
            <i>КД</i>
          </span>
          <span className="cw-stat cw-stat--hp" title="Максимум хитов">
            <Heart aria-hidden="true" />
            <b>{combat.hit_points.max}</b>
            <i>хиты</i>
          </span>
          <button
            type="button"
            className="cw-stat cw-stat--roll"
            onClick={() => void rollD20('Инициатива', combat.initiative, undefined, { kind: 'init' })}
            disabled={rolling}
            title="Бросить инициативу"
          >
            <Zap aria-hidden="true" />
            <b>{signed(combat.initiative)}</b>
            <i>инициатива</i>
          </button>
          <span className="cw-stat">
            <Footprints aria-hidden="true" />
            <b>{combat.speed}</b>
            <i>фт. скорость</i>
          </span>
          <span className="cw-stat">
            <Award aria-hidden="true" />
            <b>+{pb}</b>
            <i>мастерство</i>
          </span>
          <span className="cw-stat">
            <Dices aria-hidden="true" />
            <b>{formatDice(combat.hit_dice.total)}</b>
            <i>кости хитов</i>
          </span>
        </div>
      </div>
    </header>
  )
}
