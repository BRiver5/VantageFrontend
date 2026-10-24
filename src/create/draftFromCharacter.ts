/**
 * Черновик визарда для повышения уровня сохранённого героя.
 *
 * Шаг «Прокачка» визарда считает всё от одного класса: уровень в
 * `draft.levels` — это уровень класса. Поэтому черновик собирается под
 * выбранный класс: прошлые уровни этого класса — пройденные заглушки, плюс
 * один новый. Характеристики — текущие с листа (уже с расой и прошлыми
 * усилениями), а раса не ставится, чтобы её бонусы не прибавились второй раз.
 */
import type { Background, GameClass, Subclass } from '../api'
import { ABILITY_KEYS, ABILITY_SHORT } from '../types/character'
import type { AbilityName, Character, Sheet } from '../types/character'
import { emptyLevelChoice, initialDraft, type CharacterDraft } from './draft'

export function draftFromCharacter(
  character: Character,
  sheet: Sheet,
  cls: GameClass,
  subclass: Subclass | null,
  background: Background | null,
): CharacterDraft {
  const own = character.classes.find((c) => c.class_id === cls.id)
  const classLevel = own?.level ?? 0
  const draft = initialDraft(character.visibility)
  const score = (k: AbilityName) => {
    const v = sheet.values[`char.abilities.${ABILITY_SHORT[k]}.score`]
    return typeof v === 'number' ? v : (character.base_scores[ABILITY_SHORT[k]] ?? 10)
  }
  return {
    ...draft,
    name: character.character_name,
    cls,
    subclass,
    background,
    race: null,
    subrace: null,
    abilityMethod: 'manual',
    baseScores: Object.fromEntries(ABILITY_KEYS.map((k) => [k, score(k)])) as CharacterDraft['baseScores'],
    targetLevel: classLevel + 1,
    // прошлые уровни класса — уже пройдены; решения по ним хранит сервер
    levels: [
      ...Array.from({ length: classLevel }, (_, i) => ({ ...emptyLevelChoice(i + 1), hpMode: 'average' as const, done: true })),
      emptyLevelChoice(classLevel + 1),
    ],
  }
}
