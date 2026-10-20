/**
 * Шаг 5 — характеристики. Четыре способа: настоящие 3D-броски 4к6 с отбросом
 * младшей кости, стандартный набор, покупка за очки и ручной ввод.
 *
 * Броски и стандартный набор работают одинаково: выпавшие значения попадают в
 * «пул», откуда игрок раскладывает их по характеристикам.
 */
import { useCallback, useMemo, useState } from 'react'
import { Dices, RotateCcw, Undo2 } from 'lucide-react'
import { ABILITY_KEYS, ABILITY_LABELS } from '../../types/character'
import type { AbilityName } from '../../types/character'
import { ABILITY_RU } from '../../api'
import { abilityMod, formatMod } from '../dnd5e'
import {
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  pointBuySpent,
  scoreOf,
  type AbilityMethod,
  type StepProps,
} from '../draft'
import { racialBonuses } from '../deriveCharacter'
import { useDice } from '../../dice/diceControl'
import { FactChip, StepHeader, StepPanel } from './ui'

const METHODS: { id: AbilityMethod; label: string; hint: string }[] = [
  { id: 'roll', label: 'Броски костей', hint: '6 раз по 4к6, младшая кость отбрасывается' },
  { id: 'array', label: 'Стандартный набор', hint: '15, 14, 13, 12, 10, 8 — разложить по вкусу' },
  { id: 'pointbuy', label: 'Покупка за очки', hint: `27 очков, значения от 8 до 15` },
  { id: 'manual', label: 'Вручную', hint: 'Если мастер выдал цифры сам' },
]

/** Бросок 4d6 с отбрасыванием младшей кости */
function dropLowest(values: number[]): { kept: number[]; dropped: number; total: number } {
  const sorted = [...values].sort((a, b) => a - b)
  const dropped = sorted[0] ?? 0
  const kept = sorted.slice(1)
  return { kept, dropped, total: kept.reduce((s, v) => s + v, 0) }
}

/** Один бросок 4к6: сами кости и отброшенная */
interface RollRecord {
  values: number[]
  dropped: number
  total: number
}

const MAX_ROLLS = 6

export default function AbilitiesStep({ draft, update }: StepProps) {
  const dice = useDice()
  const [rolls, setRolls] = useState<RollRecord[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [diceError, setDiceError] = useState<string | null>(null)

  const racial = useMemo(() => racialBonuses(draft), [draft])
  const usesPool = draft.abilityMethod === 'roll' || draft.abilityMethod === 'array'
  const spent = pointBuySpent(draft.baseScores)

  const setMethod = (method: AbilityMethod) => {
    setRolls([])
    setPicked(null)
    setDiceError(null)
    const blank = Object.fromEntries(ABILITY_KEYS.map((k) => [k, null])) as Record<
      AbilityName,
      number | null
    >
    if (method === 'array') {
      update({ abilityMethod: method, baseScores: blank, rolledPool: [...STANDARD_ARRAY] })
      return
    }
    if (method === 'pointbuy') {
      const eight = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8])) as Record<
        AbilityName,
        number | null
      >
      update({ abilityMethod: method, baseScores: eight, rolledPool: [] })
      return
    }
    if (method === 'manual') {
      const ten = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])) as Record<
        AbilityName,
        number | null
      >
      update({ abilityMethod: method, baseScores: ten, rolledPool: [] })
      return
    }
    update({ abilityMethod: method, baseScores: blank, rolledPool: [] })
  }

  const rollOne = useCallback(async () => {
    if (rolls.length >= MAX_ROLLS || dice.rolling) return
    setDiceError(null)
    try {
      const values = await dice.roll('4d6')
      const { dropped, total } = dropLowest(values)
      setRolls((prev) => [...prev, { values, dropped, total }])
      update({ rolledPool: [...draft.rolledPool, total] })
    } catch {
      // кости могли не подняться (WebGL) — честно говорим и оставляем ручной ввод
      setDiceError('Кости не отозвались. Выберите «Вручную» или попробуйте снова.')
    }
  }, [dice, draft.rolledPool, rolls.length, update])

  const resetRolls = () => {
    setRolls([])
    setPicked(null)
    update({
      rolledPool: [],
      baseScores: Object.fromEntries(ABILITY_KEYS.map((k) => [k, null])) as Record<
        AbilityName,
        number | null
      >,
    })
  }

  /** Кладёт выбранное из пула значение в характеристику, прежнее возвращает в пул */
  const place = (ability: AbilityName) => {
    if (picked == null) return
    const pool = [...draft.rolledPool]
    const at = pool.indexOf(picked)
    if (at === -1) return
    pool.splice(at, 1)

    const previous = draft.baseScores[ability]
    if (previous != null) pool.push(previous)

    update({
      rolledPool: pool,
      baseScores: { ...draft.baseScores, [ability]: picked },
    })
    setPicked(null)
  }

  /** Снимает значение с характеристики обратно в пул */
  const unplace = (ability: AbilityName) => {
    const value = draft.baseScores[ability]
    if (value == null) return
    update({
      rolledPool: [...draft.rolledPool, value],
      baseScores: { ...draft.baseScores, [ability]: null },
    })
  }

  const adjust = (ability: AbilityName, delta: number) => {
    const current = scoreOf(draft.baseScores, ability)
    const next = current + delta
    if (draft.abilityMethod === 'pointbuy') {
      if (next < 8 || next > 15) return
      const cost = (POINT_BUY_COST[next] ?? 0) - (POINT_BUY_COST[current] ?? 0)
      if (spent + cost > POINT_BUY_BUDGET) return
    } else if (next < 1 || next > 20) {
      return
    }
    update({ baseScores: { ...draft.baseScores, [ability]: next } })
  }

  const poolLeft = draft.rolledPool.length

  return (
    <div className="cw-step">
      <StepHeader
        title="Из чего ты сделан?"
        lead="Расовые бонусы добавляются поверх — в правой колонке сразу виден итог."
      />

      <div className="cw-methods" role="tablist" aria-label="Способ получения характеристик">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={draft.abilityMethod === m.id}
            className={`cw-method${draft.abilityMethod === m.id ? ' is-active' : ''}`}
            onClick={() => setMethod(m.id)}
          >
            <span className="cw-method-label">{m.label}</span>
            <span className="cw-method-hint">{m.hint}</span>
          </button>
        ))}
      </div>

      {draft.abilityMethod === 'roll' && (
        <StepPanel className="cw-roll-panel">
          <div className="cw-roll-actions">
            <button
              type="button"
              className="cs-btn cw-roll-btn"
              onClick={() => void rollOne()}
              disabled={rolls.length >= MAX_ROLLS || dice.rolling}
            >
              <Dices aria-hidden="true" />
              {dice.rolling
                ? 'Кости катятся…'
                : rolls.length >= MAX_ROLLS
                  ? 'Все шесть брошены'
                  : `Бросить 4к6 (${rolls.length + 1} из ${MAX_ROLLS})`}
            </button>
            {rolls.length > 0 && (
              <button type="button" className="cs-btn cs-btn--ghost" onClick={resetRolls}>
                <RotateCcw aria-hidden="true" /> Перебросить всё
              </button>
            )}
          </div>

          {diceError && <p className="auth-error">{diceError}</p>}

          <div className="cw-rolls">
            {rolls.map((r, i) => (
              <div key={i} className="cw-roll">
                <span className="cw-roll-dice">
                  {[...r.values]
                    .sort((a, b) => b - a)
                    .map((v, j, arr) => (
                      <span
                        key={j}
                        className={`cw-roll-die${j === arr.length - 1 ? ' is-dropped' : ''}`}
                      >
                        {v}
                      </span>
                    ))}
                </span>
                <span className="cw-roll-total gold-text">{r.total}</span>
              </div>
            ))}
          </div>
        </StepPanel>
      )}

      {usesPool && (
        <div className="cw-pool" aria-label="Нераспределённые значения">
          <span className="cw-pool-label">
            {poolLeft > 0 ? 'Выберите значение и назначьте его характеристике' : 'Всё распределено'}
          </span>
          <div className="cw-pool-chips">
            {draft.rolledPool.map((value, i) => (
              <button
                key={`${value}-${i}`}
                type="button"
                className={`cw-pool-chip${picked === value ? ' is-picked' : ''}`}
                onClick={() => setPicked(picked === value ? null : value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cw-abilities">
        {ABILITY_KEYS.map((key) => {
          const label = ABILITY_LABELS[key]
          const base = draft.baseScores[key]
          const bonus = racial[key] ?? 0
          const total = Math.min(20, (base ?? 8) + bonus)
          const empty = usesPool && base == null

          return (
            <div
              key={key}
              className={`cw-ability${empty ? ' is-empty' : ''}${picked != null && usesPool ? ' is-droppable' : ''}`}
            >
              <span className="cw-ability-name">{label.label}</span>

              {usesPool ? (
                <button
                  type="button"
                  className="cw-ability-slot"
                  onClick={() => (base == null ? place(key) : unplace(key))}
                  disabled={base == null && picked == null}
                  title={base == null ? 'Назначить выбранное значение' : 'Вернуть значение в пул'}
                >
                  {base ?? '—'}
                  {base != null && <Undo2 aria-hidden="true" className="cw-ability-undo" />}
                </button>
              ) : (
                <div className="cw-ability-stepper">
                  <button type="button" onClick={() => adjust(key, -1)} aria-label="Меньше">
                    −
                  </button>
                  <span className="cw-ability-slot is-static">{scoreOf(draft.baseScores, key)}</span>
                  <button type="button" onClick={() => adjust(key, 1)} aria-label="Больше">
                    +
                  </button>
                </div>
              )}

              <span className="cw-ability-total">
                {bonus > 0 && <i className="cw-ability-bonus">+{bonus} от расы</i>}
                <b>{total}</b>
                <em>{formatMod(abilityMod(total))}</em>
              </span>
            </div>
          )
        })}
      </div>

      <div className="cw-card-chips cw-abilities-foot">
        {draft.abilityMethod === 'pointbuy' && (
          <FactChip>
            очки: {spent} / {POINT_BUY_BUDGET}
          </FactChip>
        )}
        {Object.entries(racial).map(([k, v]) => (
          <FactChip key={k}>
            {ABILITY_RU[k] ?? k} +{v} от расы
          </FactChip>
        ))}
      </div>
    </div>
  )
}
