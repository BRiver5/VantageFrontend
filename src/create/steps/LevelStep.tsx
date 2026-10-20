/**
 * Шаг 4 — целевой уровень. Прокачка всё равно пойдёт по одному уровню, здесь
 * игрок только решает, до какой ступени дойти, и сразу видит, что его ждёт.
 */
import { Award, Shield, Sparkles, TrendingUp } from 'lucide-react'
import type { StepProps } from '../draft'
import { resizeLevels } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import {
  asiLevels,
  casterKind,
  proficiencyBonus,
  spellSlotsAt,
  subclassLevelFallback,
} from '../dnd5e'
import { FactChip, StepHeader, StepPanel } from './ui'

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)

export default function LevelStep({
  draft,
  update,
  bundle,
}: StepProps & { bundle: ClassBundle | null }) {
  const className = draft.cls?.class_name ?? ''
  const level = draft.targetLevel
  const kind = casterKind(className, draft.cls?.is_caster)

  // уровень подкласса: у API он на самих подклассах, иначе таблица PHB
  const subclassLevel =
    bundle?.subs.find((s) => s.level_available != null)?.level_available ??
    subclassLevelFallback(className)

  const asi = asiLevels(className).filter((l) => l <= level)
  const slots = spellSlotsAt(kind, level)
  const topCircle = Object.keys(slots).map(Number).sort((a, b) => b - a)[0]

  return (
    <div className="cw-step">
      <StepHeader
        kicker="ступень четвёртая"
        title="До какой ступени подняться?"
        lead="Каждый уровень будет выдан отдельно — с броском кости хитов и выбором того, что он принёс."
      />

      <div className="cw-levels">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            className={`cw-level-hex${l === level ? ' is-active' : ''}${l < level ? ' is-passed' : ''}`}
            onClick={() =>
              update({ targetLevel: l, levels: resizeLevels(draft.levels, l) })
            }
            aria-pressed={l === level}
          >
            {l}
          </button>
        ))}
      </div>

      <StepPanel className="cw-level-summary">
        <h3 className="cw-dossier-name gold-text">{level} уровень</h3>
        <div className="cw-card-chips cw-dossier-chips">
          <FactChip icon={TrendingUp}>бонус мастерства +{proficiencyBonus(level)}</FactChip>
          {level >= subclassLevel && draft.cls && (
            <FactChip icon={Shield}>подкласс с {subclassLevel} ур.</FactChip>
          )}
          {asi.length > 0 && (
            <FactChip icon={Award}>усиления: {asi.join(', ')} ур.</FactChip>
          )}
          {topCircle && (
            <FactChip icon={Sparkles}>
              {kind === 'pact' ? `ячейки ${topCircle} круга` : `заклинания до ${topCircle} круга`}
            </FactChip>
          )}
        </div>
        <p className="cw-dossier-line">
          {level === 1
            ? 'Первый уровень: максимум кости хитов, владения класса и навыки на выбор.'
            : `Впереди ${level} шагов прокачки — кость хитов, умения и новые возможности на каждом.`}
        </p>
      </StepPanel>
    </div>
  )
}
