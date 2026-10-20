/**
 * Шаг 2 — подраса. Показывается только у рас, у которых подрасы есть; арта у
 * подрас в API нет, поэтому карточки берут арт родительской расы.
 */
import { useCallback, useState } from 'react'
import { Eye, Footprints, Languages, Users } from 'lucide-react'
import { ABILITY_RU, realImage } from '../../api'
import type { Subrace } from '../../api'
import { RichText } from '../../terms/terms'
import type { StepProps } from '../draft'
import { ChoiceModal, FactChip, ModalLine, ModalSection, PickCard, PickGrid, StepHeader } from './ui'

function SubraceFacts({ sr }: { sr: Subrace }) {
  const boosts = Object.entries(sr.increase_ability_scores ?? {})
  return (
    <>
      {boosts.map(([k, v]) => (
        <FactChip key={k}>
          {ABILITY_RU[k] ?? k} +{v}
        </FactChip>
      ))}
      {sr.speed_bonus > 0 && <FactChip icon={Footprints}>+{sr.speed_bonus} фт.</FactChip>}
      {sr.darkvision_override != null && (
        <FactChip icon={Eye}>тьма {sr.darkvision_override} фт.</FactChip>
      )}
    </>
  )
}

export default function SubraceStep({
  draft,
  update,
  subraces,
}: StepProps & { subraces: Subrace[] }) {
  const parentArt = realImage(draft.race?.image_gallery)
  const [open, setOpen] = useState<Subrace | null>(null)
  const close = useCallback(() => setOpen(null), [])

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader title={`Ветвь народа «${draft.race?.race_name ?? ''}»`} />

      <PickGrid>
        {subraces.map((sr) => (
          <PickCard
            key={sr.id}
            art={parentArt}
            icon={Users}
            name={sr.subrace_name}
            selected={draft.subrace?.id === sr.id}
            onOpen={() => setOpen(sr)}
          >
            <span className="cw-card-chips">
              <SubraceFacts sr={sr} />
            </span>
            {sr.extra_languages && sr.extra_languages.length > 0 && (
              <span className="cw-pick-line">
                <Languages aria-hidden="true" /> {sr.extra_languages.join(', ')}
              </span>
            )}
          </PickCard>
        ))}
      </PickGrid>

      {open && (
        <ChoiceModal
          art={parentArt}
          icon={Users}
          title={open.subrace_name}
          selected={draft.subrace?.id === open.id}
          onChoose={() => {
            update({ subrace: open })
            setOpen(null)
          }}
          onClose={close}
          facts={<SubraceFacts sr={open} />}
        >
          {open.extra_languages && open.extra_languages.length > 0 && (
            <ModalLine icon={Languages}>{open.extra_languages.join(', ')}</ModalLine>
          )}
          {open.traits && (
            <ModalSection title="Особенности">
              <RichText text={open.traits} />
            </ModalSection>
          )}
          {open.description && (
            <ModalSection title="Описание">
              <RichText text={open.description} />
            </ModalSection>
          )}
        </ChoiceModal>
      )}
    </div>
  )
}
