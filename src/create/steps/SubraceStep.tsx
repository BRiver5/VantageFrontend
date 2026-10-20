/**
 * Шаг 2 — подраса. Показывается только у рас, у которых подрасы есть; арта у
 * подрас в API нет, поэтому карточки берут арт родительской расы.
 */
import { Eye, Footprints, Languages, Users } from 'lucide-react'
import { ABILITY_RU, descriptionPreview, realImage } from '../../api'
import type { Subrace } from '../../api'
import type { StepProps } from '../draft'
import { ChoiceCard, FactChip, StepHeader } from './ui'

export default function SubraceStep({
  draft,
  update,
  subraces,
}: StepProps & { subraces: Subrace[] }) {
  const parentArt = realImage(draft.race?.image_gallery)

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader
        kicker="ступень вторая"
        title={`Ветвь народа «${draft.race?.race_name ?? ''}»`}
        lead="Подраса добавляет свои бонусы характеристик, языки и особенности поверх расовых."
      />

      <div className="cw-grid">
        {subraces.map((sr) => {
          const boosts = Object.entries(sr.increase_ability_scores ?? {})
          return (
            <ChoiceCard
              key={sr.id}
              art={parentArt}
              icon={Users}
              name={sr.subrace_name}
              chips={
                <>
                  {boosts.map(([k, v]) => (
                    <FactChip key={k}>
                      {ABILITY_RU[k] ?? k} +{v}
                    </FactChip>
                  ))}
                  {sr.speed_bonus > 0 && (
                    <FactChip icon={Footprints}>скорость +{sr.speed_bonus} фт.</FactChip>
                  )}
                  {sr.darkvision_override != null && (
                    <FactChip icon={Eye}>тьма {sr.darkvision_override} фт.</FactChip>
                  )}
                  {sr.extra_languages && sr.extra_languages.length > 0 && (
                    <FactChip icon={Languages}>{sr.extra_languages.join(', ')}</FactChip>
                  )}
                </>
              }
              description={descriptionPreview(sr.traits ?? sr.description, 220)}
              selected={draft.subrace?.id === sr.id}
              onSelect={() => update({ subrace: sr })}
            />
          )
        })}
      </div>
    </div>
  )
}
