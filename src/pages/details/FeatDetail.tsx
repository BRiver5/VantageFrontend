import { ReviewsPanel } from '../../reviews/Reviews'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Award,
  Shield,
} from 'lucide-react'
import {
  ABILITY_RU,
  realImage,
} from '../../api'
import type {
  Feat,
} from '../../api'
import { Corners, Divider } from '../../ornaments'
import { SourceBadge } from '../catalog/shared'
import { AbilityList } from '../../abilities/AbilityList'
import { ClassArticle, OpenLinksInNewTab } from '../../classArticle'
import { isHtmlDescription } from '../../classArticleHtml'
import { ABILITY_LABELS } from '../../types/character'
import { bgUrl } from '../../media'
import { DetailSection, Rich } from './shared'
import { useBookRef, useOne } from './hooks'
import { HeroHexArt } from './BackgroundDetail'

export function FeatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: f, error } = useOne<Feat>('feats', id)
  if (error) return <p className="status-line is-error">Черта не найдена: {error}</p>
  if (!f) return <p className="status-line">Листаем свод дарований…</p>

  return (
    <section className="book-page bg-detail-page">
      <Link to="/feats" className="back-link">
        <ArrowLeft aria-hidden="true" /> к чертам
      </Link>
      <FeatDetailBody f={f} />
      <ReviewsPanel entity="feats" id={f.id} />
    </section>
  )
}

/**
 * Тело страницы черты: шапка с артом, прибавками и требованием и описание.
 * Его же показывает окно выбора черты в конструкторе — там `embedded`
 * открывает ссылки (заклинания и т.п.) в новой вкладке.
 */
export function FeatDetailBody({ f, embedded = false }: { f: Feat; embedded?: boolean }) {
  const book = useBookRef(f.book_source_id)

  const abilityEntries = Object.entries(f.increase_ability_scores ?? {})
  const descHtml = isHtmlDescription(f.description) ? f.description! : null
  const art = realImage(f.image_gallery)

  return (
    <OpenLinksInNewTab.Provider value={embedded}>
      <header className="bg-hero">
        {art && <span className="bg-hero-bg" style={{ backgroundImage: `url("${bgUrl(art)}")` }} aria-hidden="true" />}
        <span className="bg-hero-aura" aria-hidden="true" />
        <Corners size={40} />
        <div className="bg-hero-art">
          <HeroHexArt src={art} alt={f.feat_name} fallback={Award} />
        </div>
        <div className="bg-hero-meta">
          <div className="bg-hero-kicker">
            <span className="setting-kicker">черта</span>
            <SourceBadge book={book} />
          </div>
          <h1 className="book-title gold-text bg-hero-title">{f.feat_name}</h1>
          {abilityEntries.length > 0 && (
            <div className="bg-hero-abilities" title="Характеристики, которые повышает черта">
              {abilityEntries.map(([k, v]) => {
                const meta = ABILITY_LABELS[k as keyof typeof ABILITY_LABELS]
                return (
                  <span className="bg-ability" key={k}>
                    <b>{meta?.abbr ?? ABILITY_RU[k] ?? k}</b>
                    <i className="feat-boost">+{v}</i>
                  </span>
                )
              })}
            </div>
          )}
          {f.prerequisite && (
            <div className="bg-hero-feature">
              <Shield aria-hidden="true" />
              <span>требование</span>
              <b>{f.prerequisite}</b>
            </div>
          )}
        </div>
      </header>

      <Divider />

      {!f.description && (f.abilities?.length ?? 0) > 0 && (
        <DetailSection title="Способности и механика">
          <AbilityList refs={f.abilities} />
        </DetailSection>
      )}

      {descHtml ? (
        // размеченное описание с dnd.su (таблицы, списки, секции)
        <section className="detail-section">
          <ClassArticle html={descHtml} cutSubclasses={false} backLabel={f.feat_name} />
        </section>
      ) : (
        f.description && (
          <DetailSection title="Описание">
            <Rich text={f.description} />
          </DetailSection>
        )
      )}
    </OpenLinksInNewTab.Provider>
  )
}
