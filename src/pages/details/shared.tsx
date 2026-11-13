import { isValidElement, useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import type { ReviewEntity } from '../../reviews/api'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  CreatureTrait,
} from '../../api'
import { Corners, Divider } from '../../ornaments'
import { RichText, highlightTerms, useTermIndex } from '../../terms/terms'
import { useAppShell } from '../../shell'
import { Img } from '../../media'

/** Лёгкая разметка описаний: абзацы + **жирный** / ***жирный*** + ссылки на термины */
export function Rich({ text }: { text: string | null | undefined }) {
  return <RichText text={text} />
}

export function Chip({ icon, children }: { icon: LucideIcon | ReactNode; children: ReactNode }) {
  // lucide-иконки — forwardRef-объекты (typeof === 'object'), поэтому различаем
  // готовый элемент и компонент через isValidElement, иначе объект уходит в дети
  // и React падает: «Objects are not valid as a React child».
  const Icon = icon as LucideIcon
  return (
    <span className="chip">
      {isValidElement(icon) ? icon : <Icon aria-hidden="true" />}
      {children}
    </span>
  )
}

export function DetailShell({
  backTo,
  backLabel,
  onBackClick,
  kicker,
  title,
  image,
  heroHex,
  heroHexName,
  imageIcon: ImageIcon,
  badge,
  chips,
  rarity,
  cornerGlow,
  plateOverlay,
  backdrop,
  heroDeco,
  bareCover,
  omitCover,
  heroNames,
  reviews,
  children,
}: {
  backTo: string
  backLabel: string
  /** перехват клика по «назад» — например, чтобы уйти с view-transition-морфом */
  onBackClick?: (e: ReactMouseEvent<HTMLAnchorElement>) => void
  kicker: string | null
  title: string
  image: string | null
  /** если задан — обложка рисуется шестиугольником (как сота), а не плашкой */
  heroHex?: string | null
  /** view-transition-name на обложке-шестиугольнике (морф из/в соту) */
  heroHexName?: string
  imageIcon: LucideIcon
  badge?: ReactNode
  chips: ReactNode
  /** ключ редкости — если задан, за артом предмета светится её цвет */
  rarity?: string
  /** серое свечение от углов плашки — для сущностей без редкости (снаряжение) */
  cornerGlow?: boolean
  /** оверлей поверх арта плашки (напр. превью вложенного содержимого в углу) */
  plateOverlay?: ReactNode
  /** декор за обложкой (напр. силуэт кости хитов у класса) */
  backdrop?: ReactNode
  /** водяной знак / декор панели героя (школа заклинания и т.п.) */
  heroDeco?: ReactNode
  /** обложка без бежевой пергаментной рамки (иконка школы и т.п.) */
  bareCover?: boolean
  /** скрыть слот обложки целиком (заклинания без арта) */
  omitCover?: boolean
  /** общие view-transition-name для морфа из карточки каталога (арт + заголовок) */
  heroNames?: { img?: string; title?: string }
  /** оценки и обсуждение под записью */
  reviews?: { entity: ReviewEntity; id: string }
  children: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  return (
    <section className="book-page">
      <Link to={backTo} className="back-link" onClick={onBackClick}>
        <ArrowLeft aria-hidden="true" /> {backLabel}
      </Link>
      <div className={`book-hero${heroDeco ? ' book-hero--deco' : ''}`}>
        {heroDeco}
        <Corners size={40} />
        {!omitCover && heroHex !== undefined ? (
          <div className="detail-hex">
            {heroHex && !broken ? (
              <Img
                className="detail-hex-cover"
                src={heroHex}
                alt={title}
                style={heroHexName ? ({ viewTransitionName: heroHexName } as CSSProperties) : undefined}
                onError={() => setBroken(true)}
              />
            ) : (
              <span className="detail-hex-fallback"><ImageIcon aria-hidden="true" /></span>
            )}
          </div>
        ) : null}
        {!omitCover && heroHex === undefined ? (
          <div
            className={
              bareCover
                ? 'detail-school-cover'
                : [
                    'book-cover detail-plate',
                    rarity ? 'detail-plate--glow' : '',
                    !rarity && cornerGlow ? 'detail-plate--corner-glow' : '',
                  ].filter(Boolean).join(' ')
            }
            data-rarity={!bareCover && rarity ? rarity : undefined}
          >
            {backdrop}
            {image && !broken ? (
              <Img
                src={image}
                alt={title}
                style={heroNames?.img ? ({ viewTransitionName: heroNames.img } as CSSProperties) : undefined}
                onError={() => setBroken(true)}
              />
            ) : (
              <ImageIcon className="detail-plate-fallback" aria-hidden="true" />
            )}
            {!bareCover && plateOverlay}
          </div>
        ) : null}
        <div className="book-meta">
          {kicker && <span className="setting-kicker">{kicker}</span>}
          <div className="detail-title-row">
            {badge}
            <h1
              className="book-title gold-text"
              style={heroNames?.title ? ({ viewTransitionName: heroNames.title } as CSSProperties) : undefined}
            >
              {title}
            </h1>
          </div>
          <div className="card-chips" style={{ marginTop: 14 }}>{chips}</div>
        </div>
      </div>
      <Divider />
      {children}
      {reviews && <ReviewsPanel entity={reviews.entity} id={reviews.id} />}
    </section>
  )
}

export function HexBadge({ value, label }: { value: string; label: string }) {
  return (
    <span className="hex-badge" title={label}>
      <span className="hex-badge-inner">
        <b>{value}</b>
        <i>{label}</i>
      </span>
    </span>
  )
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h2 className="detail-subtitle gold-text">{title}</h2>
      {children}
    </section>
  )
}

/** Пара «метка — значение» для строк статблока */
export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="stat-row">
      <span className="stat-row-label">{label}</span>
      <span className="stat-row-value">{value}</span>
    </div>
  )
}

/** Список черт/действий существа: пары «название — описание» */
export function Traits({ list }: { list: CreatureTrait[] | null | undefined }) {
  const index = useTermIndex()
  if (!list || list.length === 0) return null
  return (
    <div className="trait-list">
      {list.map((t, i) => {
        const name = (t.name ?? t.title ?? Object.values(t)[0] ?? '') as string
        const desc = (t.description ?? t.desc ?? Object.values(t)[1] ?? '') as string
        return (
          <div key={i} className="trait">
            <b>{name}.</b> {highlightTerms(desc, index, `trait-${i}-`)}
          </div>
        )
      })}
    </div>
  )
}

/** На телефоне раздел свёрнут до заголовка, на десктопе это обычная секция. */
export function MobileFold({ title, children }: { title: string; children: ReactNode }) {
  const { app } = useAppShell()
  if (!app) return <DetailSection title={title}>{children}</DetailSection>
  return (
    <details className="mobile-fold">
      <summary className="mobile-fold-head">{title}</summary>
      {children}
    </details>
  )
}
