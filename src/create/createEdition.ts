/**
 * Редакция нового героя и каталогов шагов конструктора. Чистая логика.
 *
 * Герой создаётся по одной редакции (`draft.edition`, уходит в `edition`
 * персонажа), но каждый шаг с каталогом может показать записи другой: расу
 * из 2014, класс из 2024. Выбранные записи остаются со своими id — сервер
 * хранит ссылки и смешение принимает как есть.
 */
import {
  DEFAULT_EDITION,
  isEdition,
  pruneSectionEditions,
  sectionEditionOf,
  shownEdition,
  withSectionEdition,
  type Edition,
  type SectionEditions,
} from '../editions/edition'

/** Ключ localStorage: в какой редакции «Новый герой» создаёт по умолчанию */
export const NEW_HERO_EDITION_KEY = 'vantage-new-hero-edition'

/** Адрес конструктора с редакцией героя */
export const newHeroHref = (edition: Edition): string => `/characters/new?ed=${edition}`

/** Редакция героя из адреса конструктора (?ed=); нет или мусор — 2024 */
export function editionFromSearch(search: string): Edition {
  const ed = new URLSearchParams(search).get('ed')
  return isEdition(ed) ? ed : DEFAULT_EDITION
}

/** Шаги-каталоги со своим переключателем редакции (ключ — раздел каталога) */
export type StepSection = 'races' | 'classes' | 'backgrounds' | 'feats' | 'spells'

export const STEP_SECTIONS: readonly StepSection[] = ['races', 'classes', 'backgrounds', 'feats', 'spells']

/** Что про редакции знает черновик */
export interface DraftEditions {
  /** редакция героя */
  edition: Edition
  /** шаги, чей каталог показан в другой редакции; совпадающих с героем здесь нет */
  catalogEditions: SectionEditions
}

/** Редакция каталога шага: переопределение шага или редакция героя */
export const stepEdition = (d: DraftEditions, section: StepSection): Edition =>
  sectionEditionOf(section, d.edition, d.catalogEditions)

/** Переключить каталог шага; совпало с героем — переопределение снимается */
export const withStepEdition = (d: DraftEditions, section: StepSection, edition: Edition): Pick<DraftEditions, 'catalogEditions'> => ({
  catalogEditions: withSectionEdition(d.catalogEditions, section, edition, d.edition),
})

/**
 * Сменить редакцию героя. Шаги без переопределения идут за ней, а
 * переопределения, совпавшие с новой редакцией, снимаются.
 */
export const withHeroEdition = (d: DraftEditions, edition: Edition): DraftEditions => ({
  edition,
  catalogEditions: pruneSectionEditions(d.catalogEditions, edition),
})

/** Шаги, чей каталог сейчас не в редакции героя */
export const mixedSteps = (d: DraftEditions): StepSection[] => STEP_SECTIONS.filter((s) => stepEdition(d, s) !== d.edition)

/**
 * Редакция дочернего списка выбранной записи (подрасы расы, подклассы класса):
 * редакция шага, если запись в ней действует, иначе её собственная.
 */
export const childEdition = (record: { editions?: readonly string[] | null } | null | undefined, wanted: Edition): Edition =>
  record ? shownEdition(record.editions, wanted) : wanted

/**
 * Подсказка у переключателя, когда выбранная запись не из показанного
 * каталога (выбрали расу 2014 и переключили шаг на 2024): выбор сохранён.
 */
export function keptChoiceNote(pickedName: string | null | undefined, inList: boolean): string | null {
  return pickedName && !inList ? `выбрано: ${pickedName}` : null
}
