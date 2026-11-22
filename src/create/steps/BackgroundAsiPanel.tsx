/**
 * Повышение характеристик предыстории 2024 на шаге характеристик: схема
 * «+2 и +1» или «+1, +1 и +1» среди трёх характеристик предыстории. Выбор
 * уходит ответом на решение способности предыстории сразу после создания
 * (autoDecisions); не выбрали — решение останется на листе.
 *
 * Здесь же — подсказка о смешанных источниках: раса 2014 и предыстория 2024
 * обе повышают характеристики, или ни одна не повышает.
 */
import { useState } from 'react'
import { ABILITY_LABELS } from '../../types/character'
import type { AbilityName } from '../../types/character'
import type { StepProps } from '../draft'
import { backgroundAsiMode, evenBackgroundAsi, pickTwoOne, type BackgroundAsiOptions, type BgAsiMode, type OriginAsiNote } from '../originAsi'
import { StepPanel } from './ui'

const MODE_LABEL: Record<BgAsiMode, string> = { '2,1': '+2 и +1', '1,1,1': '+1, +1 и +1' }

export function OriginAsiHint({ note }: { note: OriginAsiNote }) {
  if (note === 'both') {
    return (
      <p className="cw-bgasi-note" role="note">
        Характеристики повышают и раса, и предыстория — бонусы складываются. По правилам 2024 у народов из старых книг
        увеличений нет — если играете так, договоритесь с мастером.
      </p>
    )
  }
  if (note === 'none') {
    return (
      <p className="cw-bgasi-note" role="note">
        Ни раса, ни предыстория не повышают характеристики: виды 2024 оставляют это предыстории, а у предысторий 2014
        увеличений нет. Выберите предысторию 2024 или договоритесь с мастером.
      </p>
    )
  }
  return null
}

export function BackgroundAsiPanel({ draft, update, opts }: StepProps & { opts: BackgroundAsiOptions }) {
  const asi = draft.backgroundAsi
  const chosen = backgroundAsiMode(draft.background, asi)
  // схема, пока распределение не доделано, — своя: пустой выбор ни о чём не говорит
  const [mode, setMode] = useState<BgAsiMode>(() => chosen ?? (opts.modes.includes('2,1') ? '2,1' : opts.modes[0]))

  const switchMode = (m: BgAsiMode) => {
    setMode(m)
    update({ backgroundAsi: m === '1,1,1' ? evenBackgroundAsi(opts) : {} })
  }
  const set = (k: AbilityName, v: 0 | 1 | 2) => update({ backgroundAsi: pickTwoOne(asi, k, v) })

  return (
    <StepPanel className="cw-bgasi">
      <div className="cw-bgasi-head">
        <span className="cw-bgasi-title">Предыстория «{draft.background?.background_name}»: повышение характеристик</span>
        {opts.modes.length > 1 && (
          <div className="cw-bgasi-modes" role="radiogroup" aria-label="Схема повышения">
            {opts.modes.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`sort-btn${mode === m ? ' is-active' : ''}`}
                onClick={() => switchMode(m)}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cw-bgasi-rows">
        {opts.abilities.map((k) => (
          <div key={k} className="cw-bgasi-row">
            <span className="cw-bgasi-name">{ABILITY_LABELS[k].label}</span>
            {mode === '2,1' ? (
              ([2, 1] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`sort-btn cw-bgasi-pick${asi[k] === v ? ' is-active' : ''}`}
                  aria-pressed={asi[k] === v}
                  onClick={() => set(k, asi[k] === v ? 0 : v)}
                >
                  +{v}
                </button>
              ))
            ) : (
              <b className="cw-bgasi-fixed">+1</b>
            )}
          </div>
        ))}
      </div>

      <p className="cw-bgasi-status">
        {chosen
          ? 'Готово — бонусы уже в итоговых значениях.'
          : 'Не выбрано: отметьте, какой характеристике +2, а какой +1, — или решите позже на листе.'}
      </p>
    </StepPanel>
  )
}
