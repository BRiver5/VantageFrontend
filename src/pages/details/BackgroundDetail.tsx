import { useContext, useMemo, useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Award,
  Dumbbell,
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
import { SourceBadge } from '../catalog/shared'
import {
  StartingEquipment,
  hasStartingEquipment,
} from '../StartingEquipment'
import { AbilityList } from '../../abilities/AbilityList'
import { ClassArticle, OpenLinksInNewTab } from '../../classArticle'
import { isHtmlDescription } from '../../classArticleHtml'
import { ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT } from '../../types/character'
import type { AbilityName } from '../../types/character'
import { abilitiesFromSkills, skillKeysFromNames } from '../../skills'
import { findEntity } from '../../dndsuLinks'
import { splitBackgroundText } from './backgroundText'
import { Img, bgUrl } from '../../media'
import { DetailSection, MobileFold, Rich, DetailTopline } from './shared'
import { ElementEditionToggle } from '../../editions/EditionControls'
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

/** Значение плитки: просто текст, ссылка (навык → термин) или действие (черта → её карточка) */
type FactValue = string | { label: string; to?: string; onClick?: () => void; hint?: string }

/** Плитка «навыки / инструменты / языки» со списком плашек внутри */
function BackgroundFact({
  icon: Icon,
  label,
  values,
}: {
  icon: LucideIcon
  label: string
  values: FactValue[] | null | undefined
}) {
  if (!values || values.length === 0) return null
  return (
    <div className="bg-fact">
      <span className="bg-fact-head">
        <span className="bg-fact-icon"><Icon aria-hidden="true" /></span>
        {label}
      </span>
      <div className="bg-fact-values">
        {values.map((v) => {
          if (typeof v === 'string') return <span className="bg-fact-value" key={v}>{v}</span>
          if (v.to)
            return (
              <Link className="bg-fact-value is-link" key={v.label} to={v.to} title={v.hint}>
                {v.label}
              </Link>
            )
          return (
            <button type="button" className="bg-fact-value is-link" key={v.label} onClick={v.onClick} title={v.hint}>
              {v.label}
            </button>
          )
        })}
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
      <DetailTopline edition={<ElementEditionToggle resource="backgrounds" id={bg.id} record={bg} />}>
        <Link to="/backgrounds" className="back-link">
          <ArrowLeft aria-hidden="true" /> к предысториям
        </Link>
      </DetailTopline>
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
  const navigate = useNavigate()
  const newTab = useContext(OpenLinksInNewTab) || embedded
  // 2024: три характеристики предыстории; 2014 — те, к которым тянутся навыки
  const abilities = useMemo<AbilityName[]>(() => {
    const own = (bg.ability_score_options ?? [])
      .map((k) => ABILITY_KEYS.find((a) => ABILITY_SHORT[a] === k))
      .filter((a): a is AbilityName => !!a)
    return own.length ? own : abilitiesFromSkills(bg.skill_proficiencies)
  }, [bg.ability_score_options, bg.skill_proficiencies])
  // описание 2024: строки-параметры сверху уходят в плитки, в тексте — только рассказ
  const text = useMemo(() => splitBackgroundText(isHtmlDescription(bg.description) ? null : bg.description), [bg.description])
  const go = (to: string) => (newTab ? window.open(to, '_blank', 'noopener') : navigate(to))
  const skillValues: FactValue[] = (bg.skill_proficiencies ?? []).map((name) => {
    const key = skillKeysFromNames([name])[0]
    return key ? { label: name, to: `/terms/${key.replace(/_/g, '-')}`, hint: 'Что даёт навык' } : name
  })
  const feats = bg.origin_feats?.length
    ? bg.origin_feats.map((f) => ({ name: f.name, note: f.note ?? null }))
    : text.header['Черта']
      ? [{ name: text.header['Черта'].replace(/\s*\(.*\)\s*$/, ''), note: /\(([^)]+)\)/.exec(text.header['Черта'])?.[1] ?? null }]
      : []
  const featValues: FactValue[] = feats.map((f) => ({
    label: f.note ? `${f.name} (${f.note})` : f.name,
    hint: 'Открыть черту',
    onClick: () => void findEntity('feats', f.name).then((id) => go(id ? `/feats/${id}` : '/feats')),
  }))
  const abilityValues: FactValue[] = (bg.ability_score_options?.length ? abilities : []).map((a) => ({
    label: ABILITY_LABELS[a].label,
    to: `/terms/${a}`,
    hint: 'Характеристика',
  }))
  const patterns = (bg.ability_score_patterns ?? []).map((p) => p.map((n) => `+${n}`).join(' / ')).join(' или ')

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
        <BackgroundFact icon={Dumbbell} label={patterns ? `Характеристики · ${patterns}` : 'Характеристики'} values={abilityValues} />
        <BackgroundFact icon={Award} label="Черта" values={featValues} />
        <BackgroundFact icon={Star} label="Навыки" values={skillValues} />
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
        <MobileFold title="Особенности">
          <AbilityList refs={bg.abilities} />
        </MobileFold>
      )}

      {descHtml ? (
        // размеченное описание с dnd.su (таблицы, черты предыстории, списки)
        <section className="detail-section">
          <ClassArticle html={descHtml} cutSubclasses={false} backLabel={bg.background_name} />
        </section>
      ) : (
        text.lore && (
          <MobileFold title="Описание">
            <Rich text={text.lore} />
          </MobileFold>
        )
      )}
    </OpenLinksInNewTab.Provider>
  )
}
