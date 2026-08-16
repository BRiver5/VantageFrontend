import { Fragment, createContext, useContext, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Coins } from 'lucide-react'
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
        {/* карточка и её вложенное содержимое — одним блоком: в две колонки они
            иначе разъехались бы по разным ячейкам сетки */}
        {option.entries.map((e, i) => (
          <div className="se-entry" key={i}>
            <GrantEntryCard entry={e} index={index} />
            {e.contents.length > 0 && <EquipmentContents contents={e.contents} index={index} />}
          </div>
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
  columns = 1,
}: {
  grants: EquipmentGrant[] | null | undefined
  fallbackText?: string | null
  sourceText?: string | null
  /** подпись кнопки «назад» на странице снаряжения (напр. имя класса) */
  backLabel?: string
  /** 2 — фиксированную выдачу раскладываем в две колонки (предыстории) */
  columns?: 1 | 2
}) {
  const index = useEquipmentIndex()
  const hasGrants = !!grants && grants.length > 0

  if (!hasGrants) {
    const text = fallbackText ?? sourceText
    return text ? <RichText text={text} /> : null
  }

  return (
    <BackLabelContext.Provider value={backLabel}>
      <div className={`se-grants${columns === 2 ? ' se-grants--two' : ''}`}>
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

/** Первый вариант каждого гранта → плоский список записей для превью-ряда */
function flattenGrantEntries(grants: EquipmentGrant[] | null | undefined): GrantEntry[] {
  if (!grants?.length) return []
  return grants.flatMap((g) => g.options[0]?.entries ?? [])
}

function EquipmentIconTile({
  entry,
  index,
}: {
  entry: GrantEntry
  index: EquipmentIndex | null
}) {
  const [broken, setBroken] = useState(false)
  const [contentBroken, setContentBroken] = useState(false)
  const isChoice = !entry.slug
  const eq = entry.slug ? index?.bySlug.get(entry.slug) : undefined
  const src =
    realImage(entry.image_gallery) ??
    (eq ? realImage(eq.equipment_image_gallery) : null)
  const title = isChoice
    ? entryChoiceLabel(entry)
    : (eq?.equipment_name ?? entry.slug ?? '')
  const Icon = categoryIcon(eq?.category ?? entry.choose_from_categories[0])

  const content = entry.contents[0]
  const contentEq = content ? index?.bySlug.get(content.slug) : undefined
  const contentSrc =
    content
      ? realImage(content.image_gallery) ??
        (contentEq ? realImage(contentEq.equipment_image_gallery) : null)
      : null

  return (
    <span className="eq-icon" title={title}>
      {isChoice ? (
        <span className="eq-icon-face eq-icon-face--choice" aria-hidden="true">
          ?
        </span>
      ) : src && !broken ? (
        <img
          className="eq-icon-face"
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="eq-icon-face eq-icon-face--empty" aria-hidden="true">
          <Icon />
        </span>
      )}
      {content && (
        <span className="eq-icon-badge" title={contentEq?.equipment_name ?? content.slug}>
          {contentSrc && !contentBroken ? (
            <img
              src={contentSrc}
              alt=""
              loading="lazy"
              onError={() => setContentBroken(true)}
            />
          ) : (
            <Coins className="eq-icon-badge-fallback" aria-hidden="true" />
          )}
          <b>{content.quantity}</b>
        </span>
      )}
    </span>
  )
}

/**
 * Компактный ряд квадратиков стартового снаряжения (карточки предысторий).
 * Берём первый вариант каждого гранта; лишнее сворачиваем в «+N».
 */
export function EquipmentIconRow({
  grants,
  max = 6,
}: {
  grants: EquipmentGrant[] | null | undefined
  max?: number
}) {
  const index = useEquipmentIndex()
  const entries = flattenGrantEntries(grants)
  if (entries.length === 0) return null

  const shown = entries.slice(0, max)
  const rest = entries.length - shown.length

  return (
    <div className="eq-icon-row" aria-hidden={false}>
      {shown.map((e, i) => (
        <EquipmentIconTile key={`${e.slug ?? 'choice'}-${i}`} entry={e} index={index} />
      ))}
      {rest > 0 && <span className="eq-icon eq-icon--more">+{rest}</span>}
    </div>
  )
}
