/** Хиты уровня: максимум, бросок, среднее или своё значение */
import { Dices, Heart } from 'lucide-react'
import { averageHitDie } from '../../deriveCharacter'
import type { LevelChoice } from '../../draft'
import { HpEquation } from './LevelParts'

type Props = {
  choice: LevelChoice
  maxFirst: boolean
  hitDie: number
  conMod: number
  hpGain: number
  hpValue: number
  rolling: boolean
  rollHp: () => Promise<void>
  diceError: string | null
  patchLevel: (patch: Partial<LevelChoice>) => void
}

export function HpBlock({ choice, maxFirst, hitDie, conMod, hpGain, hpValue, rolling, rollHp, diceError, patchLevel }: Props) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <Heart aria-hidden="true" /> Хиты
      </h4>
      {maxFirst ? (
        <>
          <HpEquation die={hitDie} value={hitDie} conMod={conMod} total={hpGain} />
          <p className="cw-block-note">Первый уровень всегда даёт максимум кости хитов.</p>
        </>
      ) : (
        <div className="cw-hp-row">
          <button
            type="button"
            className="cs-btn cw-roll-btn"
            onClick={() => void rollHp()}
            disabled={rolling}
          >
            <Dices aria-hidden="true" />
            {rolling ? 'Кость катится…' : `Бросить 1к${hitDie}`}
          </button>
          <button
            type="button"
            className={`cs-btn cs-btn--ghost${choice.hpMode === 'average' ? ' is-active' : ''}`}
            onClick={() => patchLevel({ hpMode: 'average', hpRoll: averageHitDie(hitDie) })}
          >
            Среднее ({averageHitDie(hitDie)})
          </button>
          <label className="cw-field cw-field--tiny">
            <span>Своё значение</span>
            <input
              type="number"
              min={1}
              max={hitDie}
              value={choice.hpRoll ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                patchLevel({
                  hpMode: 'manual',
                  hpRoll: Number.isNaN(v) ? null : Math.max(1, Math.min(hitDie, v)),
                })
              }}
            />
          </label>
          {choice.hpRoll != null ? (
            <HpEquation die={hitDie} value={hpValue} conMod={conMod} total={hpGain} />
          ) : (
            <span className="cw-hp-total">бросьте кость или введите значение</span>
          )}
        </div>
      )}
      {diceError && <p className="auth-error">{diceError}</p>}
    </section>
  )
}
