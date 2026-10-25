import { isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Eye,
  Feather,
  Footprints,
  Gem,
  Hourglass,
  Landmark,
  Languages,
  Layers,
  Mountain,
  Package,
  Plus,
  Ruler,
  Scale,
  Shield,
  Sparkles,
  Star,
  Swords,
  Tag,
  Target,
  Users,
  VenetianMask,
  Waves,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  cacheEntity,
  formatCR,
  getCachedEntity,
  getOne,
  getSubList,
  getSubraces,
  cleanDescription,
  isFramedArt,
  realImage,
  sizeRu,
  creatureTypeRu,
  settingPictureUrl,
  splitTitle,
} from '../api'
import type {
  Book,
  ContainerProfile,
  Creature,
  CreatureTrait,
  Equipment,
  Feat,
  GameClass,
  Background,
  Item,
  Race,
  Setting,
  Spell,
  Subclass,
  Subrace,
  Termin,
} from '../api'
import { Corners, Divider } from '../ornaments'
import { SourceBadge, whenRouteCommitted } from './CatalogPage'
import { categoryIcon, containerKindRu, formatDice, formatWeight } from '../equipment'
import { PriceMark } from '../coins'
import {
  StartingEquipment,
  hasStartingEquipment,
  useEquipmentIndex,
} from './StartingEquipment'
import { EquipmentContentsGallery } from '../equipmentDrawer'
import { DIE_NUM_IMAGE_URLS, DieChipIcon, hitDieType } from '../dice/diceAssets'
import { RichText, TermDesc, highlightTerms, useTermIndex } from '../terms/terms'
import { AbilityList } from '../abilities/AbilityList'
import { parseClassTable, stripClassTable } from '../classTable'
import type { ClassTable } from '../classTable'
import { ClassArticle, OpenLinksInNewTab, isHtmlDescription, resolveSubclassSectionHtml, parseSubclassFeatures } from '../classArticle'
import { MulticlassButton } from '../multiclass'
import { ABILITY_LABELS } from '../types/character'
import { abilitiesFromSkills } from '../skills'
import { hasClassProficiencies, parseClassProficiencies } from '../classProficiencies'
import { SpellSchoolMark, spellSchoolIcon } from '../spellSchools'
import { CreatureBoard, CreatureStage, WorldBackdrop } from '../creatureSheet'
import { useBookWorld, type BookWorld } from '../worldArt'
import { splitRaceArticle } from '../raceArticle'

/* ---------- Общие детали ---------- */

/** Книга-источник записи, чтобы показать аббревиатуру с полным названием при наведении */
function useBookRef(sourceId: string | null | undefined) {
  const [book, setBook] = useState<Book | undefined>(undefined)
  useEffect(() => {
    setBook(undefined)
    if (!sourceId) return
    getOne<Book>('books', sourceId).then(setBook).catch(() => {})
  }, [sourceId])
  return book
}

function useOne<T>(resource: string, id: string | undefined) {
  // старт из кэша (объект уже загружен каталогом) — деталь рисуется мгновенно,
  // и переход-морф из карточки прилетает на готовый арт/заголовок, а не в загрузку
  const [data, setData] = useState<T | null>(() => getCachedEntity<T>(resource, id))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // без id показывать нечего: иначе на экране осталась бы прошлая запись
    // (снятый подкласс, подкласс прошлого класса и т.п.)
    if (!id) {
      setData(null)
      setError(null)
      return
    }
    setData(getCachedEntity<T>(resource, id))
    setError(null)
    getOne<T>(resource, id)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [resource, id])
  return { data, error }
}

/** Лёгкая разметка описаний: абзацы + **жирный** / ***жирный*** + ссылки на термины */
function Rich({ text }: { text: string | null | undefined }) {
  return <RichText text={text} />
}

/**
 * Кнопка «назад»: если на страницу пришли по ссылке из статьи (в location.state
 * лежит `from`/`fromLabel`) — ведём обратно именно туда, а не в общий каталог.
 */
function useContextualBack(
  defaultTo: string,
  defaultLabel: string,
): { backTo: string; backLabel: string } {
  const location = useLocation()
  const st = location.state as { from?: string; fromLabel?: string } | null
  if (st?.from) {
    return { backTo: st.from, backLabel: st.fromLabel ? `к «${st.fromLabel}»` : 'назад' }
  }
  return { backTo: defaultTo, backLabel: defaultLabel }
}

function Chip({ icon, children }: { icon: LucideIcon | ReactNode; children: ReactNode }) {
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

/** Общая «обложка» детальной страницы */
/** Русская редкость → ключ для цвета свечения (используется у предметов). */
const RARITY_KEY: Record<string, string> = {
  'обычный': 'common',
  'необычный': 'uncommon',
  'редкий': 'rare',
  'очень редкий': 'very-rare',
  'легендарный': 'legendary',
  'артефакт': 'artifact',
}
export function rarityKeyOf(r: string | null | undefined): string {
  return (r && RARITY_KEY[r.toLowerCase()]) || 'common'
}

function DetailShell({
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
              <img
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
              <img
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
    </section>
  )
}

function HexBadge({ value, label }: { value: string; label: string }) {
  return (
    <span className="hex-badge" title={label}>
      <span className="hex-badge-inner">
        <b>{value}</b>
        <i>{label}</i>
      </span>
    </span>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h2 className="detail-subtitle gold-text">{title}</h2>
      {children}
    </section>
  )
}

/** Пара «метка — значение» для строк статблока */
function StatRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="stat-row">
      <span className="stat-row-label">{label}</span>
      <span className="stat-row-value">{value}</span>
    </div>
  )
}

/** Список черт/действий существа: пары «название — описание» */
function Traits({ list }: { list: CreatureTrait[] | null | undefined }) {
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

/* ============================================================
   ЗАКЛИНАНИЕ
   ============================================================ */

export function SpellDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: s, error } = useOne<Spell>('spells', id)
  const book = useBookRef(s?.spell_source)
  const { backTo, backLabel } = useContextualBack('/spells', 'к гримуару')
  if (error) return <p className="status-line is-error">Заклинание не найдено: {error}</p>
  if (!s) return <p className="status-line">Разворачиваем свиток…</p>

  const comps = [
    s.components?.verbal && 'В',
    s.components?.somatic && 'С',
    s.components?.material && 'М',
  ].filter(Boolean).join(', ')

  const schoolSrc = spellSchoolIcon(s.school)

  return (
    <DetailShell
      backTo={backTo}
      backLabel={backLabel}
      kicker={s.school ? `школа: ${s.school}` : 'заклинание'}
      title={s.spell_name}
      image={schoolSrc}
      imageIcon={Sparkles}
      bareCover={!!schoolSrc}
      badge={<HexBadge value={s.spell_level === 0 ? '◈' : String(s.spell_level)} label={s.spell_level === 0 ? 'заговор' : 'круг'} />}
      heroDeco={schoolSrc ? <SpellSchoolMark school={s.school} /> : undefined}
      chips={
        <>
          <SourceBadge book={book} />
          {s.casting_time && <Chip icon={Hourglass}>{s.casting_time}</Chip>}
          {s.range && <Chip icon={Target}>{s.range}</Chip>}
          {s.duration && <Chip icon={Hourglass}>{s.duration}</Chip>}
          {comps && <Chip icon={Sparkles}>{comps}</Chip>}
          {s.concentration && <Chip icon={Eye}>концентрация</Chip>}
          {s.ritual && <Chip icon={Star}>ритуал</Chip>}
        </>
      }
    >
      {s.material_components && (
        <p className="detail-note">Материальные компоненты: {s.material_components}</p>
      )}
      <DetailSection title="Описание">
        <Rich text={s.description} />
        {s.higher_levels && <Rich text={s.higher_levels} />}
      </DetailSection>
      {(s.available_classes?.length || s.available_subclasses?.length || s.available_races?.length) ? (
        <DetailSection title="Кому доступно">
          <div className="card-chips">
            {s.available_classes?.map((c) => <Chip key={c} icon={Swords}>{c}</Chip>)}
            {s.available_subclasses?.map((c) => <Chip key={c} icon={Shield}>{c}</Chip>)}
            {s.available_races?.map((c) => <Chip key={c} icon={VenetianMask}>{c}</Chip>)}
          </div>
        </DetailSection>
      ) : null}
    </DetailShell>
  )
}

/* ============================================================
   СУЩЕСТВО — полный статблок
   ============================================================ */

/** Мир кампании книги — кроме «родного» для 5e Фаэруна, где живёт большинство существ */
function useCreatureWorld(book: Book | undefined) {
  const { data: setting } = useOne<Setting>('settings', book?.settings_id ?? undefined)
  if (!setting || setting.id !== book?.settings_id) return null
  const { ru, en } = splitTitle(setting.settings_title)
  if (en === 'Forgotten Realms') return null
  return { id: setting.id, name: ru, art: settingPictureUrl(setting, 1600, 720) }
}

export function CreatureDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: c, error } = useOne<Creature>('creatures', id)
  const book = useBookRef(c?.book_source_id)
  const world = useCreatureWorld(book)
  if (error) return <p className="status-line is-error">Существо не найдено: {error}</p>
  if (!c) return <p className="status-line">Выслеживаем существо…</p>

  const kind = [sizeRu(c.size) ?? c.size, creatureTypeRu(c.creature_type) ?? c.creature_type, c.alignment]
    .filter(Boolean)
    .join(' · ')
  const image = realImage(c.image_gallery) ?? realImage(c.image_url)

  return (
    <section className={`book-page beast-page${world ? ' has-world' : ''}`}>
      {world && <WorldBackdrop art={world.art} />}
      <Link to="/bestiary" className="back-link">
        <ArrowLeft aria-hidden="true" /> к бестиарию
      </Link>
      <CreatureStage
        c={c}
        image={image}
        kicker={kind || 'существо'}
        cr={formatCR(c.challenge_rating)}
        chips={
          <>
            <SourceBadge book={book} link />
            {world && (
              <Link to={`/settings/${world.id}`} className="chip chip--link">
                <Landmark aria-hidden="true" /> {world.name}
              </Link>
            )}
            {c.proficiency_bonus != null && <Chip icon={<DieChipIcon type={20} />}>бонус мастерства +{c.proficiency_bonus}</Chip>}
          </>
        }
      />
      <Divider />

      <CreatureBoard c={c} image={image} />

      {(c.description || c.creature_description) && (
        <DetailSection title="Описание">
          <Rich text={c.description ?? c.creature_description} />
        </DetailSection>
      )}
      {c.features?.length ? (
        <DetailSection title="Особенности"><Traits list={c.features} /></DetailSection>
      ) : null}
      {(c.actions?.length || c.actions_description) ? (
        <DetailSection title="Действия">
          <Rich text={c.actions_description} />
          <Traits list={c.actions} />
        </DetailSection>
      ) : null}
      {(c.legendary_actions?.length || c.legendary_description) ? (
        <DetailSection title="Легендарные действия">
          <Rich text={c.legendary_description} />
          <Traits list={c.legendary_actions} />
        </DetailSection>
      ) : null}
      {c.mythical_actions?.length ? (
        <DetailSection title="Мифические действия"><Traits list={c.mythical_actions} /></DetailSection>
      ) : null}
    </section>
  )
}

/* ============================================================
   КЛАСС
   ============================================================ */

type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

/** Общее имя view-transition: сота подкласса ⇄ обложка на его подробной странице. */
const SUB_HERO = 'subclass-hero-img'

/** Список подклассов класса кэшируем — чтобы при возврате соты были на месте
 *  СРАЗУ (иначе перелёт-морф не находит цель, пока идёт запрос). */
const subclassListCache = new Map<string, Subclass[]>()

/** Снимаем имя перелёта с сот, чтобы на новом переходе не было дублей имени. */
function clearSubHeroNames() {
  document.querySelectorAll<HTMLElement>('.hex-cover').forEach((el) => {
    if (el.style.viewTransitionName === SUB_HERO) el.style.viewTransitionName = ''
  })
}

/* ---------- Таблица развития класса ---------- */

/** Умения, дающие выбор подкласса — кликом уводим к сотам подклассов ниже. */
const SUBCLASS_FEATURES = new Set([
  'Коллегия бардов',
  'Воинский архетип',
  'Магические традиции',
  'Круг друидов',
  'Божественный домен',
  'Специальность изобретателя',
  'Вариант договора',
  'Священная клятва',
  'Архетип плута',
  'Архетип следопыта',
  'Происхождение чародея',
  'Монастырская традиция',
  'Путь дикости',
])

function ClassProgressionTable({ table, onOpenSubclasses }: { table: ClassTable; onOpenSubclasses?: () => void }) {
  const nonSlot = table.columns.filter((c) => !c.slot)
  const slots = table.columns.filter((c) => c.slot)
  const span = slots.length ? 2 : 1
  return (
    <div className="ctable-wrap">
      <table className="ctable">
        <thead>
          <tr>
            {nonSlot.map((c) => (
              <th
                key={c.key}
                rowSpan={span}
                className={c.feat ? 'ctable-feat-h' : c.key === 'level' ? 'ctable-lvl-h' : 'ctable-num-h'}
              >
                {c.label}
              </th>
            ))}
            {slots.length > 0 && (
              <th colSpan={slots.length} className="ctable-group-h">Ячейки заклинаний</th>
            )}
          </tr>
          {slots.length > 0 && (
            <tr>
              {slots.map((c) => (
                <th key={c.key} className="ctable-num-h">{c.label}</th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              {table.columns.map((c, ci) => {
                const v = r.cells[ci]
                if (c.feat) {
                  const feats = Array.isArray(v) ? v : []
                  return (
                    <td key={c.key} className="ctable-feat">
                      {feats.length ? (
                        feats.map((f, fi) =>
                          onOpenSubclasses && SUBCLASS_FEATURES.has(f) ? (
                            <button key={fi} type="button" className="ctable-feat-item ctable-feat-link" onClick={onOpenSubclasses}>
                              {f}
                            </button>
                          ) : (
                            <span key={fi} className="ctable-feat-item">{f}</span>
                          ),
                        )
                      ) : (
                        <span className="ctable-dash">—</span>
                      )}
                    </td>
                  )
                }
                const cls = c.key === 'level' ? 'ctable-lvl' : c.key === 'prof' ? 'ctable-prof' : 'ctable-num'
                return <td key={c.key} className={cls}>{String(v ?? '—')}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- Соты подклассов (как соты книг) ---------- */

const HEX_DWELL_MS = 700

/** Раскладка ячеек по рядам гексагонального улья (копия из BookHive). */
function layoutHive<T>(items: T[], cols: number): { items: T[]; pad: number; nested: boolean }[] {
  const c = Math.max(1, cols)
  const target = (r: number) => (c <= 1 ? 1 : r % 2 === 0 ? c : c - 1)
  const rows: T[][] = []
  for (let i = 0, r = 0; i < items.length; r++) {
    const n = target(r)
    rows.push(items.slice(i, i + n))
    i += n
  }
  return rows.map((row, i) => ({
    items: row,
    pad: i === 0 ? 0 : Math.max(0, target(i) - row.length),
    nested: i > 0 && c > 1,
  }))
}

/** Короткая выжимка описания подкласса для меню соты (первый осмысленный абзац). */
function subclassPreview(text: string | null | undefined): string {
  const plain = cleanDescription(text)
  if (!plain) return ''
  const cut = plain.split(/[А-ЯЁ]{2,}(?:[ ]+[А-ЯЁ]+)+/)[0].trim() || plain.trim()
  return cut.length > 240 ? cut.slice(0, 237).trimEnd() + '…' : cut
}

function SubclassHexExpand({ sc, onOpen }: { sc: Subclass; onOpen?: (e: ReactMouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link to={`/subclasses/${sc.id}`} className="hex-expand hex-expand--sub" onClick={onOpen}>
      <div className="hex-expand-inner">
        <Corners size={20} />
        <div className="hex-expand-title">
          <span className="hex-expand-title-text">{sc.subclass_name}</span>
        </div>
        <p className="hex-expand-desc">{subclassPreview(sc.description) || sc.subclass_flavor || 'Открыть подкласс'}</p>
      </div>
    </Link>
  )
}

/** Обложка подкласса: картинка из image_gallery, иначе щит-заглушка. */
function SubclassCover({ sc, vtName }: { sc: Subclass; vtName?: string }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(sc.image_gallery)
  const style = vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined
  if (!src || broken) {
    return (
      <span className="hex-cover hex-cover--empty" style={style}>
        <Shield aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      className="hex-cover"
      src={src}
      alt=""
      loading="lazy"
      style={style}
      onError={() => setBroken(true)}
    />
  )
}

function SubclassHex({
  sc,
  index,
  selected = false,
  returning = false,
  onToggle,
}: {
  sc: Subclass
  index: number
  /** подкласс выбран для просмотра в статье класса */
  selected?: boolean
  /** сюда только что вернулись с подробной страницы — цель морфа-перелёта */
  returning?: boolean
  onToggle?: (id: string) => void
}) {
  const navigate = useNavigate()
  const cellRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => {
    if (dwell.current) clearTimeout(dwell.current)
    dwell.current = setTimeout(() => setExpanded(true), HEX_DWELL_MS)
  }
  const cancel = () => {
    if (dwell.current) {
      clearTimeout(dwell.current)
      dwell.current = null
    }
    setExpanded(false)
  }
  useEffect(() => () => {
    if (dwell.current) clearTimeout(dwell.current)
  }, [])

  // открытие с перелётом-морфом: обложка соты «летит» в шестиугольник-обложку
  // подробной страницы (общее имя SUB_HERO). Так же, как карточка класса.
  // Работает и по клику на саму соту, и по раскрытой карточке-описанию.
  const newTab = useContext(OpenLinksInNewTab)
  const open = (e?: ReactMouseEvent<HTMLElement>) => {
    if (e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return
    e?.preventDefault()
    const to = `/subclasses/${sc.id}`
    if (newTab) {
      window.open(to, '_blank', 'noopener')
      return
    }
    const img = cellRef.current?.querySelector<HTMLElement>('.hex-cover')
    const doc = document as VTDocument
    if (!doc.startViewTransition || !img) {
      navigate(to)
      return
    }
    clearSubHeroNames()
    img.style.viewTransitionName = SUB_HERO
    document.documentElement.dataset.nav = '1'
    // ждём коммита навигации, потом снимаем новый кадр (см. whenRouteCommitted):
    // соту-обложку отсоединит от DOM размонтирование страницы класса
    const t = doc.startViewTransition(() => {
      navigate(to)
      return whenRouteCommitted(() => !img.isConnected)
    })
    const fin = () => delete document.documentElement.dataset.nav
    t.finished.then(fin, fin)
  }

  return (
    <div
      className={`hex-cell-wrap${expanded ? ' is-expanded' : ''}${selected ? ' is-picked' : ''}`}
      style={{ animationDelay: `${Math.min(index * 45, 700)}ms` }}
      onMouseEnter={start}
      onMouseLeave={cancel}
    >
      <div className="hex-unit">
        <div className="hex-unit-fill">
          <div
            className="hex-cell"
            ref={cellRef}
            role="link"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                open()
              }
            }}
          >
            <span className="hex-inner">
              <SubclassCover sc={sc} vtName={returning ? SUB_HERO : undefined} />
              <span className="hex-shade" />
              <span className="hex-body">
                <span className="hex-title" title={sc.subclass_name}>{sc.subclass_name}</span>
              </span>
            </span>
          </div>
          <SubclassHexExpand sc={sc} onOpen={open} />
        </div>
      </div>
      {onToggle && (
        <button
          type="button"
          className={`hex-pick hex-pick--hive${selected ? ' is-on' : ''}`}
          onClick={() => onToggle(sc.id)}
          title={selected ? 'Убрать подкласс' : 'Выбрать подкласс'}
          aria-label={selected ? 'Убрать подкласс' : 'Выбрать подкласс'}
          aria-pressed={selected}
        >
          {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}

function SubclassHive({
  subclasses,
  selectedId,
  returningId,
  onToggle,
}: {
  subclasses: Subclass[]
  selectedId?: string | null
  /** сота, в которую прилетает морф при возврате с подробной страницы */
  returningId?: string
  onToggle?: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ s: 196, cols: 5 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === 0) return
      const s = w < 620 ? 150 : w < 980 ? 172 : 196
      const cols = Math.max(1, Math.floor(w / (s + 14)))
      setLayout((prev) => (prev.s === s && prev.cols === cols ? prev : { s, cols }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = layoutHive(subclasses, layout.cols)

  return (
    <div className="hive" ref={ref} style={{ '--s': `${layout.s}px` } as CSSProperties}>
      {rows.map(({ items: row, pad, nested }, ri) => (
        <div key={ri} className={`hive-row${nested ? ' hive-row--nest' : ''}`}>
          {row.map((sc, ci) => (
            <SubclassHex
              key={sc.id}
              sc={sc}
              index={ri * layout.cols + ci}
              selected={sc.id === selectedId}
              returning={sc.id === returningId}
              onToggle={onToggle}
            />
          ))}
          {Array.from({ length: pad }, (_, pi) => (
            <span key={`pad-${pi}`} className="hex-cell-wrap hex-cell-wrap--spacer" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  )
}

function ClassDetailPortrait({ src, alt, vt = true }: { src: string | null; alt: string; vt?: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="class-detail-portrait">
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          style={vt ? ({ viewTransitionName: 'class-hero-img' } as CSSProperties) : undefined}
          onError={() => setBroken(true)}
        />
      ) : (
        <Swords className="class-detail-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

/** Как называется группа подклассов у конкретного класса (термин dnd.su). */
const SUBCLASS_GROUP_LABEL: Record<string, string> = {
  Бард: 'Коллегии барда',
  Варвар: 'Пути дикости',
  Воин: 'Воинские архетипы',
  Волшебник: 'Магические традиции',
  Друид: 'Круги друидов',
  Жрец: 'Божественные домены',
  Изобретатель: 'Специализации изобретателя',
  Колдун: 'Потусторонние покровители',
  Монах: 'Монастырские традиции',
  Паладин: 'Священные клятвы',
  Плут: 'Архетипы плута',
  Следопыт: 'Архетипы следопыта',
  Чародей: 'Происхождения чародея',
}

/**
 * Деталь класса: id из оболочки/роута, onBack — reverse-VT в каталог (если задан).
 * `embedded` — показ внутри конструктора персонажа: без «назад» и мультикласса,
 * подкласс выбирается локально (не в адресе), переходы — в новой вкладке.
 */
export function ClassDetailView({
  id,
  onBack,
  embedded = false,
}: {
  id: string
  onBack?: () => void
  embedded?: boolean
}) {
  const location = useLocation()
  const { data: c, error } = useOne<GameClass>('classes', id)
  // из кэша — чтобы при возврате с подкласса соты были на месте сразу (для морфа)
  const [subclasses, setSubclasses] = useState<Subclass[]>(() => subclassListCache.get(id) || [])

  useEffect(() => {
    setSubclasses(subclassListCache.get(id) ?? [])
    getSubList<Subclass>('classes', id, 'subclasses')
      .then((list) => {
        subclassListCache.set(id, list)
        // деталь подкласса откроется мгновенно (с обложкой) — нужно для морфа
        list.forEach((s) => cacheEntity('subclasses', s.id, s))
        setSubclasses(list)
      })
      .catch(() => {})
  }, [id])

  // подкласс, с которого вернулись (морф-перелёт в его соту); гасим имя через ~1.5 c
  const [returningSub, setReturningSub] = useState<string | undefined>(
    () => (location.state as { returningSubclass?: string } | null)?.returningSubclass,
  )
  useEffect(() => {
    const fromState = (location.state as { returningSubclass?: string } | null)?.returningSubclass
    if (fromState) setReturningSub(fromState)
  }, [location.state])
  useEffect(() => {
    if (!returningSub) return
    const t = setTimeout(() => setReturningSub(undefined), 1500)
    return () => clearTimeout(t)
  }, [returningSub])

  const isHtml = useMemo(() => isHtmlDescription(c?.description), [c?.description])
  const proficiencies = useMemo(
    () => (isHtml && c?.description ? parseClassProficiencies(c.description) : {}),
    [isHtml, c?.description],
  )
  const table = useMemo(() => (isHtml ? null : parseClassTable(c?.description)), [c?.description, isHtml])
  const descText = useMemo(() => (isHtml ? '' : stripClassTable(c?.description)), [c?.description, isHtml])
  const subsRef = useRef<HTMLDivElement>(null)
  const scrollToSubclasses = () =>
    subsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // возврат с подкласса: подводим соты в кадр ДО отрисовки, чтобы обложка
  // «прилетела» на видимую соту (снимок view-transition берётся уже с прокруткой).
  // Прыжок мгновенный — иначе плавный скролл сайта уводит цель из кадра снимка.
  useLayoutEffect(() => {
    if (returningSub && subclasses.length && subsRef.current) {
      const root = document.documentElement
      const prev = root.style.scrollBehavior
      root.style.scrollBehavior = 'auto'
      subsRef.current.scrollIntoView({ block: 'center' })
      root.style.scrollBehavior = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningSub, subclasses.length])

  // Выбранный подкласс (?subclass=): его умения вписываются в таблицу/список класса
  const [searchParams, setSearchParams] = useSearchParams()
  const [localSubclass, setLocalSubclass] = useState<string | null>(null)
  const subclassId = embedded ? localSubclass : searchParams.get('subclass')
  const heroRef = useRef<HTMLElement>(null)
  const { data: selectedSubDirect } = useOne<Subclass>('subclasses', subclassId ?? undefined)
  const selectedSub = useMemo(() => {
    if (!subclassId) return null
    const fromList = subclasses.find((s) => s.id === subclassId)
    if (fromList) return fromList
    // подкласс из URL мог не совпасть со списком ещё не загруженного класса
    return selectedSubDirect?.id === subclassId && selectedSubDirect.parent_class_id === id
      ? selectedSubDirect
      : null
  }, [subclasses, subclassId, selectedSubDirect, id])
  const subclassSection = useMemo(
    () =>
      selectedSub
        ? resolveSubclassSectionHtml(selectedSub.description, selectedSub.subclass_name, c?.description)
        : null,
    [selectedSub, c?.description],
  )
  const subclassFeatures = useMemo(
    () => (subclassSection ? parseSubclassFeatures(subclassSection) : undefined),
    [subclassSection],
  )
  const toggleSubclass = (nextId: string | null) => {
    const picked = !!nextId && nextId !== subclassId
    if (embedded) {
      setLocalSubclass(picked ? nextId : null)
      if (picked) heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const p = new URLSearchParams(searchParams)
    if (picked) p.set('subclass', nextId!)
    else p.delete('subclass')
    setSearchParams(p, { replace: true })
    // выбор из сот внизу страницы — поднимаем к шапке, где виден бейдж подкласса
    if (picked) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (error) return <p className="status-line is-error">Класс не найден: {error}</p>
  if (!c) return <p className="status-line">Листаем хроники орденов…</p>

  const dieType = hitDieType(c.hit_dice)

  const vt = (name: string) =>
    embedded ? undefined : ({ viewTransitionName: name } as CSSProperties)

  return (
    <OpenLinksInNewTab.Provider value={embedded}>
      <section className="book-page class-detail-page">
        {embedded ? null : onBack ? (
          <button type="button" className="back-link back-link--btn" onClick={onBack}>
            <ArrowLeft aria-hidden="true" /> к классам
          </button>
        ) : (
          <Link to="/classes" className="back-link">
            <ArrowLeft aria-hidden="true" /> к классам
          </Link>
        )}

        <header ref={heroRef} className={`class-detail-hero${c.is_caster ? ' is-caster' : ' is-martial'}`}>
          <div className="class-detail-stage">
            <div className="class-detail-aura" aria-hidden="true" />
            <img
              className="class-detail-die"
              src={DIE_NUM_IMAGE_URLS[dieType]}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={vt('class-hero-die')}
            />
            <ClassDetailPortrait src={realImage(c.image_gallery)} alt={c.class_name} vt={!embedded} />

            <div className="class-detail-meta">
              <h1 className="class-detail-name-plate" style={vt('class-hero-title')}>
                {c.class_name}
              </h1>
              <div className="card-chips class-detail-chips">
                <Chip icon={<DieChipIcon type={dieType} />}>к{c.hit_dice} хитов</Chip>
                {c.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
              </div>
            </div>

            {selectedSub && (
              <div className="class-detail-subhex">
                <div className="class-detail-subhex-art">
                  <Link
                    to={`/subclasses/${selectedSub.id}`}
                    className="detail-hex detail-hex--sm"
                    title={selectedSub.subclass_name}
                    target={embedded ? '_blank' : undefined}
                    rel={embedded ? 'noopener' : undefined}
                  >
                    {realImage(selectedSub.image_gallery) ? (
                      <img
                        className="detail-hex-cover"
                        src={realImage(selectedSub.image_gallery)!}
                        alt={selectedSub.subclass_name}
                      />
                    ) : (
                      <span className="detail-hex-fallback"><Shield aria-hidden="true" /></span>
                    )}
                  </Link>
                  <button
                    type="button"
                    className="hex-pick hex-pick--bottom"
                    onClick={() => toggleSubclass(null)}
                    title="Убрать подкласс"
                    aria-label="Убрать подкласс"
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                <span className="class-detail-subhex-name">{selectedSub.subclass_name}</span>
              </div>
            )}
          </div>
        </header>

        <Divider />

        <div className="class-cta-row">
          {c.is_caster && (
            <Link
              to={`/spells?class=${encodeURIComponent(c.class_name.toLowerCase())}`}
              className="spell-cta"
              target={embedded ? '_blank' : undefined}
              rel={embedded ? 'noopener' : undefined}
            >
              <Sparkles aria-hidden="true" />
              Заклинания класса
            </Link>
          )}
          {subclasses.length > 0 && (
            <button
              type="button"
              className="spell-cta spell-cta--ghost subclass-jump"
              onClick={scrollToSubclasses}
            >
              <Users aria-hidden="true" />
              {selectedSub
                ? 'Сменить архетип'
                : `${SUBCLASS_GROUP_LABEL[c.class_name] ?? 'Подклассы'} — ${subclasses.length}`}
              <ArrowDown aria-hidden="true" />
            </button>
          )}
          {!embedded && <MulticlassButton fromLabel={c.class_name} />}
        </div>

        {hasClassProficiencies(proficiencies) && (
          <div className="stat-rows">
            <StatRow label="Доспехи" value={proficiencies.armor} />
            <StatRow label="Оружие" value={proficiencies.weapons} />
            <StatRow label="Инструменты" value={proficiencies.tools} />
            <StatRow label="Спасброски" value={proficiencies.savingThrows} />
            <StatRow label="Навыки" value={proficiencies.skills} />
          </div>
        )}
        {hasStartingEquipment(c.starting_equipment, c.starting_equipment_text) && (
          <DetailSection title="Стартовое снаряжение">
            <StartingEquipment grants={c.starting_equipment} sourceText={c.starting_equipment_text} backLabel={c.class_name} />
          </DetailSection>
        )}
        {isHtml ? (
          <section className="detail-section">
            <ClassArticle
              html={c.description!}
              subclassSectionHtml={subclassSection}
              subclassFeatures={subclassFeatures}
              isCaster={!!c.is_caster}
              backLabel={c.class_name}
            />
          </section>
        ) : (
          <>
            <DetailSection title="Описание">
              <Rich text={descText} />
            </DetailSection>
            {table && (
              <DetailSection title="Таблица развития">
                <ClassProgressionTable
                  table={table}
                  onOpenSubclasses={subclasses.length > 0 ? scrollToSubclasses : undefined}
                />
              </DetailSection>
            )}
          </>
        )}
        {(c.abilities?.length ?? 0) > 0 && (
          <DetailSection title="Способности и механика">
            <AbilityList refs={c.abilities} />
          </DetailSection>
        )}
        {subclasses.length > 0 && (
          <div ref={subsRef}>
            <DetailSection title={`${SUBCLASS_GROUP_LABEL[c.class_name] ?? 'Подклассы'} — ${subclasses.length}`}>
              <SubclassHive
                subclasses={subclasses}
                selectedId={subclassId}
                returningId={returningSub}
                onToggle={toggleSubclass}
              />
            </DetailSection>
          </div>
        )}
      </section>
    </OpenLinksInNewTab.Provider>
  )
}

/* ============================================================
   РАСА
   ============================================================ */

function RaceDetailPortrait({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  const framed = isFramedArt(src)
  return (
    <div className={`class-detail-portrait race-detail-portrait${framed ? ' is-framed' : ''}`}>
      {src && !broken ? (
        <img
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
function AbilityBoosts({ scores, className }: { scores: Record<string, number> | null; className?: string }) {
  const boosts = Object.entries(scores ?? {})
  if (boosts.length === 0) return null
  return (
    <div className={`race-boosts${className ? ` ${className}` : ''}`}>
      {boosts.map(([k, v]) => (
        <span className="race-boost" key={k}>
          {ABILITY_RU[k] ?? k}
          <i>+{v}</i>
        </span>
      ))}
    </div>
  )
}

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
            <AbilityBoosts scores={r.increase_ability_scores} className="race-detail-boosts" />
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

{(r.abilities?.length ?? 0) > 0 && (
        <DetailSection title="Способности и механика">
          <AbilityList refs={r.abilities} />
        </DetailSection>
      )}

      {!embedded && subraces.length > 0 && (
        <DetailSection title={`Подрасы — ${subraces.length}`}>
          <div className="subrace-grid">
            {subraces.map((sr) => {
              const body = (
                <>
                  <span className="subrace-card-name">{sr.subrace_name}</span>
                  <AbilityBoosts scores={sr.increase_ability_scores} />
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
    </section>
  )
}

/* ============================================================
   ПОДКЛАСС
   ============================================================ */

export function SubclassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: sc, error } = useOne<Subclass>('subclasses', id)
  const book = useBookRef(sc?.book_source_id)
  const { data: parent } = useOne<GameClass>('classes', sc?.parent_class_id)

  // возврат к соте с тем же морфом-перелётом, что и при открытии (обложка «летит»
  // обратно в свою соту на странице класса). Соту помечаем через location.state.
  const backToClass = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!sc || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const to = `/classes/${sc.parent_class_id}`
    const state = { returningSubclass: sc.id }
    const doc = document as VTDocument
    if (!doc.startViewTransition) {
      navigate(to, { state })
      return
    }
    // не даём глобальному ScrollToTop сбросить прокрутку — сами подводим соты в кадр
    document.documentElement.dataset.keepScroll = '1'
    document.documentElement.dataset.nav = '1'
    // ждём коммита: страница класса появится (.class-detail-page) и её
    // useLayoutEffect по returningSub успеет подвести соту в кадр — только тогда
    // берём новый кадр морфа
    const t = doc.startViewTransition(() => {
      navigate(to, { state })
      return whenRouteCommitted(() => !!document.querySelector('.class-detail-page'))
    })
    const fin = () => delete document.documentElement.dataset.nav
    t.finished.then(fin, fin)
  }

  // Богатую разметку берём из description подкласса; старый путь — вырезка из HTML класса.
  const subclassHtml = useMemo(() => {
    if (!sc?.subclass_name) return null
    return resolveSubclassSectionHtml(sc.description, sc.subclass_name, parent?.description)
  }, [sc?.description, sc?.subclass_name, parent?.description])

  if (error) return <p className="status-line is-error">Подкласс не найден: {error}</p>
  if (!sc) return <p className="status-line">Листаем хроники ордена…</p>

  return (
    <DetailShell
      backTo={`/classes/${sc.parent_class_id}`}
      backLabel={parent ? `к классу «${parent.class_name}»` : 'к классу'}
      onBackClick={backToClass}
      kicker={sc.subclass_flavor ?? 'подкласс'}
      title={sc.subclass_name}
      image={null}
      heroHex={realImage(sc.image_gallery)}
      heroHexName={SUB_HERO}
      imageIcon={Shield}
      chips={
        <>
          <SourceBadge book={book} />
          {sc.level_available != null && <Chip icon={Star}>с {sc.level_available} уровня</Chip>}
          {sc.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
        </>
      }
    >
      <div className="subclass-actions">
        {/* выбрать подкласс → страница класса с умениями подкласса в таблице/списке */}
        <Link to={`/classes/${sc.parent_class_id}?subclass=${sc.id}`} className="spell-cta">
          <Check aria-hidden="true" />
          Выбрать подкласс
        </Link>
        {/* спеллы родительского класса ∪ спеллы этого подкласса */}
        <Link
          to={{
            pathname: '/spells',
            search:
              (parent ? `class=${encodeURIComponent(parent.class_name.toLowerCase())}&` : '') +
              `class=${encodeURIComponent('sub:' + sc.subclass_name.toLowerCase())}`,
          }}
          className="spell-cta spell-cta--ghost"
        >
          <Sparkles aria-hidden="true" />
          Заклинания подкласса
        </Link>
      </div>
      {subclassHtml ? (
        <section className="detail-section">
          <ClassArticle html={subclassHtml} cutSubclasses={false} isCaster={!!sc.is_caster} backLabel={sc.subclass_name} />
        </section>
      ) : (
        <DetailSection title="Описание">
          <Rich text={sc.description} />
        </DetailSection>
      )}
      {(sc.abilities?.length ?? 0) > 0 && (
        <DetailSection title="Способности и механика">
          <AbilityList refs={sc.abilities} />
        </DetailSection>
      )}
    </DetailShell>
  )
}

/* ============================================================
   ПОДРАСА
   ============================================================ */

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
      {(sr.abilities?.length ?? 0) > 0 && (
        <DetailSection title="Способности и механика">
          <AbilityList refs={sr.abilities} />
        </DetailSection>
      )}
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

/* ============================================================
   ПРЕДЫСТОРИЯ
   ============================================================ */

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
function HeroHexArt({
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
          <img src={src} alt={alt} onError={() => setBroken(true)} />
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
        {art && <span className="bg-hero-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />}
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
        <DetailSection title="Снаряжение">
          <StartingEquipment
            grants={bg.starting_equipment}
            fallbackText={bg.equipment}
            backLabel={bg.background_name}
            columns={2}
          />
        </DetailSection>
      )}

      {(bg.abilities?.length ?? 0) > 0 && (
        <DetailSection title="Способности и механика">
          <AbilityList refs={bg.abilities} />
        </DetailSection>
      )}

      {descHtml ? (
        // размеченное описание с dnd.su (таблицы, черты предыстории, списки)
        <section className="detail-section">
          <ClassArticle html={descHtml} cutSubclasses={false} backLabel={bg.background_name} />
        </section>
      ) : (
        bg.description && (
          <DetailSection title="Описание">
            <Rich text={bg.description} />
          </DetailSection>
        )
      )}
    </OpenLinksInNewTab.Provider>
  )
}

/* ============================================================
   ЧЕРТА
   ============================================================ */

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
        {art && <span className="bg-hero-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />}
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

      {(f.abilities?.length ?? 0) > 0 && (
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

/* ============================================================
   ПРЕДМЕТ
   ============================================================ */

function ItemArt({
  src,
  alt,
  fallback: Fallback = Gem,
}: {
  src: string | null
  alt: string
  fallback?: LucideIcon
}) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="item-art">
      <span className="item-glow" aria-hidden="true" />
      {src && !broken ? (
        <img src={src} alt={alt} onError={() => setBroken(true)} />
      ) : (
        <Fallback className="item-art-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: it, error } = useOne<Item>('items', id)
  const book = useBookRef(it?.item_source)
  if (error) return <p className="status-line is-error">Предмет не найден: {error}</p>
  if (!it) return <p className="status-line">Открываем сокровищницу…</p>

  const rarity = rarityKeyOf(it.rarity)

  return (
    <section className="book-page item-page">
      <Link to="/items" className="back-link">
        <ArrowLeft aria-hidden="true" /> к сокровищнице
      </Link>

      {/* центрированный герой: крупный арт со свечением редкости сзади и снизу */}
      <div className="item-hero" data-rarity={rarity}>
        <PriceMark costCopper={it.cost_copper} className="price-mark--hero" />
        <ItemArt src={realImage(it.item_image_gallery)} alt={it.item_name} />
        <span className="setting-kicker item-kicker">{it.item_type ?? 'магический предмет'}</span>
        <h1 className="book-title gold-text item-title">{it.item_name}</h1>
        <div className="card-chips item-chips">
          <SourceBadge book={book} />
          {it.rarity && <Chip icon={Gem}>{it.rarity}</Chip>}
          {it.attunement_required && <Chip icon={Sparkles}>требует настройки</Chip>}
          {it.weight != null && it.weight > 0 && <Chip icon={Scale}>{it.weight} фнт.</Chip>}
        </div>
      </div>

      <Divider />

      <div className="item-body">
        <DetailSection title="Описание">
          <Rich text={it.description} />
        </DetailSection>
      </div>
    </section>
  )
}

/* ============================================================
   СНАРЯЖЕНИЕ
   ============================================================ */

/** Что контейнер принимает внутрь; все три списка пусты — принимает что угодно */
function containerAccepts(c: ContainerProfile): string {
  const parts = [...c.accepts_categories, ...c.accepts_tags, ...c.accepts_slugs]
  return parts.length === 0 ? 'что угодно' : parts.join(', ')
}

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: eq, error } = useOne<Equipment>('equipment', id)
  const book = useBookRef(eq?.book_source_id)
  const index = useEquipmentIndex()
  const { backTo, backLabel } = useContextualBack('/equipment', 'к снаряжению')
  if (error) return <p className="status-line is-error">Снаряжение не найдено: {error}</p>
  if (!eq) return <p className="status-line">Разбираем походный тюк…</p>

  const weight = formatWeight(eq.weight)
  const w = eq.weapon
  const d = eq.defense
  const c = eq.container
  const range = w?.range_normal != null ? `${w.range_normal}${w.range_long ? `/${w.range_long}` : ''} фт.` : null
  const Icon = categoryIcon(eq.category)

  return (
    <section className="book-page item-page">
      <Link to={backTo} className="back-link">
        <ArrowLeft aria-hidden="true" /> {backLabel}
      </Link>

      <div className="item-hero">
        <PriceMark cost={eq.cost} costCopper={eq.cost_copper} className="price-mark--hero" />
        <ItemArt
          src={realImage(eq.equipment_image_gallery)}
          alt={eq.equipment_name}
          fallback={Icon}
        />
        <span className="setting-kicker item-kicker">{eq.subcategory ?? eq.category}</span>
        <h1 className="book-title gold-text item-title">{eq.equipment_name}</h1>
        {eq.equipment_name_en && <span className="setting-name-en">{eq.equipment_name_en}</span>}
        <div className="card-chips item-chips">
          <SourceBadge book={book} />
          {weight && <Chip icon={Scale}>{weight}</Chip>}
          {eq.bundle_size != null && eq.bundle_size > 1 && <Chip icon={Package}>пачка {eq.bundle_size}</Chip>}
          {eq.stackable && <Chip icon={Layers}>стак до {eq.stack_size}</Chip>}
          {eq.tags.map((t) => (
            <Chip key={t} icon={Tag}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <Divider />

      <div className="item-body">
        {w && (
          <DetailSection title="Оружие">
            <div className="stat-rows">
              <StatRow label="Вид" value={[w.weapon_kind, w.attack_kind].filter(Boolean).join(' · ')} />
              <StatRow
                label="Урон"
                value={[formatDice(w.damage_dice), w.damage_type?.toLowerCase()].filter(Boolean).join(' ')}
              />
              <StatRow label="Универсальное" value={formatDice(w.versatile_dice)} />
              <StatRow label="Дистанция" value={range} />
              <StatRow label="Свойства" value={w.properties.join(', ')} />
              <StatRow label="Приём" value={w.mastery} />
              <StatRow label="Боеприпасы" value={w.ammunition_type} />
            </div>
          </DetailSection>
        )}

        {d && (
          <DetailSection title="Доспех">
            <div className="stat-rows">
              <StatRow label="Вид" value={d.armor_kind} />
              <StatRow
                label="Класс Доспеха"
                value={
                  d.armor_class != null
                    ? `${d.armor_class}${d.add_dex_modifier ? ' + ЛОВ' : ''}${
                        d.dex_modifier_cap != null ? ` (не более +${d.dex_modifier_cap})` : ''
                      }`
                    : d.armor_class_formula
                }
              />
              <StatRow label="Требование Силы" value={d.strength_requirement} />
              <StatRow label="Скрытность" value={d.stealth_disadvantage ? 'помеха' : null} />
              <StatRow label="Хиты" value={d.hit_points} />
              <StatRow label="Порог урона" value={d.damage_threshold} />
            </div>
          </DetailSection>
        )}

        {c && (
          <DetailSection title={`Контейнер: ${containerKindRu(c.container_kind)}`}>
            <div className="stat-rows">
              <StatRow label="Ячейки" value={c.slots} />
              <StatRow label="Вместимость" value={c.capacity_pounds != null ? `${c.capacity_pounds} фнт.` : null} />
              <StatRow
                label="Объём"
                value={c.capacity_cubic_feet != null ? `${c.capacity_cubic_feet} куб. фт.` : null}
              />
              <StatRow label="Принимает" value={containerAccepts(c)} />
            </div>
            {c.sealed && (
              <p className="detail-note">
                Набор: содержимое можно вынуть, но сложить обратно в него нельзя.
              </p>
            )}
            {c.default_contents.length > 0 && (
              <>
                <p className="detail-note">Содержимое:</p>
                <EquipmentContentsGallery contents={c.default_contents} index={index} />
              </>
            )}
          </DetailSection>
        )}

        {eq.description && (
          <DetailSection title="Описание">
            <Rich text={eq.description} />
          </DetailSection>
        )}
      </div>
    </section>
  )
}

/* ============================================================
   ТЕРМИН
   ============================================================ */

export function TerminDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: t, error } = useOne<Termin>('termins', id)
  const book = useBookRef(t?.book_source_id)
  if (error) return <p className="status-line is-error">Термин не найден: {error}</p>
  if (!t) return <p className="status-line">Ищем в глоссарии…</p>

  return (
    <DetailShell
      backTo="/termins"
      backLabel="к терминам"
      kicker="термин"
      title={t.name}
      image={realImage(t.image_gallery)}
      imageIcon={BookOpen}
      chips={<SourceBadge book={book} />}
    >
      <DetailSection title="Определение">
        <Rich text={t.description} />
      </DetailSection>
    </DetailShell>
  )
}
