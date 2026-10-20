/** Шаг 1 — раса: сетка карточек с артом и ключевыми цифрами, справа — досье. */
import { useMemo, useState } from 'react'
import { Eye, Footprints, Languages, Ruler, Search, VenetianMask } from 'lucide-react'
import { ABILITY_RU, descriptionPreview, realImage, sizeRu } from '../../api'
import type { Race } from '../../api'
import type { StepProps } from '../draft'
import { ChoiceArt, ChoiceCard, FactChip, StepHeader, StepPanel, StepStatus } from './ui'
import { useCatalogList } from '../useCatalog'

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

/** Досье выбранной расы: арт во всю ширину панели и разбор особенностей */
function RaceDossier({ race }: { race: Race }) {
  const speeds = [
    race.flight_speed > 0 ? `полёт ${race.flight_speed} фт.` : null,
    race.swimming_speed > 0 ? `плавание ${race.swimming_speed} фт.` : null,
    race.climbing_speed > 0 ? `лазание ${race.climbing_speed} фт.` : null,
  ].filter(Boolean)

  return (
    <StepPanel className="cw-dossier">
      <ChoiceArt src={realImage(race.image_gallery)} icon={VenetianMask} />
      <h3 className="cw-dossier-name gold-text">{race.race_name}</h3>
      <div className="cw-card-chips cw-dossier-chips">
        <FactChip icon={Ruler}>{sizeRu(race.size) ?? '—'}</FactChip>
        <FactChip icon={Footprints}>{race.speed} фт.</FactChip>
        {race.darkvision > 0 && <FactChip icon={Eye}>тьма {race.darkvision} фт.</FactChip>}
        <AbilityBoosts scores={race.increase_ability_scores} />
      </div>
      {speeds.length > 0 && <p className="cw-dossier-line">Движение: {speeds.join(', ')}</p>}
      {race.languages && race.languages.length > 0 && (
        <p className="cw-dossier-line">
          <Languages aria-hidden="true" /> {race.languages.join(', ')}
        </p>
      )}
      {(race.age_of_adulthood || race.max_age) && (
        <p className="cw-dossier-line">
          Взрослеют к {race.age_of_adulthood ?? '—'} годам, живут до {race.max_age ?? '—'}
        </p>
      )}
      <p className="cw-dossier-desc">{descriptionPreview(race.description, 600)}</p>
    </StepPanel>
  )
}

export default function RaceStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<Race>('races')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    const list = q
      ? items.filter((r) => r.race_name.toLocaleLowerCase('ru').includes(q))
      : items
    return [...list].sort((a, b) => a.race_name.localeCompare(b.race_name, 'ru'))
  }, [items, query])

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader
        kicker="ступень первая"
        title="Из какого ты народа?"
        lead="Раса задаёт бонусы характеристик, скорость, зрение и языки — всё это сразу попадёт в лист."
      />

      <label className="cw-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Искать расу…"
          aria-label="Поиск расы"
        />
      </label>

      <StepStatus loading={loading} error={error} />

      <div className="cw-layout">
        <div className="cw-grid">
          {visible.map((race) => (
            <ChoiceCard
              key={race.id}
              art={realImage(race.image_gallery)}
              icon={VenetianMask}
              name={race.race_name}
              meta={`${sizeRu(race.size) ?? '—'} · ${race.speed} фт.`}
              chips={<AbilityBoosts scores={race.increase_ability_scores} />}
              description={descriptionPreview(race.description, 140)}
              selected={draft.race?.id === race.id}
              // смена расы сбрасывает подрасу — она привязана к родителю
              onSelect={() => update({ race, subrace: null })}
            />
          ))}
        </div>

        {draft.race && <RaceDossier race={draft.race} />}
      </div>
    </div>
  )
}
