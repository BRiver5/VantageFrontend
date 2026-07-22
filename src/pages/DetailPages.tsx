import { isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  Coins,
  Eye,
  Footprints,
  Gem,
  Hourglass,
  Landmark,
  Ruler,
  Scale,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Target,
  Users,
  VenetianMask,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  formatCR,
  getCachedEntity,
  getOne,
  getSubList,
  realImage,
} from '../api'
import type { Book, Creature, CreatureTrait, Feat, GameClass, Background, Item, Race, Spell, Subclass, Subrace, Termin } from '../api'
import { Corners, Divider } from '../ornaments'
import { SourceBadge } from './CatalogPage'
import { DIE_NUM_IMAGE_URLS, DieChipIcon, hitDieType } from '../dice/diceAssets'
import { RichText, TermDesc, highlightTerms, useTermIndex } from '../terms/terms'
import { parseClassTable, stripClassTable } from '../classTable'
import type { ClassTable } from '../classTable'
import { ClassArticle, isHtmlDescription, extractSubclassHtml, parseSubclassFeatures } from '../classArticle'

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
    if (!id) return
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
  kicker,
  title,
  image,
  heroHex,
  imageIcon: ImageIcon,
  badge,
  chips,
  rarity,
  backdrop,
  heroNames,
  children,
}: {
  backTo: string
  backLabel: string
  kicker: string | null
  title: string
  image: string | null
  /** если задан — обложка рисуется шестиугольником (как сота), а не плашкой */
  heroHex?: string | null
  imageIcon: LucideIcon
  badge?: ReactNode
  chips: ReactNode
  /** ключ редкости — если задан, за артом предмета светится её цвет */
  rarity?: string
  /** декор за обложкой (напр. силуэт кости хитов у класса) */
  backdrop?: ReactNode
  /** общие view-transition-name для морфа из карточки каталога (арт + заголовок) */
  heroNames?: { img?: string; title?: string }
  children: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  return (
    <section className="book-page">
      <Link to={backTo} className="back-link">
        <ArrowLeft aria-hidden="true" /> {backLabel}
      </Link>
      <div className="book-hero">
        <Corners size={40} />
        {heroHex !== undefined ? (
          <div className="detail-hex">
            {heroHex && !broken ? (
              <img className="detail-hex-cover" src={heroHex} alt={title} onError={() => setBroken(true)} />
            ) : (
              <span className="detail-hex-fallback"><ImageIcon aria-hidden="true" /></span>
            )}
          </div>
        ) : (
          <div
            className={`book-cover detail-plate${rarity ? ' detail-plate--glow' : ''}`}
            data-rarity={rarity || undefined}
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
          </div>
        )}
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

const mod = (v: number) => {
  const m = Math.floor((v - 10) / 2)
  return m >= 0 ? `+${m}` : String(m)
}

/* ============================================================
   ЗАКЛИНАНИЕ
   ============================================================ */

export function SpellDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: s, error } = useOne<Spell>('spells', id)
  const book = useBookRef(s?.spell_source)
  if (error) return <p className="status-line is-error">Заклинание не найдено: {error}</p>
  if (!s) return <p className="status-line">Разворачиваем свиток…</p>

  const comps = [
    s.components?.verbal && 'В',
    s.components?.somatic && 'С',
    s.components?.material && 'М',
  ].filter(Boolean).join(', ')

  return (
    <DetailShell
      backTo="/spells"
      backLabel="к гримуару"
      kicker={s.school ? `школа: ${s.school}` : 'заклинание'}
      title={s.spell_name}
      image={null}
      imageIcon={Sparkles}
      badge={<HexBadge value={s.spell_level === 0 ? '◈' : String(s.spell_level)} label={s.spell_level === 0 ? 'заговор' : 'круг'} />}
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

const ABILITIES: (keyof Creature)[] = ['strenght', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
const ABILITY_LABEL: Record<string, string> = {
  strenght: 'СИЛ', dexterity: 'ЛОВ', constitution: 'ТЕЛ',
  intelligence: 'ИНТ', wisdom: 'МДР', charisma: 'ХАР',
}

export function CreatureDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: c, error } = useOne<Creature>('creatures', id)
  const book = useBookRef(c?.book_source_id)
  if (error) return <p className="status-line is-error">Существо не найдено: {error}</p>
  if (!c) return <p className="status-line">Выслеживаем существо…</p>

  const kind = [c.size, c.creature_type, c.alignment].filter(Boolean).join(' · ')
  const speeds = [
    c.speed != null && `${c.speed} фт.`,
    c.flight_speed && `полёт ${c.flight_speed} фт.`,
    c.swim_speed && `плавание ${c.swim_speed} фт.`,
    c.climb_speed && `лазание ${c.climb_speed} фт.`,
    c.burrow_speed && `копание ${c.burrow_speed} фт.`,
  ].filter(Boolean).join(', ')
  const senses = [
    c.night_vision && `тёмное зрение ${c.night_vision} фт.`,
    c.blind_vision && `слепое зрение ${c.blind_vision} фт.`,
    c.true_vision && `истинное зрение ${c.true_vision} фт.`,
  ].filter(Boolean).join(', ')
  const fmtMap = (m: Record<string, number> | null) =>
    m && Object.keys(m).length
      ? Object.entries(m).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')
      : null

  return (
    <DetailShell
      backTo="/bestiary"
      backLabel="к бестиарию"
      kicker={kind || 'существо'}
      title={c.name}
      image={realImage(c.image_gallery) ?? realImage(c.image_url)}
      imageIcon={Skull}
      badge={<HexBadge value={formatCR(c.challenge_rating)} label="ПО" />}
      chips={
        <>
          <SourceBadge book={book} />
          <Chip icon={Shield}>КД {c.ac}{c.ac_source ? ` (${c.ac_source})` : ''}</Chip>
          <Chip icon={Star}>{c.hp} хитов{c.hp_formula ? ` (${c.hp_formula.trim()})` : ''}</Chip>
          {speeds && <Chip icon={Footprints}>{speeds}</Chip>}
          {c.proficiency_bonus != null && <Chip icon={<DieChipIcon type={20} />}>бонус мастерства +{c.proficiency_bonus}</Chip>}
          {c.is_unique && <Chip icon={Star}>уникальное</Chip>}
        </>
      }
    >
      <div className="ability-grid">
        {ABILITIES.map((key) => {
          const v = c[key] as number | null
          if (v == null) return null
          return (
            <span key={key} className="hex-badge ability-hex" title={ABILITY_LABEL[key]}>
              <span className="hex-badge-inner">
                <b>{v}</b>
                <i>{ABILITY_LABEL[key]} {mod(v)}</i>
              </span>
            </span>
          )
        })}
      </div>

      <div className="stat-rows">
        <StatRow label="Спасброски" value={fmtMap(c.saving_throws)} />
        <StatRow label="Навыки" value={fmtMap(c.skills)} />
        <StatRow label="Иммунитет к урону" value={c.damage_imunities?.join(', ')} />
        <StatRow label="Сопротивление урону" value={c.damage_resistances?.join(', ')} />
        <StatRow label="Уязвимость к урону" value={c.damage_vulnerabilities?.join(', ')} />
        <StatRow label="Иммунитет к состояниям" value={c.condition_imunities?.join(', ')} />
        <StatRow label="Чувства" value={senses} />
        <StatRow label="Языки" value={c.languages?.join(', ')} />
        <StatRow label="Среда обитания" value={c.area_of_living?.join(', ')} />
      </div>

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
    </DetailShell>
  )
}

/* ============================================================
   КЛАСС
   ============================================================ */

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
  if (!text) return ''
  // берём текст до первого ALL-CAPS заголовка умения и подрезаем
  const cut = text.split(/[А-ЯЁ]{2,}(?:[ ]+[А-ЯЁ]+)+/)[0].trim() || text.trim()
  return cut.length > 240 ? cut.slice(0, 237).trimEnd() + '…' : cut
}

function SubclassHexExpand({ sc }: { sc: Subclass }) {
  return (
    <Link to={`/subclasses/${sc.id}`} className="hex-expand hex-expand--sub">
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
function SubclassCover({ sc }: { sc: Subclass }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(sc.image_gallery)
  if (!src || broken) {
    return (
      <span className="hex-cover hex-cover--empty">
        <Shield aria-hidden="true" />
      </span>
    )
  }
  return <img className="hex-cover" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
}

function SubclassHex({ sc, index }: { sc: Subclass; index: number }) {
  const navigate = useNavigate()
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

  const open = () => navigate(`/subclasses/${sc.id}`)

  return (
    <div
      className={`hex-cell-wrap${expanded ? ' is-expanded' : ''}`}
      style={{ animationDelay: `${Math.min(index * 45, 700)}ms` }}
      onMouseEnter={start}
      onMouseLeave={cancel}
    >
      <div className="hex-unit">
        <div className="hex-unit-fill">
          <div
            className="hex-cell"
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
              <SubclassCover sc={sc} />
              <span className="hex-shade" />
              <span className="hex-body">
                <span className="hex-title" title={sc.subclass_name}>{sc.subclass_name}</span>
              </span>
            </span>
          </div>
          <SubclassHexExpand sc={sc} />
        </div>
      </div>
    </div>
  )
}

function SubclassHive({ subclasses }: { subclasses: Subclass[] }) {
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
            <SubclassHex key={sc.id} sc={sc} index={ri * layout.cols + ci} />
          ))}
          {Array.from({ length: pad }, (_, pi) => (
            <span key={`pad-${pi}`} className="hex-cell-wrap hex-cell-wrap--spacer" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  )
}

function ClassDetailPortrait({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="class-detail-portrait">
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          style={{ viewTransitionName: 'class-hero-img' } as CSSProperties}
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

export function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: c, error } = useOne<GameClass>('classes', id)
  const [subclasses, setSubclasses] = useState<Subclass[]>([])

  useEffect(() => {
    if (!id) return
    setSubclasses([])
    getSubList<Subclass>('classes', id, 'subclasses').then(setSubclasses).catch(() => {})
  }, [id])

  const isHtml = useMemo(() => isHtmlDescription(c?.description), [c?.description])
  const table = useMemo(() => (isHtml ? null : parseClassTable(c?.description)), [c?.description, isHtml])
  const descText = useMemo(() => (isHtml ? '' : stripClassTable(c?.description)), [c?.description, isHtml])
  const subsRef = useRef<HTMLDivElement>(null)
  const scrollToSubclasses = () =>
    subsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Выбранный подкласс (?subclass=): его умения вписываются в таблицу/список класса
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSub = useMemo(
    () => subclasses.find((s) => s.id === searchParams.get('subclass')) ?? null,
    [subclasses, searchParams],
  )
  const subclassSection = useMemo(
    () =>
      selectedSub && isHtml && c?.description
        ? extractSubclassHtml(c.description, selectedSub.subclass_name)
        : null,
    [selectedSub, isHtml, c?.description],
  )
  const subclassFeatures = useMemo(
    () => (subclassSection ? parseSubclassFeatures(subclassSection) : undefined),
    [subclassSection],
  )
  const clearSubclass = () => {
    const p = new URLSearchParams(searchParams)
    p.delete('subclass')
    setSearchParams(p, { replace: true })
  }

  if (error) return <p className="status-line is-error">Класс не найден: {error}</p>
  if (!c) return <p className="status-line">Листаем хроники орденов…</p>

  const dieType = hitDieType(c.hit_dice)

  return (
    <section className="book-page class-detail-page">
      <Link to="/classes" className="back-link">
        <ArrowLeft aria-hidden="true" /> к классам
      </Link>

      <header className={`class-detail-hero${c.is_caster ? ' is-caster' : ' is-martial'}`}>
        <div className="class-detail-stage">
          <div className="class-detail-aura" aria-hidden="true" />
          <img
            className="class-detail-die"
            src={DIE_NUM_IMAGE_URLS[dieType]}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <ClassDetailPortrait src={realImage(c.image_gallery)} alt={c.class_name} />

          <div className="class-detail-meta">
            <h1 className="class-detail-name-plate" style={{ viewTransitionName: 'class-hero-title' } as CSSProperties}>
              {c.class_name}
            </h1>
            <div className="card-chips class-detail-chips">
              <Chip icon={<DieChipIcon type={dieType} />}>к{c.hit_dice} хитов</Chip>
              {c.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
              {c.saving_throw_proficiencies?.length ? (
                <Chip icon={Shield}>{c.saving_throw_proficiencies.join(', ')}</Chip>
              ) : null}
            </div>
          </div>

          {selectedSub && (
            <div className="class-detail-subhex">
              <Link
                to={`/subclasses/${selectedSub.id}`}
                className="detail-hex detail-hex--sm"
                title={selectedSub.subclass_name}
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
              <span className="class-detail-subhex-name">{selectedSub.subclass_name}</span>
              <button type="button" className="class-detail-subhex-clear" onClick={clearSubclass}>
                <X aria-hidden="true" /> убрать
              </button>
            </div>
          )}
        </div>
      </header>

      <Divider />

      <div className="stat-rows">
        <StatRow label="Доспехи" value={c.armor_proficiencies?.join(', ')} />
        <StatRow label="Оружие" value={c.weapon_proficiencies?.join(', ')} />
      </div>
      {c.is_caster && (
        <Link to={`/spells?class=${encodeURIComponent(c.class_name.toLowerCase())}`} className="spell-cta">
          <Sparkles aria-hidden="true" />
          Заклинания класса
        </Link>
      )}
      {isHtml ? (
        <section className="detail-section">
          <ClassArticle html={c.description!} subclassFeatures={subclassFeatures} />
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
      {subclassSection && selectedSub && (
        <section className="detail-section">
          <div className="subclass-inject-head">
            <h2 className="detail-subtitle gold-text">Умения подкласса — {selectedSub.subclass_name}</h2>
            <button type="button" className="class-detail-subhex-clear" onClick={clearSubclass}>
              <X aria-hidden="true" /> убрать
            </button>
          </div>
          <ClassArticle html={subclassSection} cutSubclasses={false} />
        </section>
      )}
      {subclasses.length > 0 && (
        <div ref={subsRef}>
          <DetailSection title={`${SUBCLASS_GROUP_LABEL[c.class_name] ?? 'Подклассы'} — ${subclasses.length}`}>
            <SubclassHive subclasses={subclasses} />
          </DetailSection>
        </div>
      )}
    </section>
  )
}

/* ============================================================
   РАСА
   ============================================================ */

export function RaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: r, error } = useOne<Race>('races', id)
  const [subraces, setSubraces] = useState<Subrace[]>([])

  useEffect(() => {
    if (!id) return
    setSubraces([])
    getSubList<Subrace>('races', id, 'subraces').then(setSubraces).catch(() => {})
  }, [id])

  if (error) return <p className="status-line is-error">Раса не найдена: {error}</p>
  if (!r) return <p className="status-line">Изучаем родословные…</p>

  const abilities = Object.entries(r.increase_ability_scores ?? {})
    .map(([k, v]) => `${ABILITY_RU[k] ?? k} +${v}`)
    .join(', ')
  const speeds = [
    `${r.speed} фт.`,
    r.flight_speed > 0 && `полёт ${r.flight_speed} фт.`,
    r.swimming_speed > 0 && `плавание ${r.swimming_speed} фт.`,
    r.climbing_speed > 0 && `лазание ${r.climbing_speed} фт.`,
  ].filter(Boolean).join(', ')

  return (
    <DetailShell
      backTo="/races"
      backLabel="к расам"
      kicker={r.race_type ? `вид: ${r.race_type}` : 'раса'}
      title={r.race_name}
      image={realImage(r.image_gallery)}
      imageIcon={VenetianMask}
      chips={
        <>
          {r.size && <Chip icon={Ruler}>{r.size}</Chip>}
          <Chip icon={Footprints}>{speeds}</Chip>
          {r.darkvision > 0 && <Chip icon={Eye}>тёмное зрение {r.darkvision} фт.</Chip>}
          {abilities && <Chip icon={Star}>{abilities}</Chip>}
        </>
      }
    >
      <div className="stat-rows">
        <StatRow label="Языки" value={r.languages?.join(', ')} />
        <StatRow
          label="Возраст"
          value={
            r.max_age
              ? `зрелость к ${r.age_of_adulthood ?? '—'}, живут до ${r.max_age}`
              : null
          }
        />
      </div>
      <DetailSection title="Описание">
        <Rich text={r.description} />
      </DetailSection>
      {subraces.length > 0 && (
        <DetailSection title={`Подрасы — ${subraces.length}`}>
          <div className="subclass-grid">
            {subraces.map((sr) => {
              const subAbilities = Object.entries(sr.increase_ability_scores ?? {})
                .map(([k, v]) => `${ABILITY_RU[k] ?? k} +${v}`)
                .join(', ')
              return (
                <Link key={sr.id} to={`/subraces/${sr.id}`} className="card-slot">
                  <article className="card">
                    <h3 className="card-name">{sr.subrace_name}</h3>
                    <div className="card-chips">
                      {subAbilities && <Chip icon={Star}>{subAbilities}</Chip>}
                      {sr.darkvision_override != null && <Chip icon={Eye}>тьма {sr.darkvision_override} фт.</Chip>}
                    </div>
                    <TermDesc text={sr.traits ?? sr.description} />
                  </article>
                </Link>
              )
            })}
          </div>
        </DetailSection>
      )}
    </DetailShell>
  )
}

/* ============================================================
   ПОДКЛАСС
   ============================================================ */

export function SubclassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: sc, error } = useOne<Subclass>('subclasses', id)
  const book = useBookRef(sc?.book_source_id)
  const { data: parent } = useOne<GameClass>('classes', sc?.parent_class_id)

  // Богатую разметку подкласса (таблицы, списки, умения) берём из HTML
  // родительского класса — там лежит полная секция каждого подкласса.
  const subclassHtml = useMemo(() => {
    if (!parent?.description || !sc?.subclass_name || !isHtmlDescription(parent.description)) return null
    return extractSubclassHtml(parent.description, sc.subclass_name)
  }, [parent?.description, sc?.subclass_name])

  if (error) return <p className="status-line is-error">Подкласс не найден: {error}</p>
  if (!sc) return <p className="status-line">Листаем хроники ордена…</p>

  return (
    <DetailShell
      backTo={`/classes/${sc.parent_class_id}`}
      backLabel={parent ? `к классу «${parent.class_name}»` : 'к классу'}
      kicker={sc.subclass_flavor ?? 'подкласс'}
      title={sc.subclass_name}
      image={null}
      heroHex={realImage(sc.image_gallery)}
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
          <ClassArticle html={subclassHtml} cutSubclasses={false} />
        </section>
      ) : (
        <DetailSection title="Описание">
          <Rich text={sc.description} />
        </DetailSection>
      )}
    </DetailShell>
  )
}

/* ============================================================
   ПОДРАСА
   ============================================================ */

export function SubraceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: sr, error } = useOne<Subrace>('subraces', id)
  const book = useBookRef(sr?.book_source_id)
  const { data: parent } = useOne<Race>('races', sr?.parent_race_id)
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
      {sr.description && (
        <DetailSection title="Описание">
          <Rich text={sr.description} />
        </DetailSection>
      )}
      {showTraits && (
        <DetailSection title="Черты">
          <Rich text={sr.traits} />
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

export function BackgroundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: bg, error } = useOne<Background>('backgrounds', id)
  const book = useBookRef(bg?.book_source_id)
  if (error) return <p className="status-line is-error">Предыстория не найдена: {error}</p>
  if (!bg) return <p className="status-line">Листаем летопись…</p>

  return (
    <DetailShell
      backTo="/backgrounds"
      backLabel="к предысториям"
      kicker="предыстория"
      title={bg.background_name}
      image={realImage(bg.image_gallery)}
      imageIcon={Landmark}
      chips={
        <>
          <SourceBadge book={book} />
          {bg.skill_proficiencies?.map((s) => <Chip key={s} icon={Star}>{s}</Chip>)}
          {bg.tool_proficiencies?.map((t) => <Chip key={t} icon={Shield}>{t}</Chip>)}
        </>
      }
    >
      {bg.languages && bg.languages.length > 0 && (
        <DetailSection title="Языки">
          <div className="card-chips">
            {bg.languages.map((l) => <Chip key={l} icon={Users}>{l}</Chip>)}
          </div>
        </DetailSection>
      )}
      {bg.equipment && (
        <DetailSection title="Снаряжение">
          <Rich text={bg.equipment} />
        </DetailSection>
      )}
      {bg.feature_name && (
        <DetailSection title={bg.feature_name}>
          <Rich text={bg.feature_description ?? bg.description} />
        </DetailSection>
      )}
      {bg.description && (
        <DetailSection title="Описание">
          <Rich text={bg.description} />
        </DetailSection>
      )}
    </DetailShell>
  )
}

/* ============================================================
   ЧЕРТА
   ============================================================ */

export function FeatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: f, error } = useOne<Feat>('feats', id)
  const book = useBookRef(f?.book_source_id)
  if (error) return <p className="status-line is-error">Черта не найдена: {error}</p>
  if (!f) return <p className="status-line">Листаем свод дарований…</p>

  const abilities = Object.entries(f.increase_ability_scores ?? {})
    .map(([k, v]) => `${ABILITY_RU[k] ?? k} +${v}`)
    .join(', ')

  return (
    <DetailShell
      backTo="/feats"
      backLabel="к чертам"
      kicker="черта"
      title={f.feat_name}
      image={realImage(f.image_gallery)}
      imageIcon={Award}
      chips={
        <>
          <SourceBadge book={book} />
          {abilities && <Chip icon={Star}>{abilities}</Chip>}
        </>
      }
    >
      {f.prerequisite && <p className="detail-note">Требование: {f.prerequisite}</p>}
      <DetailSection title="Описание">
        <Rich text={f.description} />
      </DetailSection>
    </DetailShell>
  )
}

/* ============================================================
   ПРЕДМЕТ
   ============================================================ */

function ItemArt({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="item-art">
      <span className="item-glow" aria-hidden="true" />
      {src && !broken ? (
        <img src={src} alt={alt} onError={() => setBroken(true)} />
      ) : (
        <Gem className="item-art-fallback" aria-hidden="true" />
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

  const gp = it.cost_copper ? Math.round(it.cost_copper / 100) : null
  const rarity = rarityKeyOf(it.rarity)

  return (
    <section className="book-page item-page">
      <Link to="/items" className="back-link">
        <ArrowLeft aria-hidden="true" /> к сокровищнице
      </Link>

      {/* центрированный герой: крупный арт со свечением редкости сзади и снизу */}
      <div className="item-hero" data-rarity={rarity}>
        <ItemArt src={realImage(it.item_image_gallery)} alt={it.item_name} />
        <span className="setting-kicker item-kicker">{it.item_type ?? 'магический предмет'}</span>
        <h1 className="book-title gold-text item-title">{it.item_name}</h1>
        <div className="card-chips item-chips">
          <SourceBadge book={book} />
          {it.rarity && <Chip icon={Gem}>{it.rarity}</Chip>}
          {it.attunement_required && <Chip icon={Sparkles}>требует настройки</Chip>}
          {gp != null && gp > 0 && <Chip icon={Coins}>{gp.toLocaleString('ru')} зм</Chip>}
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
