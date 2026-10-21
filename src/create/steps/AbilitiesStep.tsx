/**
 * Шаг 5 — характеристики. Четыре способа: настоящие 3D-броски 4к6 с отбросом
 * младшей кости, стандартный набор, покупка за очки и ручной ввод.
 *
 * Броски и стандартный набор работают одинаково: выпавшие значения попадают в
 * «пул», откуда игрок раскладывает их по характеристикам.
 */
import { useCallback, useMemo, useState } from 'react'
import { Check, Dices, Eye, RotateCcw, Undo2 } from 'lucide-react'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'
import type { AbilityName } from '../../types/character'
import { ABILITY_RU } from '../../api'
import { skillKeysFromNames } from '../../skills'
import { abilityMod, formatMod, proficiencyBonus } from '../dnd5e'
import {
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  pointBuySpent,
  scoreOf,
  type AbilityMethod,
  type StepProps,
} from '../draft'
import { finalScores, racialBonuses } from '../deriveCharacter'
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

const MAX_ROLLS = 6
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** Точки на грани к6 — номера ячеек сетки 3×3 */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/** Маленькая грань к6 с точками; отброшенная — перечёркнута и приглушена */
function DieFace({ value, dropped }: { value: number; dropped?: boolean }) {
  const on = new Set(PIPS[value] ?? [])
  return (
    <span
      className={`cw-d6${dropped ? ' is-dropped' : ''}`}
      title={dropped ? `${value} — отброшено` : String(value)}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={on.has(i) ? 'is-on' : undefined} />
      ))}
    </span>
  )
}

/** Ещё не брошенная ячейка: тусклый гекс с римским номером */
function EmptySlot({ index, rolling }: { index: number; rolling: boolean }) {
  return (
    <div className={`cw-rollslot is-empty${rolling ? ' is-rolling' : ''}`}>
      <span className="cw-rollslot-hex">
        <span>{rolling ? <Dices aria-hidden="true" /> : ROMAN[index]}</span>
      </span>
      <span className="cw-rollslot-caption">{rolling ? 'катятся…' : 'не брошено'}</span>
    </div>
  )
}

/**
 * Карточка значения: итог в гексе, под ним кости (у бросков). Клик по свободной
 * карточке выбирает её, по назначенной — возвращает значение с характеристики.
 */
function ValueSlot({
  index,
  total,
  values,
  owner,
  picked,
  onClick,
}: {
  index: number
  total: number
  values: number[] | null
  owner: AbilityName | null
  picked: boolean
  onClick: () => void
}) {
  const sorted = values ? [...values].sort((a, b) => b - a) : null
  const state = owner ? ' is-assigned' : picked ? ' is-picked' : ''
  return (
    <button
      type="button"
      className={`cw-rollslot${state}`}
      onClick={onClick}
      aria-pressed={picked}
      title={
        owner
          ? `Назначено: ${ABILITY_LABELS[owner].label}. Нажмите, чтобы вернуть`
          : 'Выберите, затем нажмите на характеристику'
      }
    >
      <span className="cw-rollslot-num">{ROMAN[index]}</span>
      {owner && <span className="cw-rollslot-owner">→ {ABILITY_LABELS[owner].abbr}</span>}
      <span className="cw-rollslot-hex">
        <span>
          <b className="gold-text">{total}</b>
        </span>
      </span>
      {sorted && (
        <span className="cw-rollslot-dice">
          {sorted.map((v, j) => (
            <DieFace key={j} value={v} dropped={j === sorted.length - 1} />
          ))}
        </span>
      )}
    </button>
  )
}

/**
 * Какая карточка какой характеристике отдана. Значения равного номинала
 * взаимозаменяемы, поэтому сопоставляем по значению: первую подходящую
 * карточку — первой характеристике с таким числом.
 */
function slotOwners(totals: number[], scores: Record<AbilityName, number | null>): (AbilityName | null)[] {
  const owners: (AbilityName | null)[] = totals.map(() => null)
  for (const ability of ABILITY_KEYS) {
    const value = scores[ability]
    if (value == null) continue
    const i = totals.findIndex((t, k) => t === value && owners[k] === null)
    if (i !== -1) owners[i] = ability
  }
  return owners
}

/**
 * Запас очков при покупке: сколько осталось, полоска из 27 делений и цены
 * значений с пометкой, сколько характеристик сейчас стоит на каждом.
 */
function PointsPanel({
  spent,
  scores,
}: {
  spent: number
  scores: Record<AbilityName, number | null>
}) {
  const left = POINT_BUY_BUDGET - spent
  const atScore = (n: number) => ABILITY_KEYS.filter((k) => scoreOf(scores, k) === n).length
  return (
    <StepPanel className="cw-roll-panel cw-points">
      <div className="cw-points-main">
        <span className={`cw-rollslot-hex cw-points-hex${left === 0 ? ' is-done' : ''}`}>
          <span>
            <b key={left} className="gold-text cw-skill-flash">{left}</b>
          </span>
        </span>
        <span className="cw-points-text">
          <b>{left === 0 ? 'Все очки потрачены' : 'очков осталось'}</b>
          <i>
            потрачено {spent} из {POINT_BUY_BUDGET}
          </i>
        </span>
      </div>

      <div className="cw-points-bar" aria-hidden="true">
        {Array.from({ length: POINT_BUY_BUDGET }, (_, i) => (
          <i key={i} className={i < left ? 'is-left' : undefined} />
        ))}
      </div>

      <div className="cw-points-costs" aria-label="Цена значений">
        {Object.entries(POINT_BUY_COST).map(([score, cost]) => {
          const n = atScore(Number(score))
          return (
            <span key={score} className={`cw-points-cost${n ? ' is-used' : ''}`}>
              <b>{score}</b>
              <i>{cost} оч.</i>
              {n > 0 && <em>×{n}</em>}
            </span>
          )
        })}
      </div>
    </StepPanel>
  )
}

/**
 * Навыки с живыми модификаторами: характеристика с расовым бонусом плюс
 * мастерство, если навык уже дают выбранные класс или предыстория.
 * Изменившееся число коротко вспыхивает (новый key перезапускает анимацию).
 */
function SkillsPanel({
  scores,
  assigned,
  proficient,
  pb,
}: {
  scores: Record<AbilityName, number>
  assigned: (key: AbilityName) => boolean
  proficient: Set<string>
  pb: number
}) {
  const passive = assigned('wisdom')
    ? 10 + abilityMod(scores.wisdom) + (proficient.has('perception') ? pb : 0)
    : null

  return (
    <aside className="cw-skills" aria-label="Навыки">
      <h4 className="cw-skills-title">Навыки</h4>
      {ABILITY_KEYS.map((ability) => {
        const skills = DEFAULT_SKILLS.filter((sk) => sk.ability === ability)
        if (skills.length === 0) return null
        const ready = assigned(ability)
        const mod = abilityMod(scores[ability])
        return (
          <div key={ability} className={`cw-skill-group${ready ? '' : ' is-pending'}`}>
            <div className="cw-skill-group-head">
              <span>{ABILITY_LABELS[ability].label}</span>
              <b key={ready ? mod : 'x'} className="cw-skill-flash">
                {ready ? formatMod(mod) : '—'}
              </b>
            </div>
            {skills.map((sk) => {
              const prof = proficient.has(sk.key)
              const value = mod + (prof ? pb : 0)
              return (
                <div key={sk.key} className={`cw-skill${prof ? ' is-prof' : ''}`}>
                  <span className="cw-skill-mark" title={prof ? 'Владение навыком' : undefined}>
                    {prof && <Check aria-hidden="true" />}
                  </span>
                  <span className="cw-skill-name">{sk.label}</span>
                  <b key={ready ? value : 'x'} className="cw-skill-val cw-skill-flash">
                    {ready ? formatMod(value) : '—'}
                  </b>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="cw-skill-passive">
        <Eye aria-hidden="true" />
        <span>Пассивная внимательность</span>
        <b key={passive ?? 'x'} className="cw-skill-flash">
          {passive ?? '—'}
        </b>
      </div>
    </aside>
  )
}

export default function AbilitiesStep({ draft, update }: StepProps) {
  const dice = useDice()
  // номер выбранной карточки значения (броска или числа стандартного набора)
  const [pickedSlot, setPickedSlot] = useState<number | null>(null)
  const [diceError, setDiceError] = useState<string | null>(null)

  const racial = useMemo(() => racialBonuses(draft), [draft])
  const usesPool = draft.abilityMethod === 'roll' || draft.abilityMethod === 'array'
  const spent = pointBuySpent(draft.baseScores)
  const scores = useMemo(() => finalScores(draft), [draft])
  // навыки, которые уже даёт выбранное: класс (решения 1 уровня) и предыстория
  const proficient = useMemo(
    () =>
      new Set([
        ...draft.levels.flatMap((l) => l.skills),
        ...skillKeysFromNames(draft.background?.skill_proficiencies),
      ]),
    [draft.levels, draft.background],
  )
  const assigned = (key: AbilityName) => !usesPool || draft.baseScores[key] != null

  const rolls = draft.abilityRolls
  // карточки значений: броски с костями или числа стандартного набора
  const slotTotals = draft.abilityMethod === 'roll' ? rolls.map((r) => r.total) : STANDARD_ARRAY
  const owners = slotOwners(slotTotals, draft.baseScores)
  const picked = pickedSlot != null && owners[pickedSlot] == null ? slotTotals[pickedSlot] : null

  const setMethod = (method: AbilityMethod) => {
    setPickedSlot(null)
    setDiceError(null)
    const blank = Object.fromEntries(ABILITY_KEYS.map((k) => [k, null])) as Record<
      AbilityName,
      number | null
    >
    if (method === 'array') {
      update({
        abilityMethod: method,
        baseScores: blank,
        rolledPool: [...STANDARD_ARRAY],
        abilityRolls: [],
      })
      return
    }
    if (method === 'pointbuy') {
      const eight = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8])) as Record<
        AbilityName,
        number | null
      >
      update({ abilityMethod: method, baseScores: eight, rolledPool: [], abilityRolls: [] })
      return
    }
    if (method === 'manual') {
      const ten = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])) as Record<
        AbilityName,
        number | null
      >
      update({ abilityMethod: method, baseScores: ten, rolledPool: [], abilityRolls: [] })
      return
    }
    update({ abilityMethod: method, baseScores: blank, rolledPool: [], abilityRolls: [] })
  }

  const rollOne = useCallback(async () => {
    if (rolls.length >= MAX_ROLLS || dice.rolling) return
    setDiceError(null)
    try {
      const values = await dice.roll('4d6')
      const { total } = dropLowest(values)
      update({
        rolledPool: [...draft.rolledPool, total],
        abilityRolls: [...draft.abilityRolls, { values, total }],
      })
    } catch {
      // кости могли не подняться (WebGL) — честно говорим и оставляем ручной ввод
      setDiceError('Кости не отозвались. Выберите «Вручную» или попробуйте снова.')
    }
  }, [dice, draft.rolledPool, draft.abilityRolls, rolls.length, update])

  const resetRolls = () => {
    setPickedSlot(null)
    update({
      rolledPool: [],
      abilityRolls: [],
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
    setPickedSlot(null)
  }

  /** Клик по карточке: свободную — выбрать/снять выбор, назначенную — вернуть */
  const clickSlot = (index: number) => {
    const owner = owners[index]
    if (owner) {
      unplace(owner)
      setPickedSlot(null)
      return
    }
    setPickedSlot(pickedSlot === index ? null : index)
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
  const hint =
    poolLeft === 0
      ? 'Всё распределено — нажмите на карточку, чтобы вернуть значение'
      : picked != null
        ? `Теперь нажмите на характеристику, чтобы положить ${picked}`
        : 'Выберите карточку, затем нажмите на характеристику'

  return (
    <div className="cw-step">
      <StepHeader
        title="Из чего ты сделан?"
        lead="Расовые бонусы добавляются поверх, а навыки справа сразу пересчитываются."
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

          {rolls.length > 0 && <p className="cw-pool-label">{hint}</p>}
          <div className="cw-rollslots">
            {Array.from({ length: MAX_ROLLS }, (_, i) =>
              rolls[i] ? (
                <ValueSlot
                  key={i}
                  index={i}
                  total={rolls[i].total}
                  values={rolls[i].values}
                  owner={owners[i]}
                  picked={pickedSlot === i}
                  onClick={() => clickSlot(i)}
                />
              ) : (
                <EmptySlot key={i} index={i} rolling={dice.rolling && i === rolls.length} />
              ),
            )}
          </div>
        </StepPanel>
      )}

      {draft.abilityMethod === 'pointbuy' && (
        <PointsPanel spent={spent} scores={draft.baseScores} />
      )}

      {draft.abilityMethod === 'array' && (
        <StepPanel className="cw-roll-panel">
          <p className="cw-pool-label">{hint}</p>
          <div className="cw-rollslots">
            {STANDARD_ARRAY.map((value, i) => (
              <ValueSlot
                key={i}
                index={i}
                total={value}
                values={null}
                owner={owners[i]}
                picked={pickedSlot === i}
                onClick={() => clickSlot(i)}
              />
            ))}
          </div>
        </StepPanel>
      )}

      <div className="cw-ab-layout">
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
                    onClick={() => (picked != null ? place(key) : unplace(key))}
                    disabled={base == null && picked == null}
                    title={
                      picked != null
                        ? `Положить ${picked}`
                        : base != null
                          ? 'Вернуть значение на карточку'
                          : 'Сначала выберите карточку'
                    }
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

        <SkillsPanel
          scores={scores}
          assigned={assigned}
          proficient={proficient}
          pb={proficiencyBonus(draft.targetLevel)}
        />
      </div>

      <div className="cw-card-chips cw-abilities-foot">
        {Object.entries(racial).map(([k, v]) => (
          <FactChip key={k}>
            {ABILITY_RU[k] ?? k} +{v} от расы
          </FactChip>
        ))}
      </div>
    </div>
  )
}
