/** Шаг 3 — класс: короткие карточки с костью хитов, подробности и снаряжение — в попапе. */
import { useCallback, useMemo, useState } from 'react'
import { Shield, Sparkles, Swords } from 'lucide-react'
import { realImage } from '../../api'
import type { GameClass } from '../../api'
import { DieChipIcon, DieImage, hitDieType } from '../../dice/diceAssets'
import { StartingEquipment, hasStartingEquipment } from '../../pages/StartingEquipment'
import { RichText } from '../../terms/terms'
import { CLASS_PRIMARY_ABILITY, casterKind, classSkillChoice } from '../dnd5e'
import { emptyLevelChoice, type StepProps } from '../draft'
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
import { DEFAULT_SKILLS } from '../../types/character'

const SKILL_LABEL = new Map(DEFAULT_SKILLS.map((s) => [s.key, s.label]))

const className = (c: GameClass) => c.class_name
const isCaster = (c: GameClass) => casterKind(c.class_name, c.is_caster) !== 'none'

function ClassModal({
  cls,
  selected,
  onChoose,
  onClose,
}: {
  cls: GameClass
  selected: boolean
  onChoose: () => void
  onClose: () => void
}) {
  const skills = classSkillChoice(cls.class_name)
  const caster = isCaster(cls)

  return (
    <ChoiceModal
      art={realImage(cls.image_gallery)}
      icon={Swords}
      glow={caster}
      title={cls.class_name}
      selected={selected}
      onChoose={onChoose}
      onClose={onClose}
      facts={
        <>
          <FactChip>
            <DieChipIcon type={hitDieType(cls.hit_dice)} /> к{cls.hit_dice}
          </FactChip>
          {CLASS_PRIMARY_ABILITY[cls.class_name] && (
            <FactChip icon={Swords}>{CLASS_PRIMARY_ABILITY[cls.class_name]}</FactChip>
          )}
          {caster && <FactChip icon={Sparkles}>заклинатель</FactChip>}
        </>
      }
    >
      {cls.saving_throw_proficiencies && cls.saving_throw_proficiencies.length > 0 && (
        <ModalLine icon={Shield}>Спасброски: {cls.saving_throw_proficiencies.join(', ')}</ModalLine>
      )}
      <ModalLine>
        Навыков на выбор: {skills.count} из{' '}
        {skills.options.map((k) => SKILL_LABEL.get(k) ?? k).join(', ')}
      </ModalLine>
      {cls.armor_proficiencies && cls.armor_proficiencies.length > 0 && (
        <ModalLine>Броня: {cls.armor_proficiencies.join(', ')}</ModalLine>
      )}
      {cls.weapon_proficiencies && cls.weapon_proficiencies.length > 0 && (
        <ModalLine>Оружие: {cls.weapon_proficiencies.join(', ')}</ModalLine>
      )}
      {hasStartingEquipment(cls.starting_equipment, cls.starting_equipment_text) && (
        <ModalSection title="Стартовое снаряжение">
          <StartingEquipment
            grants={cls.starting_equipment}
            sourceText={cls.starting_equipment_text}
            backLabel={cls.class_name}
          />
        </ModalSection>
      )}
      {cls.description && (
        <ModalSection title="Описание">
          <RichText text={cls.description} />
        </ModalSection>
      )}
    </ChoiceModal>
  )
}

export default function ClassStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<GameClass>('classes')
  const [open, setOpen] = useState<GameClass | null>(null)

  const groups = useMemo<PickFilterGroup<GameClass>[]>(() => {
    const dice = [...new Set(items.map((c) => c.hit_dice))].sort((a, b) => a - b)
    return [
      {
        key: 'magic',
        label: 'Магия',
        options: [
          { key: 'yes', label: 'заклинатель' },
          { key: 'no', label: 'без магии' },
        ],
        match: (c, sel) => sel.includes(isCaster(c) ? 'yes' : 'no'),
      },
      {
        key: 'die',
        label: 'Кость хитов',
        options: dice.map((d) => ({ key: String(d), label: `к${d}` })),
        match: (c, sel) => sel.includes(String(c.hit_dice)),
      },
    ]
  }, [items])

  const picker = usePicker(items, className, groups)
  const close = useCallback(() => setOpen(null), [])

  const choose = (cls: GameClass) => {
    // новый класс обнуляет подкласс и все решения по уровням:
    // навыки, заклинания и усиления у него свои
    if (draft.cls?.id !== cls.id) {
      update({
        cls,
        subclass: null,
        levels: Array.from({ length: draft.targetLevel }, (_, i) => emptyLevelChoice(i + 1)),
      })
    }
    setOpen(null)
  }

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader title="Чьё ремесло ты избрал?" />

      <PickToolbar picker={picker} groups={groups} placeholder="Искать класс…" />

      <StepStatus loading={loading} error={error} />
      <PickEmpty show={!loading && items.length > 0 && picker.visible.length === 0} />

      <PickGrid>
        {picker.visible.map((cls) => (
          <PickCard
            key={cls.id}
            art={realImage(cls.image_gallery)}
            icon={Swords}
            name={cls.class_name}
            glow={isCaster(cls)}
            selected={draft.cls?.id === cls.id}
            onOpen={() => setOpen(cls)}
          >
            <span className="cw-pick-meta">
              <DieImage type={hitDieType(cls.hit_dice)} size={18} /> к{cls.hit_dice}
            </span>
            {CLASS_PRIMARY_ABILITY[cls.class_name] && (
              <span className="cw-pick-line">{CLASS_PRIMARY_ABILITY[cls.class_name]}</span>
            )}
          </PickCard>
        ))}
      </PickGrid>

      {open && (
        <ClassModal
          cls={open}
          selected={draft.cls?.id === open.id}
          onChoose={() => choose(open)}
          onClose={close}
        />
      )}
    </div>
  )
}
