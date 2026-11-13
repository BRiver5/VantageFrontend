/** Подробности подкласса в модальном окне */
import { Shield } from 'lucide-react'
import { realImage } from '../../../api'
import type { Subclass } from '../../../api'
import type { CharacterDraft, DraftUpdate } from '../../draft'
import { RichText } from '../../../terms/terms'
import { ChoiceModal, FactChip, ModalSection } from '../ui'

type Props = {
  subDetails: Subclass
  draft: CharacterDraft
  update: DraftUpdate
  setSubDetails: (sub: Subclass | null) => void
  closeSubDetails: () => void
}

export function SubclassModal({ subDetails, draft, update, setSubDetails, closeSubDetails }: Props) {
  return (
    <ChoiceModal
      art={realImage(subDetails.image_gallery)}
      icon={Shield}
      title={subDetails.subclass_name}
      selected={draft.subclass?.id === subDetails.id}
      onChoose={() => {
        update({ subclass: subDetails })
        setSubDetails(null)
      }}
      onClose={closeSubDetails}
      facts={
        <>
          {subDetails.level_available != null && (
            <FactChip>с {subDetails.level_available} уровня</FactChip>
          )}
          {subDetails.is_caster && <FactChip>заклинатель</FactChip>}
        </>
      }
    >
      {subDetails.subclass_flavor && (
        <p className="cw-dossier-desc">{subDetails.subclass_flavor}</p>
      )}
      {subDetails.description && (
        <ModalSection title="Описание">
          <RichText text={subDetails.description} />
        </ModalSection>
      )}
    </ChoiceModal>
  )
}
