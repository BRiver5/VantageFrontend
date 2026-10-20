/**
 * Шаг 7 — предыстория: даёт владения навыками, инструментами, языки и умение.
 * Шаг можно пропустить, тогда этих владений у героя просто не будет.
 */
import { useMemo, useState } from 'react'
import { Award, Hammer, Landmark, Languages, Search } from 'lucide-react'
import { descriptionPreview, realImage } from '../../api'
import type { Background } from '../../api'
import type { StepProps } from '../draft'
import { ChoiceArt, ChoiceCard, FactChip, StepHeader, StepPanel, StepStatus } from './ui'
import { useCatalogList } from '../useCatalog'

function BackgroundDossier({ bg }: { bg: Background }) {
  return (
    <StepPanel className="cw-dossier">
      <ChoiceArt src={realImage(bg.image_gallery)} icon={Landmark} />
      <h3 className="cw-dossier-name gold-text">{bg.background_name}</h3>
      <div className="cw-card-chips cw-dossier-chips">
        {bg.skill_proficiencies?.map((s) => (
          <FactChip key={s} icon={Award}>{s}</FactChip>
        ))}
      </div>
      {bg.tool_proficiencies && bg.tool_proficiencies.length > 0 && (
        <p className="cw-dossier-line">
          <Hammer aria-hidden="true" /> {bg.tool_proficiencies.join(', ')}
        </p>
      )}
      {bg.languages && bg.languages.length > 0 && (
        <p className="cw-dossier-line">
          <Languages aria-hidden="true" /> {bg.languages.join(', ')}
        </p>
      )}
      {bg.feature_name && (
        <>
          <p className="cw-dossier-feature gold-text">{bg.feature_name}</p>
          <p className="cw-dossier-desc">{descriptionPreview(bg.feature_description, 400)}</p>
        </>
      )}
      {bg.equipment && <p className="cw-dossier-line">Снаряжение: {bg.equipment}</p>}
    </StepPanel>
  )
}

export default function BackgroundStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<Background>('backgrounds')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    const list = q
      ? items.filter((b) => b.background_name.toLocaleLowerCase('ru').includes(q))
      : items
    return [...list].sort((a, b) => a.background_name.localeCompare(b.background_name, 'ru'))
  }, [items, query])

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader
        kicker="ступень седьмая"
        title="Кем ты был до приключений?"
        lead="Предыстория добавит владения навыками и инструментами, языки и собственное умение."
      />

      <div className="cw-search-row">
        <label className="cw-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Искать предысторию…"
            aria-label="Поиск предыстории"
          />
        </label>
        {draft.background && (
          <button
            type="button"
            className="cs-btn cs-btn--ghost"
            onClick={() => update({ background: null })}
          >
            Без предыстории
          </button>
        )}
      </div>

      <StepStatus loading={loading} error={error} />

      <div className="cw-layout">
        <div className="cw-grid">
          {visible.map((bg) => (
            <ChoiceCard
              key={bg.id}
              art={realImage(bg.image_gallery)}
              icon={Landmark}
              name={bg.background_name}
              meta={bg.feature_name}
              chips={
                <>
                  {bg.skill_proficiencies?.slice(0, 3).map((s) => (
                    <FactChip key={s}>{s}</FactChip>
                  ))}
                </>
              }
              description={descriptionPreview(bg.description, 140)}
              selected={draft.background?.id === bg.id}
              onSelect={() => update({ background: bg })}
            />
          ))}
        </div>

        {draft.background && <BackgroundDossier bg={draft.background} />}
      </div>
    </div>
  )
}
