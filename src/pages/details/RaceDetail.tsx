import { useEffect, useMemo, useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Feather,
  Footprints,
  Hourglass,
  Landmark,
  Languages,
  Mountain,
  Ruler,
  Star,
  Users,
  VenetianMask,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  getSubraces,
  isFramedArt,
  realImage,
  sizeRu,
  creatureTypeRu,
} from '../../api'
import type {
  Race,
  Subrace,
} from '../../api'
import { Divider } from '../../ornaments'
import { SourceBadge } from '../catalog/shared'
import { TermDesc } from '../../terms/terms'
import { AbilitiesMissingFrom } from '../../abilities/AbilityList'
import { RaceBoosts, boostInfo } from '../../raceBoosts'
import { ClassArticle, OpenLinksInNewTab } from '../../classArticle'
import { isHtmlDescription } from '../../classArticleHtml'
import { WorldBackdrop } from '../../creature/CreatureStage'
import { useBookWorld, type BookWorld } from '../../worldArt'
import { splitRaceArticle } from '../../raceArticle'
import { Img } from '../../media'
import { Chip, DetailSection, DetailShell, Rich } from './shared'
import { useBookRef, useOne } from './hooks'

function RaceDetailPortrait({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  const framed = isFramedArt(src)
  return (
    <div className={`class-detail-portrait race-detail-portrait${framed ? ' is-framed' : ''}`}>
      {src && !broken ? (
        <Img
          src={src}
          alt={alt}
          style={{ viewTransitionName: 'class-hero-img' } as CSSProperties}
          onError={() => setBroken(true)}
        />
      ) : (
        <VenetianMask className="class-detail-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

/** Прибавки характеристик расы — золотые жетоны «ЛОВ +2» */
/** Плитка факта о расе: гекс с иконкой, подпись и значение */
function RaceFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="race-fact">
      <span className="race-fact-icon"><Icon aria-hidden="true" /></span>
      <span className="race-fact-body">
        <i>{label}</i>
        <b>{value}</b>
      </span>
    </div>
  )
}

/**
 * Тело страницы расы: герой с портретом, факты, языки, описание и подрасы.
 * Его же показывает попап выбора расы в конструкторе персонажа — поэтому
 * `embedded` убирает переходы и список подрас: ветвь выбирается следующим шагом.
 */
export function RaceDetailBody({
  race: r,
  world,
  embedded = false,
}: {
  race: Race
  world: BookWorld | null
  embedded?: boolean
}) {
  const book = useBookRef(r.book_source_id)
  const [subraces, setSubraces] = useState<Subrace[]>([])

  useEffect(() => {
    setSubraces([])
    getSubraces(r.id).then(setSubraces).catch(() => {})
  }, [r.id])
  // тексты подрас из статьи — на их карточках, в статье расы они только мешают
  const article = useMemo(
    () => (isHtmlDescription(r.description) ? splitRaceArticle(r.description!, r.race_name, subraces).race : null),
    [r.description, r.race_name, subraces],
  )

  return (
    <OpenLinksInNewTab.Provider value={embedded}>
      <header className="race-detail-hero">
        <div className="race-detail-stage">
          <div className="race-detail-aura" aria-hidden="true" />
          <div className="race-detail-ring" aria-hidden="true" />
          <RaceDetailPortrait src={realImage(r.image_gallery)} alt={r.race_name} />

          <div className="class-detail-meta race-detail-meta">
            <h1
              className="class-detail-name-plate race-detail-name-plate"
              style={embedded ? undefined : ({ viewTransitionName: 'class-hero-title' } as CSSProperties)}
            >
              {r.race_name}
            </h1>
            <div className="race-detail-tags">
              <span className="race-detail-kind">
                {r.race_type ? `Вид: ${creatureTypeRu(r.race_type)}` : 'раса'}
              </span>
              <SourceBadge book={book} />
              {world?.id &&
                (embedded ? (
                  <span className="chip">
                    <Landmark aria-hidden="true" /> {world.name}
                  </span>
                ) : (
                  <Link to={`/settings/${world.id}`} className="chip chip--link">
                    <Landmark aria-hidden="true" /> {world.name}
                  </Link>
                ))}
            </div>
            <RaceBoosts info={boostInfo(r, subraces.length > 0)} className="race-detail-boosts" />
          </div>
        </div>
      </header>

      <Divider />

      <div className="race-facts">
        <RaceFact icon={Ruler} label="Размер" value={sizeRu(r.size)} />
        <RaceFact icon={Footprints} label="Скорость" value={`${r.speed} фт.`} />
        <RaceFact icon={Eye} label="Тёмное зрение" value={r.darkvision > 0 ? `${r.darkvision} фт.` : 'нет'} />
        <RaceFact icon={Feather} label="Полёт" value={r.flight_speed > 0 ? `${r.flight_speed} фт.` : null} />
        <RaceFact icon={Waves} label="Плавание" value={r.swimming_speed > 0 ? `${r.swimming_speed} фт.` : null} />
        <RaceFact icon={Mountain} label="Лазание" value={r.climbing_speed > 0 ? `${r.climbing_speed} фт.` : null} />
        <RaceFact icon={Hourglass} label="Зрелость" value={r.age_of_adulthood ? `${r.age_of_adulthood} лет` : null} />
        <RaceFact icon={Hourglass} label="Живут до" value={r.max_age ? `${r.max_age} лет` : null} />
      </div>

      {r.languages && r.languages.length > 0 && (
        <div className="race-langs">
          <span className="race-langs-label">
            <Languages aria-hidden="true" /> Языки
          </span>
          <div className="card-chips">
            {r.languages.map((l) => <Chip key={l} icon={Users}>{l}</Chip>)}
          </div>
        </div>
      )}

      {article !== null ? (
        // размеченное описание с dnd.su (таблицы, отдельные способности, языки)
        <section className="detail-section">
          <ClassArticle html={article} cutSubclasses={false} backLabel={r.race_name} />
        </section>
      ) : (
        <DetailSection title="Описание">
          <Rich text={r.description} />
        </DetailSection>
      )}

<AbilitiesMissingFrom
  refs={r.abilities}
  text={article ?? r.description ?? ''}
  render={(list) => <DetailSection title="Способности и механика">{list}</DetailSection>}
/>

      {!embedded && subraces.length > 0 && (
        <DetailSection title={`Подрасы — ${subraces.length}`}>
          <div className="subrace-grid">
            {subraces.map((sr) => {
              const body = (
                <>
                  <span className="subrace-card-name">{sr.subrace_name}</span>
                  <RaceBoosts info={boostInfo(sr)} />
                  {(sr.darkvision_override != null || sr.speed_bonus > 0) && (
                    <div className="card-chips">
                      {sr.speed_bonus > 0 && <Chip icon={Footprints}>скорость +{sr.speed_bonus} фт.</Chip>}
                      {sr.darkvision_override != null && <Chip icon={Eye}>тьма {sr.darkvision_override} фт.</Chip>}
                    </div>
                  )}
                  <TermDesc text={sr.traits ?? sr.description} className="card-desc subrace-card-desc" />
                </>
              )
              // в конструкторе подраса выбирается следующим шагом — без перехода
              return embedded ? (
                <div key={sr.id} className="subrace-card">
                  {body}
                </div>
              ) : (
                <Link key={sr.id} to={`/subraces/${sr.id}`} className="subrace-card">
                  {body}
                  <span className="subrace-card-go">
                    подробнее <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              )
            })}
          </div>
        </DetailSection>
      )}
    </OpenLinksInNewTab.Provider>
  )
}

export function RaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: r, error } = useOne<Race>('races', id)
  // фоном — арт мира, в книге которого раса появилась
  const world = useBookWorld(r?.book_source_id)

  if (error) return <p className="status-line is-error">Раса не найдена: {error}</p>
  if (!r) return <p className="status-line">Изучаем родословные…</p>

  return (
    <section className={`book-page race-detail-page${world ? ' has-world' : ''}`}>
      {world && <WorldBackdrop art={world.art} />}
      <Link to="/races" className="back-link">
        <ArrowLeft aria-hidden="true" /> к расам
      </Link>
      <RaceDetailBody race={r} world={world} />
      <ReviewsPanel entity="races" id={r.id} />
    </section>
  )
}

/**
 * Плоский текст подрасы с бэка идёт как «Название . описание» на каждой строке.
 * Оборачиваем ярлык-название в **жирный**, чтобы RichText отрисовал его как
 * <strong> и разбил на абзацы — черты становятся опрятными, как у рас/классов.
 */
function structureTraitText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .split(/\n+/)
    .map((raw) => {
      const line = raw.trim()
      if (!line) return ''
      // «Ярлык . описание» → «**Ярлык.** описание» (ярлык короткий, без . ! ?)
      const m = line.match(/^([А-ЯЁA-Z][^.!?]{1,50}?)\s\.\s(.+)$/u)
      return m ? `**${m[1].trim()}.** ${m[2].trim()}` : line
    })
    .filter(Boolean)
    .join('\n')
}

export function SubraceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: sr, error } = useOne<Subrace>('subraces', id)
  const book = useBookRef(sr?.book_source_id)
  const { data: parent } = useOne<Race>('races', sr?.parent_race_id)
  const article = useMemo(
    () =>
      sr && parent && isHtmlDescription(parent.description)
        ? (splitRaceArticle(parent.description!, parent.race_name, [sr]).bySubrace.get(sr.id) ?? null)
        : null,
    [sr, parent],
  )
  if (error) return <p className="status-line is-error">Подраса не найдена: {error}</p>
  if (!sr) return <p className="status-line">Изучаем родословную…</p>

  const abilities = Object.entries(sr.increase_ability_scores ?? {})
    .map(([k, v]) => `${ABILITY_RU[k] ?? k} +${v}`)
    .join(', ')
  const speeds = [
    sr.speed_bonus ? `скорость +${sr.speed_bonus} фт.` : null,
    sr.flight_speed > 0 && `полёт ${sr.flight_speed} фт.`,
    sr.swimming_speed > 0 && `плавание ${sr.swimming_speed} фт.`,
    sr.climbing_speed > 0 && `лазание ${sr.climbing_speed} фт.`,
  ].filter(Boolean).join(', ')
  const showTraits = sr.traits && sr.traits !== sr.description

  return (
    <DetailShell
      reviews={{ entity: 'subraces', id: sr.id }}
      backTo={`/races/${sr.parent_race_id}`}
      backLabel={parent ? `к расе «${parent.race_name}»` : 'к расе'}
      kicker="подраса"
      title={sr.subrace_name}
      image={null}
      imageIcon={Users}
      chips={
        <>
          <SourceBadge book={book} />
          {abilities && <Chip icon={Star}>{abilities}</Chip>}
          {sr.darkvision_override != null && <Chip icon={Eye}>тёмное зрение {sr.darkvision_override} фт.</Chip>}
          {speeds && <Chip icon={Footprints}>{speeds}</Chip>}
        </>
      }
    >
      <AbilitiesMissingFrom
  refs={sr.abilities}
  text={`${article ?? ''} ${sr.description ?? ''} ${sr.traits ?? ''}`}
  render={(list) => <DetailSection title="Способности и механика">{list}</DetailSection>}
/>
      {article && (
        <section className="detail-section">
          <ClassArticle html={article} cutSubclasses={false} backLabel={sr.subrace_name} />
        </section>
      )}
      {sr.description && (
        <DetailSection title="Описание">
          <Rich text={structureTraitText(sr.description)} />
        </DetailSection>
      )}
      {showTraits && (
        <DetailSection title="Черты">
          <Rich text={structureTraitText(sr.traits)} />
        </DetailSection>
      )}
      {sr.extra_languages && sr.extra_languages.length > 0 && (
        <DetailSection title="Дополнительные языки">
          <div className="card-chips">
            {sr.extra_languages.map((l) => <Chip key={l} icon={Users}>{l}</Chip>)}
          </div>
        </DetailSection>
      )}
    </DetailShell>
  )
}
