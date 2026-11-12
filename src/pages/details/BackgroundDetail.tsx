import { useMemo, useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Landmark,
  Shield,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  realImage,
} from '../../api'
import type {
  Background,
} from '../../api'
import { Corners, Divider } from '../../ornaments'
import { SourceBadge } from '../CatalogPage'
import {
  StartingEquipment,
  hasStartingEquipment,
} from '../StartingEquipment'
import { AbilityList } from '../../abilities/AbilityList'
import { ClassArticle, OpenLinksInNewTab, isHtmlDescription } from '../../classArticle'
import { ABILITY_LABELS } from '../../types/character'
import { abilitiesFromSkills } from '../../skills'
import { Img, bgUrl } from '../../media'
import { DetailSection, MobileFold, Rich } from './shared'
import { useBookRef, useOne } from './hooks'

/** Текст без разметки — для сравнения фрагментов описаний между собой */
function plainText(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** «ПО МНОГОЧИСЛЕННЫМ ПРОСЬБАМ» → «По многочисленным просьбам» */
function unshout(text: string): string {
  const letters = text.match(/\p{L}/gu) ?? []
  const allCaps =
    letters.length > 1 &&
    letters.every((c) => c === c.toLocaleUpperCase('ru') && c !== c.toLocaleLowerCase('ru'))
  if (!allCaps) return text
  return text.toLocaleLowerCase('ru').replace(/\p{L}/u, (c) => c.toLocaleUpperCase('ru'))
}

/** Плитка «навыки / инструменты / языки» со списком плашек внутри */
function BackgroundFact({
  icon: Icon,
  label,
  values,
}: {
  icon: LucideIcon
  label: string
  values: string[] | null | undefined
}) {
  if (!values || values.length === 0) return null
  return (
    <div className="bg-fact">
      <span className="bg-fact-head">
        <span className="bg-fact-icon"><Icon aria-hidden="true" /></span>
        {label}
      </span>
      <div className="bg-fact-values">
        {values.map((v) => (
          <span className="bg-fact-value" key={v}>{v}</span>
        ))}
      </div>
    </div>
  )
}

/** Гекс шапки: арт сущности или иконка-запасной вариант */
export function HeroHexArt({
  src,
  alt,
  fallback: Fallback,
}: {
  src: string | null
  alt: string
  fallback: LucideIcon
}) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="bg-hero-hex">
      <span className="bg-hero-hex-inner">
        {src && !broken ? (
          <Img src={src} alt={alt} onError={() => setBroken(true)} />
        ) : (
          <Fallback className="bg-hero-hex-fallback" aria-hidden="true" />
        )}
      </span>
    </span>
  )
}

export function BackgroundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: bg, error } = useOne<Background>('backgrounds', id)
  if (error) return <p className="status-line is-error">Предыстория не найдена: {error}</p>
  if (!bg) return <p className="status-line">Листаем летопись…</p>

  return (
    <section className="book-page bg-detail-page">
      <Link to="/backgrounds" className="back-link">
        <ArrowLeft aria-hidden="true" /> к предысториям
      </Link>
      <BackgroundDetailBody bg={bg} />
      <ReviewsPanel entity="backgrounds" id={bg.id} />
    </section>
  )
}

/**
 * Тело страницы предыстории: шапка, плашки владений, умение, снаряжение и
 * описание. Его же показывает попап выбора предыстории в конструкторе —
 * там `embedded` открывает ссылки (заклинания и т.п.) в новой вкладке.
 */
export function BackgroundDetailBody({ bg, embedded = false }: { bg: Background; embedded?: boolean }) {
  const book = useBookRef(bg.book_source_id)
  const abilities = useMemo(() => abilitiesFromSkills(bg.skill_proficiencies), [bg.skill_proficiencies])

  const featureHtml = isHtmlDescription(bg.feature_description) ? bg.feature_description! : null
  const descHtml = isHtmlDescription(bg.description) ? bg.description! : null
  const art = realImage(bg.image_gallery)
  // умение иногда уже вложено в общее описание с dnd.su — сверяем по началу текста
  // умения, а не по названию: название часто просто упоминается в описании
  const featurePlain = plainText(bg.feature_description)
  const showFeature =
    featurePlain.length > 0 && !plainText(bg.description).includes(featurePlain.slice(0, 60))

  return (
    <OpenLinksInNewTab.Provider value={embedded}>
      <header className="bg-hero">
        {/* тот же арт размытым фоном — шапка перестаёт быть пустой справа */}
        {art && <span className="bg-hero-bg" style={{ backgroundImage: `url("${bgUrl(art)}")` }} aria-hidden="true" />}
        <span className="bg-hero-aura" aria-hidden="true" />
        <Corners size={40} />
        <div className="bg-hero-art">
          <HeroHexArt src={art} alt={bg.background_name} fallback={Landmark} />
        </div>
        <div className="bg-hero-meta">
          <div className="bg-hero-kicker">
            <span className="setting-kicker">предыстория</span>
            <SourceBadge book={book} />
          </div>
          <h1 className="book-title gold-text bg-hero-title">{bg.background_name}</h1>
          {abilities.length > 0 && (
            <div className="bg-hero-abilities" title="Характеристики, к которым тянутся навыки предыстории">
              {abilities.map((a) => (
                <span className="bg-ability" key={a}>
                  <b>{ABILITY_LABELS[a].abbr}</b>
                  <i>{ABILITY_LABELS[a].label}</i>
                </span>
              ))}
            </div>
          )}
          {bg.feature_name && (
            <div className="bg-hero-feature">
              <Sparkles aria-hidden="true" />
              <span>черта предыстории</span>
              <b>{unshout(bg.feature_name)}</b>
            </div>
          )}
        </div>
      </header>

      <div className="bg-facts">
        <BackgroundFact icon={Star} label="Навыки" values={bg.skill_proficiencies} />
        <BackgroundFact icon={Shield} label="Инструменты" values={bg.tool_proficiencies} />
        <BackgroundFact icon={Users} label="Языки" values={bg.languages} />
      </div>

      <Divider />

      {showFeature && (
        <DetailSection title={bg.feature_name ? unshout(bg.feature_name) : 'Умение предыстории'}>
          {featureHtml ? (
            <ClassArticle html={featureHtml} cutSubclasses={false} backLabel={bg.background_name} />
          ) : (
            <Rich text={bg.feature_description} />
          )}
        </DetailSection>
      )}

      {hasStartingEquipment(bg.starting_equipment, bg.equipment) && (
        <MobileFold title="Снаряжение">
          <StartingEquipment
            grants={bg.starting_equipment}
            fallbackText={bg.equipment}
            backLabel={bg.background_name}
            columns={2}
          />
        </MobileFold>
      )}

      {!bg.description && (bg.abilities?.length ?? 0) > 0 && (
        <MobileFold title="Способности и механика">
          <AbilityList refs={bg.abilities} />
        </MobileFold>
      )}

      {descHtml ? (
        // размеченное описание с dnd.su (таблицы, черты предыстории, списки)
        <section className="detail-section">
          <ClassArticle html={descHtml} cutSubclasses={false} backLabel={bg.background_name} />
        </section>
      ) : (
        bg.description && (
          <MobileFold title="Описание">
            <Rich text={bg.description} />
          </MobileFold>
        )
      )}
    </OpenLinksInNewTab.Provider>
  )
}
