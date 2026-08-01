import { Fragment, createContext, useContext, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { descriptionPreview, getEquipmentIndex, realImage } from '../api'
import type { ContentEntry, Equipment, EquipmentGrant, EquipmentIndex, GrantEntry, GrantOption } from '../api'
import { categoryIcon, entryCatalogQuery, entryChoiceLabel, formatCost } from '../equipment'
import { RichText } from '../terms/terms'

/** Куда вернуться со страницы снаряжения (напр. на страницу класса), + подпись. */
const BackLabelContext = createContext<string | undefined>(undefined)

/** state для ссылок на снаряжение: откуда пришли + подпись кнопки «назад». */
function useEquipBackState(): { from: string; fromLabel: string | undefined } | undefined {
  const label = useContext(BackLabelContext)
  const location = useLocation()
  if (!label) return undefined
  return { from: location.pathname + location.search, fromLabel: label }
}

/**
 * Каталог снаряжения с индексом по slug. Гранты ссылаются на предметы только по
 * slug, а деталь открывается по uuid — без индекса не построить ни имя, ни
 * ссылку. Запрос синглтонный, так что второй и последующие вызовы бесплатны.
 */
export function useEquipmentIndex(): EquipmentIndex | null {
  const [index, setIndex] = useState<EquipmentIndex | null>(null)
  useEffect(() => {
    let alive = true
    getEquipmentIndex()
      .then((i) => {
        if (alive) setIndex(i)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return index
}

function EquipmentThumb({ eq }: { eq: Equipment | undefined }) {
  const [broken, setBroken] = useState(false)
  const src = eq ? realImage(eq.equipment_image_gallery) : null
  const Icon = categoryIcon(eq?.category)

  if (src && !broken) {
    return (
      <img
        className="se-card-thumb"
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span className="se-card-thumb se-card-thumb--empty">
      <Icon aria-hidden="true" />
    </span>
  )
}

/** Горизонтальная табличка предмета: картинка, имя, цена, начало описания. */
function EquipmentItemCard({
  slug,
  index,
  quantity,
}: {
  slug: string
  index: EquipmentIndex | null
  quantity?: number
}) {
  const eq = index?.bySlug.get(slug)
  const cost = eq ? formatCost(eq.cost, eq.cost_copper) : null
  const preview = eq ? descriptionPreview(eq.description, 140) : ''
  const href = eq ? `/equipment/${eq.id}` : undefined
  const backState = useEquipBackState()

  const body = (
    <>
      <EquipmentThumb eq={eq} />
      <div className="se-card-body">
        <div className="se-card-title-row">
          {eq ? (
            <span className="se-card-title">{eq.equipment_name}</span>
          ) : (
            <span className="se-name is-loading" title={slug} />
          )}
          {quantity != null && quantity > 1 && <span className="se-qty">× {quantity}</span>}
        </div>
        {cost && <span className="se-card-meta">{cost}</span>}
        {preview && <p className="se-card-desc">{preview}</p>}
      </div>
    </>
  )

  if (href) {
    return (
      <Link to={href} state={backState} className="se-card">
        {body}
      </Link>
    )
  }
  return <div className="se-card se-card--pending">{body}</div>
}

/** Выбор из каталога: табличка с «?» и кнопкой выбрать. */
function EquipmentChoiceCard({ entry }: { entry: GrantEntry }) {
  const query = entryCatalogQuery(entry)
  const label = entryChoiceLabel(entry)

  return (
    <div className="se-card se-card--choice">
      <span className="se-card-thumb se-card-thumb--choice" aria-hidden="true">
        ?
      </span>
      <div className="se-card-body">
        <span className="se-card-title se-card-title--choice">{label}</span>
        {query && (
          <Link to={`/equipment?${query}`} className="se-hex-pick">
            выбрать
          </Link>
        )}
      </div>
    </div>
  )
}

function GrantEntryCard({ entry, index }: { entry: GrantEntry; index: EquipmentIndex | null }) {
  if (entry.slug) {
    return <EquipmentItemCard slug={entry.slug} index={index} quantity={entry.quantity} />
  }
  return <EquipmentChoiceCard entry={entry} />
}

/** Вложенное содержимое контейнера: монеты в кошеле, карта в футляре */
export function EquipmentContents({
  contents,
  index,
}: {
  contents: ContentEntry[]
  index: EquipmentIndex | null
}) {
  if (contents.length === 0) return null
  return (
    <ul className="se-contents">
      {contents.map((c) => (
        <li key={c.slug}>
          <EquipmentItemCard slug={c.slug} index={index} quantity={c.quantity} />
        </li>
      ))}
    </ul>
  )
}

/** Название предмета со ссылкой на деталь; пока каталог не загружен — заглушка */
export function EquipmentSlugLink({
  slug,
  index,
  quantity,
}: {
  slug: string
  index: EquipmentIndex | null
  quantity?: number
}) {
  const eq = index?.bySlug.get(slug)
  const qty = quantity != null && quantity > 1 ? <span className="se-qty">× {quantity}</span> : null
  const backState = useEquipBackState()
  return (
    <>
      {eq ? (
        <Link to={`/equipment/${eq.id}`} state={backState} className="se-name">
          {eq.equipment_name}
        </Link>
      ) : (
        <span className="se-name is-loading" title={slug} />
      )}
      {qty}
    </>
  )
}

function GrantOptionCards({ option, index }: { option: GrantOption; index: EquipmentIndex | null }) {
  return (
    <div className="se-option-col">
      {option.marker && <span className="se-hex-marker">{option.marker}</span>}
      <div className="se-option-cards">
        {option.entries.map((e, i) => (
          <Fragment key={i}>
            <GrantEntryCard entry={e} index={index} />
            {e.contents.length > 0 && <EquipmentContents contents={e.contents} index={index} />}
          </Fragment>
        ))}
      </div>
      {option.note && <span className="se-note">{option.note}</span>}
    </div>
  )
}

function GrantBlock({ grant, index }: { grant: EquipmentGrant; index: EquipmentIndex | null }) {
  const isChoice = grant.options.length > 1
  return (
    <div className={`se-grant${isChoice ? ' is-choice' : ''}`}>
      {grant.label && <span className="se-grant-label">{grant.label}</span>}
      <div className={`se-card-row${isChoice ? ' se-card-row--choice' : ''}`}>
        {grant.options.map((op, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="se-or">или</span>}
            <GrantOptionCards option={op} index={index} />
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/**
 * Стартовое снаряжение класса или предыстории. У неразмеченных сущностей
 * `starting_equipment` пуст — тогда показываем исходный текст из книги, а не
 * пустоту. `sourceText` при наличии грантов остаётся сноской: там формулировки,
 * которых нет в структуре (например, «взять золото вместо снаряжения»).
 */
export function StartingEquipment({
  grants,
  fallbackText,
  sourceText,
  backLabel,
}: {
  grants: EquipmentGrant[] | null | undefined
  fallbackText?: string | null
  sourceText?: string | null
  /** подпись кнопки «назад» на странице снаряжения (напр. имя класса) */
  backLabel?: string
}) {
  const index = useEquipmentIndex()
  const hasGrants = !!grants && grants.length > 0

  if (!hasGrants) {
    const text = fallbackText ?? sourceText
    return text ? <RichText text={text} /> : null
  }

  return (
    <BackLabelContext.Provider value={backLabel}>
      <div className="se-grants">
        {grants!.map((g, i) => (
          <GrantBlock key={i} grant={g} index={index} />
        ))}
      </div>
      {sourceText && (
        <details className="se-source">
          <summary>Как написано в книге</summary>
          <RichText text={sourceText} />
        </details>
      )}
    </BackLabelContext.Provider>
  )
}

/** Есть ли что показывать в секции снаряжения */
export function hasStartingEquipment(
  grants: EquipmentGrant[] | null | undefined,
  ...texts: (string | null | undefined)[]
): boolean {
  return (!!grants && grants.length > 0) || texts.some(Boolean)
}
