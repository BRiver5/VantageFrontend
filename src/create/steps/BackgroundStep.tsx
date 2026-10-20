/**
 * Шаг 7 — предыстория: даёт владения навыками, инструментами, языки и умение.
 * Шаг можно пропустить, тогда этих владений у героя просто не будет.
 */
import { useCallback, useMemo, useState } from 'react'
import { Award, Hammer, Landmark, Languages } from 'lucide-react'
import { realImage } from '../../api'
import type { Background } from '../../api'
import {
  EquipmentIconRow,
  StartingEquipment,
  hasStartingEquipment,
} from '../../pages/StartingEquipment'
import { RichText } from '../../terms/terms'
import type { StepProps } from '../draft'
import {
  ChoiceModal,
  FactChip,
  ModalLine,
  ModalSection,
  PickCard,
  PickEmpty,
  PickGrid,
  PickToolbar,
  StepHeader,
  StepStatus,
  usePicker,
  type PickFilterGroup,
} from './ui'
import { useCatalogList } from '../useCatalog'

const bgName = (b: Background) => b.background_name

function BackgroundModal({
  bg,
  selected,
  onChoose,
  onClose,
}: {
  bg: Background
  selected: boolean
  onChoose: () => void
  onClose: () => void
}) {
  return (
    <ChoiceModal
      art={realImage(bg.image_gallery)}
      icon={Landmark}
      title={bg.background_name}
      selected={selected}
      onChoose={onChoose}
      onClose={onClose}
      facts={
        <>
          {bg.skill_proficiencies?.map((s) => (
            <FactChip key={s} icon={Award}>
              {s}
            </FactChip>
          ))}
        </>
      }
    >
      {bg.tool_proficiencies && bg.tool_proficiencies.length > 0 && (
        <ModalLine icon={Hammer}>Инструменты: {bg.tool_proficiencies.join(', ')}</ModalLine>
      )}
      {bg.languages && bg.languages.length > 0 && (
        <ModalLine icon={Languages}>Языки: {bg.languages.join(', ')}</ModalLine>
      )}
      {bg.feature_name && (
        <ModalSection title={`Умение: ${bg.feature_name}`}>
          <RichText text={bg.feature_description} />
        </ModalSection>
      )}
      {hasStartingEquipment(bg.starting_equipment, bg.equipment) && (
        <ModalSection title="Снаряжение">
          <StartingEquipment
            grants={bg.starting_equipment}
            fallbackText={bg.equipment}
            backLabel={bg.background_name}
            columns={2}
          />
        </ModalSection>
      )}
      {bg.description && (
        <ModalSection title="Описание">
          <RichText text={bg.description} />
        </ModalSection>
      )}
    </ChoiceModal>
  )
}

export default function BackgroundStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<Background>('backgrounds')
  const [open, setOpen] = useState<Background | null>(null)

  const groups = useMemo<PickFilterGroup<Background>[]>(() => {
    const skills = [...new Set(items.flatMap((b) => b.skill_proficiencies ?? []))].sort((a, b) =>
      a.localeCompare(b, 'ru'),
    )
    return [
      {
        key: 'skill',
        label: 'Навыки',
        options: skills.map((s) => ({ key: s, label: s })),
        match: (b, sel) => sel.some((s) => b.skill_proficiencies?.includes(s)),
      },
    ]
  }, [items])

  const picker = usePicker(items, bgName, groups)
  const close = useCallback(() => setOpen(null), [])

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader title="Кем ты был до приключений?" />

      <PickToolbar
        picker={picker}
        groups={groups}
        placeholder="Искать предысторию…"
        extra={
          draft.background && (
            <button
              type="button"
              className="cs-btn cs-btn--ghost"
              onClick={() => update({ background: null })}
            >
              Без предыстории
            </button>
          )
        }
      />

      <StepStatus loading={loading} error={error} />
      <PickEmpty show={!loading && items.length > 0 && picker.visible.length === 0} />

      <PickGrid>
        {picker.visible.map((bg) => (
          <PickCard
            key={bg.id}
            art={realImage(bg.image_gallery)}
            icon={Landmark}
            name={bg.background_name}
            selected={draft.background?.id === bg.id}
            onOpen={() => setOpen(bg)}
          >
            <span className="cw-pick-foot">
              <EquipmentIconRow grants={bg.starting_equipment} max={5} />
            </span>
          </PickCard>
        ))}
      </PickGrid>

      {open && (
        <BackgroundModal
          bg={open}
          selected={draft.background?.id === open.id}
          onChoose={() => {
            update({ background: open })
            setOpen(null)
          }}
          onClose={close}
        />
      )}
    </div>
  )
}
