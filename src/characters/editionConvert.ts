/**
 * Пересоздание персонажа по другой редакции правил (2014 ⇄ 2024) и вопросы,
 * которые после этого задаёт сервер (edition_issues). Здесь — чистая логика:
 * какое действие показать, порядок вопросов, тела запросов, поиск по каталогу.
 */
import type { Character, CharacterEdition, EditionIssue, EditionIssueKind } from '../types/character'

export const EDITIONS: readonly CharacterEdition[] = ['2014', '2024']

/** Редакция персонажа; у старых документов поля нет — это 2014 */
export function editionOf(c: Pick<Character, 'edition'> | null | undefined): CharacterEdition {
  return c?.edition === '2024' ? '2024' : '2014'
}

export type ConvertAction = {
  to: CharacterEdition
  label: string
  /** 2014 → 2024 — главный путь; обратный — тише, в меню */
  prominent: boolean
}

/** Какое пересоздание предложить; null — не владелец, ему нечего пересоздавать */
export function convertActionFor(c: Pick<Character, 'edition'> | null | undefined, canEdit: boolean): ConvertAction | null {
  if (!c || !canEdit) return null
  const to: CharacterEdition = editionOf(c) === '2014' ? '2024' : '2014'
  return { to, label: `Пересоздать по правилам ${to}`, prominent: to === '2024' }
}

/** Тело POST /characters/{id}/convert-edition */
export function convertBody(to: CharacterEdition): { to: CharacterEdition } {
  return { to }
}

export type ResolveAction = { action: 'keep' } | { action: 'replace'; replacement_id: string }

/** Тело POST …/edition-issues/{key}/resolve */
export function resolveBody(replacementId?: string | null): ResolveAction {
  const id = replacementId?.trim()
  return id ? { action: 'replace', replacement_id: id } : { action: 'keep' }
}

/** Порядок вопросов: сначала то, от чего зависит остальное */
const KIND_ORDER: EditionIssueKind[] = [
  'class',
  'subclass',
  'race',
  'subrace',
  'background',
  'ability_scores',
  'feat',
  'ability',
  'spell',
  'item',
]

export const KIND_LABEL: Record<EditionIssueKind, string> = {
  class: 'Класс',
  subclass: 'Подкласс',
  race: 'Вид',
  subrace: 'Подвид',
  background: 'Предыстория',
  feat: 'Черта',
  spell: 'Заклинание',
  item: 'Предмет',
  ability: 'Умение',
  ability_scores: 'Характеристики',
}

const kindRank = (k: EditionIssueKind) => {
  const i = KIND_ORDER.indexOf(k)
  return i < 0 ? KIND_ORDER.length : i
}

export function sortIssues(issues: readonly EditionIssue[]): EditionIssue[] {
  return [...issues].sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      (a.old?.name ?? a.message).localeCompare(b.old?.name ?? b.message, 'ru') ||
      a.key.localeCompare(b.key),
  )
}

export type IssueGroups = { open: EditionIssue[]; kept: EditionIssue[]; replaced: EditionIssue[] }

/** Открытые — в плашку; оставленные — приглушённой строкой; заменённые не показываются */
export function groupIssues(issues: readonly EditionIssue[] | null | undefined): IssueGroups {
  const out: IssueGroups = { open: [], kept: [], replaced: [] }
  for (const i of sortIssues(issues ?? [])) {
    if (i.status === 'kept') out.kept.push(i)
    else if (i.status === 'replaced') out.replaced.push(i)
    else out.open.push(i)
  }
  return out
}

/** Сколько вопросов показать сразу; остальные — под «Показать ещё» */
export const ISSUES_VISIBLE = 3

/** Разделы каталога, где можно поискать замену сверх предложенных вариантов */
export const SEARCH_RESOURCES: Partial<Record<EditionIssueKind, string[]>> = {
  background: ['backgrounds'],
  feat: ['feats'],
  spell: ['spells'],
  item: ['equipment', 'items'],
}

/** Больше стольких вариантов — список заменяется поиском */
export const MAX_LISTED_OPTIONS = 8

/** Показать поиск по каталогу: вариантов нет или их слишком много, а раздел ищется */
export function needsCatalogSearch(issue: Pick<EditionIssue, 'kind' | 'options'>): boolean {
  return !!SEARCH_RESOURCES[issue.kind] && (issue.options.length === 0 || issue.options.length > MAX_LISTED_OPTIONS)
}

/** Адрес поиска по разделу каталога в нужной редакции */
export function catalogSearchPath(resource: string, q: string, edition: CharacterEdition, limit = 20): string {
  const params = new URLSearchParams({ skip: '0', limit: String(limit), edition })
  if (q.trim()) params.set('q', q.trim())
  return `/${resource}?${params}`
}

const NAME_FIELDS = [
  'name',
  'background_name',
  'feat_name',
  'spell_name',
  'item_name',
  'equipment_name',
  'class_name',
  'subclass_name',
  'race_name',
  'subrace_name',
]

/** Название записи каталога: у каждого раздела своё поле */
export function entityName(x: Record<string, unknown>): string {
  for (const f of NAME_FIELDS) {
    const v = x[f]
    if (typeof v === 'string' && v.trim()) return v
  }
  return String(x.id ?? '')
}

/** «Оставлено из 2014: Мастер оружия» — приглушённая строка под плашкой */
export function keptLine(issue: EditionIssue, from: CharacterEdition): string {
  const name = issue.old?.name ?? KIND_LABEL[issue.kind]
  return `${name} — оставлено из ${from}`
}
