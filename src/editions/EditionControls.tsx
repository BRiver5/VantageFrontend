/**
 * Переключатели редакции, подключённые к настройкам и адресу:
 * - общий (главное меню) — вся страница;
 * - раздела (шапка каталога) — со сбросом «как везде»;
 * - записи (шапка детали) — ведёт на документ другой редакции.
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { getEditions } from '../api/catalog'
import { EditionToggle, type EditionToggleSize } from '../ui/EditionToggle'
import { editionHref, editionRedirectHref, otherEditionCaption, planElementEdition, sectionOf, type Edition, type EditionsMap } from './edition'
import { useEdition, useGlobalEdition, useUrlEdition } from './useEdition'

export function GlobalEditionToggle({ size = 'normal', labels }: { size?: EditionToggleSize; labels?: 'both' | 'active' | 'none' }) {
  const [edition, setEdition] = useGlobalEdition()
  return (
    <EditionToggle
      value={edition}
      onChange={setEdition}
      size={size}
      labels={labels}
      title={`Редакция правил: ${edition} — для всего сайта`}
    />
  )
}

/** Шапка раздела: своя редакция раздела и «как везде», если она отличается */
export function SectionEditionToggle({ section }: { section: string }) {
  const { edition, global, overridden, set, reset } = useEdition(section)
  if (!sectionOf(section)) return null
  return (
    <div className="section-edition">
      <EditionToggle
        value={edition}
        onChange={set}
        size="compact"
        title={overridden ? `Редакция правил: ${edition} — только в этом разделе (везде ${global})` : `Редакция правил: ${edition}`}
      />
      {overridden && (
        <button type="button" className="edition-reset" onClick={reset} title={`Вернуть разделу общую редакцию ${global}`}>
          <RotateCcw aria-hidden="true" />
          как везде
        </button>
      )}
    </div>
  )
}

/** Карта версий записи: null — ещё грузится или сервер её не отдаёт */
function useEditionsMap(resource: string, id: string | undefined): { map: EditionsMap | null; loaded: boolean } {
  const [state, setState] = useState<{ key: string; map: EditionsMap | null } | null>(null)
  const key = id ? `${resource}:${id}` : ''
  useEffect(() => {
    if (!id) return
    let alive = true
    getEditions(resource, id).then((map) => alive && setState({ key: `${resource}:${id}`, map }))
    return () => {
      alive = false
    }
  }, [resource, id])
  const fresh = state?.key === key
  return { map: fresh ? state.map : null, loaded: fresh }
}

/**
 * Редакция записи: какую показываем и как переключить. `wanted` — ?ed= из
 * адреса или редакция раздела. Если запись не той редакции, а нужная версия
 * есть, страница сама переходит на неё (заменой адреса, без лишнего шага
 * в истории) — так смена общей редакции меняет и открытую запись.
 */
function useElementEdition(
  resource: string,
  id: string | undefined,
  record: { editions?: readonly string[] | null } | null | undefined,
  opts: { follow?: boolean } = {},
) {
  const { edition: sectionEd } = useEdition(resource)
  const urlEd = useUrlEdition()
  const wanted = urlEd ?? sectionEd
  const { map, loaded } = useEditionsMap(resource, id)
  // поле editions из записи: пока записи нет — неизвестно (undefined)
  const recordEditions = record ? (record.editions ?? null) : undefined
  const plan = planElementEdition({
    id: id ?? '',
    map: loaded ? map : null,
    // пока карта грузится, не судим по полю — иначе переключатель мигнёт
    recordEditions: loaded ? recordEditions : undefined,
    wanted,
    follow: opts.follow,
  })
  return { ...plan, wanted, urlEd }
}

/**
 * Переключатель записи. Переход — на id версии другой редакции с ?ed=, так
 * ссылкой можно поделиться, а «Назад» вернёт прежнюю версию. `onSwitch`
 * заменяет переход (лента предметов держит выбор в своём состоянии).
 */
export function ElementEditionToggle({
  resource,
  id,
  record,
  onSwitch,
  className,
  dropParams,
}: {
  resource: string
  id: string | undefined
  record: { editions?: readonly string[] | null } | null | undefined
  onSwitch?: (targetId: string, edition: Edition) => void
  className?: string
  /** параметры адреса, относящиеся к прежней версии записи (?subclass= у класса) */
  dropParams?: readonly string[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const plan = useElementEdition(resource, id, record, { follow: !onSwitch })

  // запись не той редакции, а нужная версия есть — переходим на неё
  useEffect(() => {
    if (!id) return
    const to = editionRedirectHref(location, id, plan.redirectId, plan.urlEd)
    if (to) navigate(to, { replace: true, state: location.state })
  }, [id, plan.redirectId, plan.urlEd, location, navigate])

  if (!id) return null

  const change = (next: Edition) => {
    if (!plan.targetId) return
    if (onSwitch) onSwitch(plan.targetId, next)
    else navigate(editionHref(location, id, plan.targetId, next, dropParams), { state: location.state })
  }

  return (
    <span className={`element-edition${className ? ` ${className}` : ''}`}>
      <EditionToggle
        value={plan.shown}
        onChange={change}
        size="compact"
        busy={plan.pending}
        disabled={!plan.pending && !plan.canSwitch}
        reason={plan.reason}
        title={`Редакция правил: ${plan.shown} — этой записи`}
      />
    </span>
  )
}

/**
 * Подпись найденной записи другой редакции: «из редакции 2014» — мелким
 * красным курсивом. Обычный текст, поэтому читается и скринридером.
 */
export function OtherEditionNote({ edition, className }: { edition: Edition | null | undefined; className?: string }) {
  if (!edition) return null
  return <span className={`edition-note${className ? ` ${className}` : ''}`}>{otherEditionCaption(edition)}</span>
}
