/**
 * Редакция из настроек профиля: общая и по разделам. Без React — её читает
 * слой API, когда вызывающий не назвал редакцию явно; хуки — в useEdition.ts.
 */
import { getUserSettings, setUserSettings } from '../settings/settings'
import { sectionEditionOf, sectionOf, withSectionEdition, type Edition, type EditionSection } from './edition'

/** Общая редакция сайта */
export const globalEdition = (): Edition => getUserSettings().edition

/** Редакция раздела: его переопределение или общая */
export function sectionEdition(section: EditionSection | null | undefined): Edition {
  const s = getUserSettings()
  return sectionEditionOf(section, s.edition, s.editionSections)
}

/** Редакция, в которой по умолчанию запрашивается ресурс API */
export const resourceEdition = (resource: string): Edition => sectionEdition(sectionOf(resource.split('/')[0]))

/** Сменить общую: разделы без переопределения пойдут следом */
export function setGlobalEdition(edition: Edition): void {
  setUserSettings({ edition })
}

/** Переопределить раздел; `null` или совпадение с общей — «как везде» */
export function setSectionEdition(section: EditionSection, edition: Edition | null): void {
  const s = getUserSettings()
  setUserSettings({ editionSections: withSectionEdition(s.editionSections, section, edition, s.edition) })
}
