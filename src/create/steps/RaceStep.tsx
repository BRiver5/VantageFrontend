/**
 * Шаг 1 — раса: карточки как в каталоге рас, подробности — в попапе.
 * Подрасы, в том числе самостоятельные (`replaces_race`), выбираются
 * следующим шагом.
 */
import { useCallback, useMemo, useState } from 'react'
import { Check, Eye, Footprints, GitFork, Ruler, VenetianMask } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ABILITY_RU, isFramedArt, realImage, sizeRu } from '../../api'
import type { Race } from '../../api'
import { RaceDetailBody } from '../../pages/DetailPages'
import { RaceBoosts, boostInfo, boostsAbility } from '../../raceBoosts'
import { useBookWorld } from '../../worldArt'
import type { StepProps } from '../draft'
import {
  ChoiceModal,
  MoreTab,
  PickEmpty,
  PickToolbar,
  StepHeader,
  StepStatus,
  bookFilterGroup,
  usePicker,
  type PickFilterGroup,
} from './ui'
import { useBookMap, useCatalogList, useRacesWithSubraces } from '../useCatalog'

const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
const ABILITY_ORDER = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

const sizeKey = (r: Race) => r.size?.trim().toLowerCase() ?? ''
const raceName = (r: Race) => r.race_name

function RailCell({ icon: Icon, value, label }: { icon: LucideIcon; value: string | null; label: string }) {
  return (
    <span className="race-rail-cell" data-off={value ? undefined : ''}>
      <Icon aria-hidden="true" />
      <b>{value ?? '—'}</b>
      <i>{label}</i>
    </span>
  )
}

/** Портрет без подложки — фигура стоит прямо на панели, как в каталоге */
function RacePortrait({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false)
  const framed = isFramedArt(src)
  return (
    <span className={`class-card-portrait${framed ? ' creature-portrait--framed' : ''}`}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <VenetianMask className="class-card-fallback" aria-hidden="true" />
      )}
    </span>
  )
}

/** Карточка расы в стиле каталога: клик — выбор, язычок «Подробнее» — описание */
export function RaceCard({
  race,
  hasSubraces = false,
  selected,
  onSelect,
  onDetails,
  slotRef,
}: {
  race: Race
  hasSubraces?: boolean
  selected: boolean
  onSelect: () => void
  onDetails: () => void
  slotRef?: (el: HTMLDivElement | null) => void
}) {
  return (
    <div className="cw-pick-slot cw-pick-slot--catalog" ref={slotRef}>
      <button
        type="button"
        className={`card card--portrait card--race cw-catalog-card${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="class-card-visual">
          <RacePortrait src={realImage(race.image_gallery)} />
          {hasSubraces && (
            <span className="cw-race-branch" title="Есть подрасы">
              <span>
                <GitFork aria-hidden="true" />
              </span>
            </span>
          )}
          {selected && (
            <span className="cw-card-check" aria-hidden="true">
              <Check />
            </span>
          )}
        </span>
        <span className="class-card-lower">
          <span className="class-card-glow" aria-hidden="true" />
          <span className="class-card-panel race-card-panel">
            <RaceBoosts info={boostInfo(race, hasSubraces)} />
            <span className="race-rail">
              <RailCell icon={Ruler} value={sizeRu(race.size)} label="размер" />
              <RailCell icon={Footprints} value={`${race.speed} фт.`} label="скорость" />
              <RailCell icon={Eye} value={race.darkvision > 0 ? `${race.darkvision} фт.` : null} label="тьма" />
            </span>
          </span>
          <span className="class-card-name-plate">{race.race_name}</span>
        </span>
      </button>
      <MoreTab onClick={onDetails} />
    </div>
  )
}

/** Подробности расы — та же страница, что в каталоге, только внутри попапа */
export function RaceModal({
  race,
  selected,
  chooseLabel,
  onChoose,
  onClose,
}: {
  race: Race
  selected: boolean
  chooseLabel?: string
  onChoose: () => void
  onClose: () => void
}) {
  const world = useBookWorld(race.book_source_id)
  return (
    <ChoiceModal
      bare
      world={world?.art}
      title={race.race_name}
      chooseLabel={chooseLabel}
      selected={selected}
      onChoose={onChoose}
      onClose={onClose}
    >
      <div className="race-detail-page cw-sheet-race">
        <RaceDetailBody race={race} world={world} embedded />
      </div>
    </ChoiceModal>
  )
}

export default function RaceStep({ draft, update }: StepProps) {
  const { items: races, loading, error } = useCatalogList<Race>('races')
  const raceIds = useMemo(() => races.map((r) => r.id), [races])
  const withSubraces = useRacesWithSubraces(raceIds)
  const [open, setOpen] = useState<Race | null>(null)

  const books = useBookMap()
  const groups = useMemo<PickFilterGroup<Race>[]>(() => {
    const sizes = new Set(races.map(sizeKey).filter(Boolean))
    const abilities = new Set(races.flatMap((r) => Object.keys(r.increase_ability_scores ?? {})))
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
        // раса с бонусами на выбор подходит к любой характеристике
        match: (r, sel) => sel.some((a) => boostsAbility(boostInfo(r), a)),
      },
      {
        key: 'subraces',
        label: 'Подрасы',
        options: withSubraces.size > 0 ? [{ key: 'yes', label: 'есть подрасы' }] : [],
        match: (r) => withSubraces.has(r.id),
      },
      bookFilterGroup(races, books, (r) => r.book_source_id),
    ]
  }, [races, withSubraces, books])

  const picker = usePicker(races, raceName, groups)
  const close = useCallback(() => setOpen(null), [])

  const isSelected = (race: Race) => draft.race?.id === race.id

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
      <PickEmpty show={!loading && races.length > 0 && picker.visible.length === 0} />

      <div className="cw-catalog-grid">
        {picker.visible.map((race) => (
          <RaceCard
            key={race.id}
            race={race}
            hasSubraces={withSubraces.has(race.id)}
            selected={isSelected(race)}
            onSelect={() => choose(race)}
            onDetails={() => setOpen(race)}
          />
        ))}
      </div>

      {open && (
        <RaceModal
          race={open}
          selected={isSelected(open)}
          onChoose={() => choose(open)}
          onClose={close}
        />
      )}
    </div>
  )
}
