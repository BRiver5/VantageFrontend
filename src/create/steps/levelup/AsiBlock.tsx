/** Усиление характеристик или черта */
import { TrendingUp } from 'lucide-react'
import type { Feat } from '../../../api'
import { ABILITY_KEYS, ABILITY_LABELS } from '../../../types/character'
import type { AbilityName } from '../../../types/character'
import type { LevelChoice } from '../../draft'
import { checkPrereq, type PrereqContext } from '../../prereq'
import { FeatPicker } from '../FeatPicker'

type Props = {
  choice: LevelChoice
  asiSpent: number
  scoresBefore: Record<AbilityName, number>
  allFeats: Feat[]
  prereqContext: PrereqContext
  patchLevel: (patch: Partial<LevelChoice>) => void
}

export function AsiBlock({ choice, asiSpent, scoresBefore, allFeats, prereqContext, patchLevel }: Props) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <TrendingUp aria-hidden="true" /> Усиление характеристик или черта
      </h4>
      <div className="cw-asi-modes">
        <button
          type="button"
          className={`cs-btn cs-btn--ghost${choice.featName === null ? ' is-active' : ''}`}
          onClick={() => patchLevel({ featName: null, featId: null })}
        >
          +2 к характеристикам
        </button>
        <button
          type="button"
          className={`cs-btn cs-btn--ghost${choice.featName !== null ? ' is-active' : ''}`}
          onClick={() => patchLevel({ featName: '', featId: null, asi: {} })}
        >
          Взять черту
        </button>
      </div>

      {choice.featName === null ? (
        <>
          <p className="cw-block-note">
            Распределите два очка: {asiSpent} / 2
          </p>
          <div className="cw-asi-grid">
            {ABILITY_KEYS.map((key) => {
              const added = choice.asi[key] ?? 0
              const current = scoresBefore[key]
              const capped = current + added >= 20
              return (
                <div key={key} className="cw-asi-cell">
                  <span className="cw-asi-name">{ABILITY_LABELS[key].abbr}</span>
                  <span className="cw-asi-value">
                    {current}
                    {added > 0 && <i className="gold-text">+{added}</i>}
                  </span>
                  <span className="cw-asi-buttons">
                    <button
                      type="button"
                      aria-label={`Убрать очко из ${ABILITY_LABELS[key].label}`}
                      disabled={added === 0}
                      onClick={() =>
                        patchLevel({ asi: { ...choice.asi, [key]: added - 1 } })
                      }
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label={`Добавить очко в ${ABILITY_LABELS[key].label}`}
                      disabled={asiSpent >= 2 || capped}
                      onClick={() =>
                        patchLevel({ asi: { ...choice.asi, [key]: added + 1 } })
                      }
                    >
                      +
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <FeatPicker
          feats={allFeats}
          value={choice.featName}
          onChange={(name) =>
            patchLevel({ featName: name, featId: allFeats.find((f) => f.feat_name === name)?.id ?? null })
          }
          check={(f) => checkPrereq(f.prerequisite, prereqContext)}
        />
      )}
    </section>
  )
}
