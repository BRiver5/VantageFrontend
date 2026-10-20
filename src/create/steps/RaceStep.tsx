/** Шаг 1 — раса: короткие карточки по центру, подробности — в попапе. */
import { useCallback, useMemo, useState } from 'react'
import { Eye, Footprints, Languages, Ruler, VenetianMask } from 'lucide-react'
import { ABILITY_RU, realImage, sizeRu } from '../../api'
import type { Race } from '../../api'
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
import { useCatalogList, useRacesWithSubraces } from '../useCatalog'

const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
const ABILITY_ORDER = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

const sizeKey = (r: Race) => r.size?.trim().toLowerCase() ?? ''
const raceName = (r: Race) => r.race_name

function AbilityBoosts({ scores }: { scores: Record<string, number> | null }) {
  const boosts = Object.entries(scores ?? {})
  if (boosts.length === 0) return null
  return (
    <>
      {boosts.map(([k, v]) => (
        <FactChip key={k}>
          {ABILITY_RU[k] ?? k} +{v}
        </FactChip>
      ))}
    </>
  )
}

function RaceModal({
  race,
  selected,
  onChoose,
  onClose,
}: {
  race: Race
  selected: boolean
  onChoose: () => void
  onClose: () => void
}) {
  const speeds = [
    race.flight_speed > 0 ? `полёт ${race.flight_speed} фт.` : null,
    race.swimming_speed > 0 ? `плавание ${race.swimming_speed} фт.` : null,
    race.climbing_speed > 0 ? `лазание ${race.climbing_speed} фт.` : null,
  ].filter(Boolean)

  return (
    <ChoiceModal
      art={realImage(race.image_gallery)}
      icon={VenetianMask}
      title={race.race_name}
      selected={selected}
      onChoose={onChoose}
      onClose={onClose}
      facts={
        <>
          <FactChip icon={Ruler}>{sizeRu(race.size) ?? '—'}</FactChip>
          <FactChip icon={Footprints}>{race.speed} фт.</FactChip>
          {race.darkvision > 0 && <FactChip icon={Eye}>тьма {race.darkvision} фт.</FactChip>}
          <AbilityBoosts scores={race.increase_ability_scores} />
        </>
      }
    >
      {speeds.length > 0 && <ModalLine icon={Footprints}>Движение: {speeds.join(', ')}</ModalLine>}
      {race.languages && race.languages.length > 0 && (
        <ModalLine icon={Languages}>{race.languages.join(', ')}</ModalLine>
      )}
      {(race.age_of_adulthood || race.max_age) && (
        <ModalLine>
          Взрослеют к {race.age_of_adulthood ?? '—'} годам, живут до {race.max_age ?? '—'}
        </ModalLine>
      )}
      {race.description && (
        <ModalSection title="Описание">
          <RichText text={race.description} />
        </ModalSection>
      )}
    </ChoiceModal>
  )
}

export default function RaceStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<Race>('races')
  const raceIds = useMemo(() => items.map((r) => r.id), [items])
  const withSubraces = useRacesWithSubraces(raceIds)
  const [open, setOpen] = useState<Race | null>(null)

  const groups = useMemo<PickFilterGroup<Race>[]>(() => {
    const sizes = new Set(items.map(sizeKey).filter(Boolean))
    const abilities = new Set(items.flatMap((r) => Object.keys(r.increase_ability_scores ?? {})))
    return [
      {
        key: 'size',
        label: 'Размер',
        options: SIZE_ORDER.filter((s) => sizes.has(s)).map((s) => ({ key: s, label: sizeRu(s) ?? s })),
        match: (r, sel) => sel.includes(sizeKey(r)),
      },
      {
        key: 'ability',
        label: 'Характеристика',
        options: ABILITY_ORDER.filter((a) => abilities.has(a)).map((a) => ({
          key: a,
          label: ABILITY_RU[a] ?? a,
        })),
        match: (r, sel) => sel.some((a) => (r.increase_ability_scores?.[a] ?? 0) > 0),
      },
      {
        key: 'subraces',
        label: 'Подрасы',
        options: withSubraces.size > 0 ? [{ key: 'yes', label: 'есть подрасы' }] : [],
        match: (r) => withSubraces.has(r.id),
      },
    ]
  }, [items, withSubraces])

  const picker = usePicker(items, raceName, groups)
  const close = useCallback(() => setOpen(null), [])

  const choose = (race: Race) => {
    // смена расы сбрасывает подрасу — она привязана к родителю
    if (draft.race?.id !== race.id) update({ race, subrace: null })
    setOpen(null)
  }

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader title="Из какого ты народа?" />

      <PickToolbar picker={picker} groups={groups} placeholder="Искать расу…" />

      <StepStatus loading={loading} error={error} />
      <PickEmpty show={!loading && items.length > 0 && picker.visible.length === 0} />

      <PickGrid>
        {picker.visible.map((race) => (
          <PickCard
            key={race.id}
            art={realImage(race.image_gallery)}
            icon={VenetianMask}
            name={race.race_name}
            badge={withSubraces.has(race.id) ? 'подрасы' : null}
            selected={draft.race?.id === race.id}
            onOpen={() => setOpen(race)}
          >
            <span className="cw-card-chips">
              <AbilityBoosts scores={race.increase_ability_scores} />
            </span>
            <span className="cw-pick-meta">
              <Ruler aria-hidden="true" /> {sizeRu(race.size) ?? '—'}
              <Footprints aria-hidden="true" /> {race.speed} фт.
            </span>
            {race.languages && race.languages.length > 0 && (
              <span className="cw-pick-line">
                <Languages aria-hidden="true" /> {race.languages.join(', ')}
              </span>
            )}
          </PickCard>
        ))}
      </PickGrid>

      {open && (
        <RaceModal
          race={open}
          selected={draft.race?.id === open.id}
          onChoose={() => choose(open)}
          onClose={close}
        />
      )}
    </div>
  )
}
