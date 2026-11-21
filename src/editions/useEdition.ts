/**
 * Хуки редакции правил. Действующая: запись (?ed=) > раздел > общая.
 * Смена любой из них перерисовывает подписчиков, а эффекты загрузки, у которых
 * редакция в зависимостях, перезапрашивают данные.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUserSettings } from '../settings/settings'
import { isEdition, sectionEditionOf, sectionOf, shownEdition, type Edition, type EditionSection } from './edition'
import { setGlobalEdition, setSectionEdition } from './store'

/** Общая редакция сайта и её смена */
export function useGlobalEdition(): [Edition, (e: Edition) => void] {
  return [useUserSettings().edition, setGlobalEdition]
}

export type SectionEditionState = {
  /** действующая редакция раздела */
  edition: Edition
  /** общая редакция */
  global: Edition
  /** раздел отличается от общей */
  overridden: boolean
  set: (e: Edition) => void
  /** «как везде» */
  reset: () => void
}

/**
 * Редакция раздела каталога. Без раздела — общая. Ресурс вроде `subclasses`
 * относится к своему разделу (`classes`).
 */
export function useEdition(sectionOrResource?: EditionSection | string | null): SectionEditionState {
  const { edition: global, editionSections } = useUserSettings()
  const section = sectionOrResource ? sectionOf(sectionOrResource) : null
  const edition = sectionEditionOf(section, global, editionSections)
  const set = useCallback((e: Edition) => (section ? setSectionEdition(section, e) : setGlobalEdition(e)), [section])
  const reset = useCallback(() => {
    if (section) setSectionEdition(section, null)
  }, [section])
  return { edition, global, overridden: !!section && editionSections[section] !== undefined, set, reset }
}

/** Редакция записи из адреса (?ed=2014), если задана */
export function useUrlEdition(): Edition | null {
  const [params] = useSearchParams()
  const ed = params.get('ed')
  return isEdition(ed) ? ed : null
}

/**
 * Редакция, которую показывает запись: ?ed= или редакция раздела, если запись
 * в ней действует, иначе её собственная. Для дочерних запросов записи.
 */
export function useRecordEdition(resource: string, record: { editions?: readonly string[] | null } | null | undefined): Edition {
  const { edition } = useEdition(resource)
  const wanted = useUrlEdition() ?? edition
  return record ? shownEdition(record.editions, wanted) : wanted
}
