/**
 * Редакции правил D&D 5e: 2014 и 2024. Чистая логика без React и хранилища —
 * какая редакция действует, какие параметры уходят в API, куда вести при
 * переключении записи.
 *
 * Действующая редакция: запись (?ed= в адресе) > раздел каталога > общая.
 * Общая и разделы хранятся в настройках профиля (settings.ts), запись — в адресе.
 */

export type Edition = '2014' | '2024'

export const EDITIONS: readonly Edition[] = ['2014', '2024']

/** По умолчанию сайт показывает правила 2024 */
export const DEFAULT_EDITION: Edition = '2024'

export const isEdition = (v: unknown): v is Edition => v === '2014' || v === '2024'

export const otherEdition = (e: Edition): Edition => (e === '2024' ? '2014' : '2024')

/* ---------- разделы ---------- */

/** Разделы каталога, у которых своя редакция (ключ — ресурс API раздела) */
export const EDITION_SECTIONS = [
  'spells',
  'items',
  'equipment',
  'creatures',
  'classes',
  'races',
  'backgrounds',
  'feats',
  'termins',
] as const

export type EditionSection = (typeof EDITION_SECTIONS)[number]

export type SectionEditions = Partial<Record<EditionSection, Edition>>

export const isEditionSection = (v: unknown): v is EditionSection =>
  typeof v === 'string' && (EDITION_SECTIONS as readonly string[]).includes(v)

/**
 * Коллекции сервера с полем `editions` (EDITIONED_COLLECTIONS): только им
 * имеет смысл передавать `?edition=`. У книг `edition` фильтрует сами книги —
 * карте книг для бейджей источника нужны все, поэтому книг здесь нет.
 */
export const EDITIONED_RESOURCES: ReadonlySet<string> = new Set([
  'spells',
  'items',
  'equipment',
  'feats',
  'backgrounds',
  'classes',
  'subclasses',
  'races',
  'subraces',
  'creatures',
  'features',
  'class_resources',
  'abilities',
  'termins',
])

/** Ресурс API → раздел каталога, чья редакция к нему относится */
const RESOURCE_SECTION: Record<string, EditionSection> = {
  subclasses: 'classes',
  features: 'classes',
  class_resources: 'classes',
  subraces: 'races',
}

export function sectionOf(resource: string): EditionSection | null {
  if (isEditionSection(resource)) return resource
  return RESOURCE_SECTION[resource] ?? null
}

/** Только известные разделы с допустимой редакцией */
export function sanitizeSectionEditions(raw: unknown): SectionEditions {
  const out: SectionEditions = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isEditionSection(k) && isEdition(v)) out[k] = v
  }
  return out
}

/* ---------- разрешение ---------- */

/** Действующая редакция: запись > раздел > общая */
export function resolveEdition(o: { element?: Edition | null; section?: Edition | null; global: Edition }): Edition {
  return o.element ?? o.section ?? o.global
}

/** Редакция раздела: его переопределение или общая */
export function sectionEditionOf(section: EditionSection | null | undefined, global: Edition, sections: SectionEditions): Edition {
  return resolveEdition({ section: section ? sections[section] : null, global })
}

/**
 * Переопределить раздел. Совпало с общей — переопределение снимается: раздел
 * снова идёт за общей. Так в настройках лежат только отличия, и «как везде»
 * видно ровно тогда, когда раздел отличается.
 */
export function withSectionEdition(sections: SectionEditions, section: EditionSection, edition: Edition | null, global: Edition): SectionEditions {
  const next = { ...sections }
  if (edition === null || edition === global) delete next[section]
  else next[section] = edition
  return next
}

/**
 * Сменилась общая редакция: разделы без переопределения идут за ней сами
 * (их просто нет в карте), а переопределения, совпавшие с новой общей,
 * снимаются — иначе их нельзя было бы увидеть и сбросить.
 */
export function pruneSectionEditions(sections: SectionEditions, global: Edition): SectionEditions {
  const next: SectionEditions = {}
  for (const k of Object.keys(sections) as EditionSection[]) {
    const v = sections[k]
    if (v && v !== global) next[k] = v
  }
  return next
}

/* ---------- запросы ---------- */

/**
 * Параметр `edition` запроса к ресурсу. `null` — не передавать (точный
 * документ, ресурс вне редакций).
 */
export function editionParamFor(resource: string, edition: Edition | null | undefined): Edition | null {
  if (!edition) return null
  const base = resource.split('/')[0]
  return EDITIONED_RESOURCES.has(base) ? edition : null
}

/** Добавить `edition=` к параметрам, если ресурс его понимает */
export function appendEdition(params: URLSearchParams, resource: string, edition: Edition | null | undefined): URLSearchParams {
  const e = editionParamFor(resource, edition)
  if (e) params.set('edition', e)
  return params
}

/* ---------- одна запись ---------- */

export type EditionRef = { id: string; name: string }

/** Ответ `GET /{entity}/{id}/editions` */
export type EditionsMap = Record<Edition, EditionRef | null>

export function sanitizeEditionsMap(raw: unknown): EditionsMap | null {
  const src = raw && typeof raw === 'object' ? ((raw as { editions?: unknown }).editions ?? null) : null
  if (!src || typeof src !== 'object') return null
  const out: EditionsMap = { '2014': null, '2024': null }
  for (const e of EDITIONS) {
    const v = (src as Record<string, unknown>)[e]
    if (v && typeof v === 'object' && typeof (v as EditionRef).id === 'string') {
      out[e] = { id: String((v as EditionRef).id), name: String((v as EditionRef).name ?? '') }
    }
  }
  return out
}

/** Редакции документа: по карте версий, иначе по его полю `editions` (без поля — 2014) */
export function docEditions(id: string, map: EditionsMap | null, recordEditions: readonly string[] | null | undefined): Edition[] {
  if (map) {
    const own = EDITIONS.filter((e) => map[e]?.id === id)
    if (own.length) return own
  }
  if (recordEditions === undefined) return []
  const list = (recordEditions ?? []).filter(isEdition)
  return list.length ? list : ['2014']
}

/**
 * Какую редакцию показывает запись по её полю `editions`: нужную, если запись
 * в ней действует, иначе свою (запись без поля — 2014). По ней запрашиваются
 * дочерние списки записи (подклассы класса, подрасы расы).
 */
export function shownEdition(recordEditions: readonly string[] | null | undefined, wanted: Edition): Edition {
  const own = docEditions('', null, recordEditions ?? null)
  return own.includes(wanted) ? wanted : own[0]
}

export type ElementEditionPlan = {
  /** какую редакцию показывает запись */
  shown: Edition
  /** можно ли переключить */
  canSwitch: boolean
  /** почему нельзя (подсказка выключенного переключателя) */
  reason: string | null
  /** куда вести при переключении: id версии другой редакции */
  targetId: string | null
  /** запись не той редакции, а нужная версия есть — перейти на неё */
  redirectId: string | null
  /** ещё не знаем редакций записи */
  pending: boolean
}

/**
 * План переключателя записи. `wanted` — редакция из адреса (?ed=) или
 * раздела. Документ общий для обеих редакций — переключение меняет только
 * ?ed=, id тот же.
 */
export function planElementEdition(o: {
  id: string
  map: EditionsMap | null
  recordEditions: readonly string[] | null | undefined
  wanted: Edition
  /** вести на версию нужной редакции сам (страница записи); в ленте предметов — нет */
  follow?: boolean
}): ElementEditionPlan {
  const own = docEditions(o.id, o.map, o.recordEditions)
  if (own.length === 0) return { shown: o.wanted, canSwitch: false, reason: null, targetId: null, redirectId: null, pending: true }
  const shown = own.includes(o.wanted) ? o.wanted : own[0]
  const other = otherEdition(shown)
  const targetId = own.includes(other) ? o.id : (o.map?.[other]?.id ?? null)
  const variant = o.map?.[o.wanted]?.id
  const redirectId = o.follow !== false && !own.includes(o.wanted) && variant && variant !== o.id ? variant : null
  return {
    shown,
    canSwitch: targetId !== null,
    reason: targetId === null ? `Есть только в редакции ${shown}` : null,
    targetId,
    redirectId,
    pending: false,
  }
}

/**
 * Адрес той же страницы для другой версии записи: id в пути (или в
 * параметре вроде ?open=) меняется на новый, ?ed= — на выбранную редакцию
 * (`null` — убрать).
 */
export function editionHref(loc: { pathname: string; search: string; hash?: string }, currentId: string, targetId: string, ed: Edition | null): string {
  const segs = loc.pathname.split('/')
  const at = segs.lastIndexOf(currentId)
  const params = new URLSearchParams(loc.search)
  if (at >= 0) segs[at] = targetId
  else {
    for (const [k, v] of [...params.entries()]) if (v === currentId) params.set(k, targetId)
  }
  if (ed) params.set('ed', ed)
  else params.delete('ed')
  const qs = params.toString()
  return `${segs.join('/')}${qs ? `?${qs}` : ''}${loc.hash ?? ''}`
}

/** «Редакция правил: 2024» — подпись переключателя */
export const editionLabel = (e: Edition): string => `Редакция правил: ${e}`

/* ---------- поиск: и другая редакция ---------- */

/**
 * Найденная запись только другой редакции (режим поиска `other_editions`):
 * её редакция или `null`, если запись есть в выбранной.
 */
export function otherEditionOf(item: unknown): Edition | null {
  const v = item && typeof item === 'object' ? (item as { other_edition?: unknown }).other_edition : null
  return isEdition(v) ? v : null
}

/** «из редакции 2014» — подпись найденной записи другой редакции */
export const otherEditionCaption = (e: Edition): string => `из редакции ${e}`

/**
 * Записи выбранной редакции — первыми, другой — следом; порядок внутри
 * каждой части сохраняется (сервер уже так отдаёт, но клиентская
 * сортировка списка не должна их перемешать).
 */
export function preferredEditionFirst<T>(items: readonly T[]): T[] {
  const own: T[] = []
  const other: T[] = []
  for (const it of items) (otherEditionOf(it) ? other : own).push(it)
  return other.length ? [...own, ...other] : [...items]
}

/** Адрес записи с ?ed= её редакции, если она из другой редакции; иначе как есть */
export function withRecordEdition(path: string, item: unknown): string {
  const ed = otherEditionOf(item)
  if (!ed) return path
  const [base, hash = ''] = path.split('#')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}ed=${ed}${hash ? `#${hash}` : ''}`
}
