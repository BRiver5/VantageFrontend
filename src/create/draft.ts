/**
 * Черновик персонажа внутри визарда. Хранит и выбранные объекты каталога (для
 * отрисовки карточек и авто-применения правил), и решения игрока по каждому
 * уровню. В лист персонажа всё это превращает deriveCharacter.
 */
import type { Background, CharacterVisibility, GameClass, Race, Spell, Subclass, Subrace } from '../api'
import type { AbilityName, InventoryItemInstance } from '../types/character'
import { ABILITY_KEYS } from '../types/character'
import type { GearPick } from './startingGear'

/** Способ получения характеристик */
export type AbilityMethod = 'roll' | 'array' | 'pointbuy' | 'manual'

/** Как получены хиты за уровень */
export type HpMode = 'roll' | 'average' | 'manual'

/** Стандартный набор значений из PHB */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

/** Стоимость покупки характеристики в поинт-бае */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
}

export const POINT_BUY_BUDGET = 27

/** Один бросок 4к6: все четыре кости и сумма трёх старших */
export interface AbilityRoll {
  values: number[]
  total: number
}

/** Решения игрока на одном уровне класса */
export interface LevelChoice {
  level: number
  /** выпавшее/введённое значение кости хитов без модификатора Телосложения */
  hpRoll: number | null
  hpMode: HpMode
  /** навыки, выбранные на этом уровне (обычно только на первом) */
  skills: string[]
  /** распределение очков усиления характеристик */
  asi: Partial<Record<AbilityName, number>>
  /** выбрана черта вместо усиления характеристик */
  featName: string | null
  /** UUID черты — сервер хранит черты по id */
  featId: string | null
  /** новые заклинания и заговоры, выбранные на этом уровне */
  spells: Spell[]
  cantrips: Spell[]
  /** уровень пройден игроком */
  done: boolean
}

export interface CharacterDraft {
  race: Race | null
  subrace: Subrace | null
  cls: GameClass | null
  subclass: Subclass | null
  background: Background | null

  targetLevel: number

  abilityMethod: AbilityMethod
  /**
   * Базовые значения до расовых бонусов и усилений. null — значение ещё не
   * назначено: при раскладке бросков и стандартного набора «пусто» нужно
   * отличать от честной восьмёрки.
   */
  baseScores: Record<AbilityName, number | null>
  /** выпавшие значения, ещё не разложенные по характеристикам */
  rolledPool: number[]
  /** броски 4к6 с самими костями — карточки шага характеристик */
  abilityRolls: AbilityRoll[]

  name: string
  avatarUrl: string
  alignment: string
  gender: string
  age: string
  height: string
  weight: string
  eyes: string
  hair: string
  skin: string
  traits: string
  ideals: string
  bonds: string
  flaws: string
  backstory: string

  visibility: CharacterVisibility

  /** стартовое снаряжение: ключ гранта → выбранный вариант и предметы */
  gear: Record<string, GearPick>

  /** подготовленные заклинания (жрец, друид, паладин, изобретатель, волшебник) */
  preparedSpells: Spell[]

  /**
   * Инвентарь, изменённый вручную на итоге. Действует, пока совпадает
   * `inventoryKey` — слепок выбора снаряжения: сменили класс, предысторию или
   * варианты — ручная правка устарела и инвентарь собирается заново.
   */
  inventory: InventoryItemInstance[] | null
  inventoryKey: string

  levels: LevelChoice[]
}

/** Обновление черновика — частичный патч поверх текущего состояния */
export type DraftUpdate = (patch: Partial<CharacterDraft>) => void

/** Базовые пропсы каждого шага визарда */
export interface StepProps {
  draft: CharacterDraft
  update: DraftUpdate
}

export function emptyLevelChoice(level: number): LevelChoice {
  return {
    level,
    hpRoll: null,
    hpMode: level === 1 ? 'average' : 'roll',
    skills: [],
    asi: {},
    featName: null,
    featId: null,
    spells: [],
    cantrips: [],
    done: false,
  }
}

function blankScores(): Record<AbilityName, number | null> {
  return Object.fromEntries(ABILITY_KEYS.map((k) => [k, null])) as Record<AbilityName, number | null>
}

/** Значение характеристики с учётом «не назначено» — пустое считаем восьмёркой */
export function scoreOf(scores: Record<AbilityName, number | null>, key: AbilityName): number {
  return scores[key] ?? 8
}

export function initialDraft(visibility: CharacterVisibility): CharacterDraft {
  return {
    race: null,
    subrace: null,
    cls: null,
    subclass: null,
    background: null,
    targetLevel: 1,
    abilityMethod: 'roll',
    baseScores: blankScores(),
    rolledPool: [],
    abilityRolls: [],
    name: '',
    avatarUrl: '',
    alignment: '',
    gender: '',
    age: '',
    height: '',
    weight: '',
    eyes: '',
    hair: '',
    skin: '',
    traits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
    visibility,
    gear: {},
    preparedSpells: [],
    inventory: null,
    inventoryKey: '',
    levels: [emptyLevelChoice(1)],
  }
}

/** Приводит список уровней к целевому: лишние убирает, недостающие добавляет */
export function resizeLevels(levels: LevelChoice[], target: number): LevelChoice[] {
  const next = levels.slice(0, target)
  for (let l = next.length + 1; l <= target; l++) next.push(emptyLevelChoice(l))
  return next
}

/** Сколько очков поинт-бая потрачено */
export function pointBuySpent(scores: Record<AbilityName, number | null>): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + (POINT_BUY_COST[scoreOf(scores, k)] ?? 0), 0)
}
