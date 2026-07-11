import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Coins,
  Dices,
  Eye,
  Footprints,
  Gem,
  Hourglass,
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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ABILITY_RU,
  cleanDescription,
  formatCR,
  getOne,
  getSubList,
  realImage,
} from '../api'
import type { Book, Creature, CreatureTrait, GameClass, Item, Race, Spell, Subclass, Subrace } from '../api'
import { Corners, Divider } from '../ornaments'
import { SourceBadge } from './CatalogPage'

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
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    setData(null)
    setError(null)
    getOne<T>(resource, id)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [resource, id])
  return { data, error }
}

/** Лёгкая разметка описаний: абзацы + **жирный** / ***жирный*** */
function Rich({ text }: { text: string | null | undefined }) {
  const clean = cleanDescription(text)
  if (!clean) return null
  return (
    <div className="rich">
      {clean.split(/\n+/).map((para, i) => (
        <p key={i}>
          {para.split(/\*{2,3}([^*]+)\*{2,3}/g).map((part, j) =>
            j % 2 ? <b key={j}>{part}</b> : part,
          )}
        </p>
      ))}
    </div>
  )
}

function Chip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="chip">
      <Icon aria-hidden="true" />
      {children}
    </span>
  )
}

/** Общая «обложка» детальной страницы */
function DetailShell({
  backTo,
  backLabel,
  kicker,
  title,
  image,
  imageIcon: ImageIcon,
  badge,
  chips,
  children,
}: {
  backTo: string
  backLabel: string
  kicker: string | null
  title: string
  image: string | null
  imageIcon: LucideIcon
  badge?: ReactNode
  chips: ReactNode
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
        <div className="book-cover detail-plate">
          {image && !broken ? (
            <img src={image} alt={title} onError={() => setBroken(true)} />
          ) : (
            <ImageIcon className="detail-plate-fallback" aria-hidden="true" />
          )}
        </div>
        <div className="book-meta">
          {kicker && <span className="setting-kicker">{kicker}</span>}
          <div className="detail-title-row">
            {badge}
            <h1 className="book-title gold-text">{title}</h1>
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
  if (!list || list.length === 0) return null
  return (
    <div className="trait-list">
      {list.map((t, i) => {
        const name = (t.name ?? t.title ?? Object.values(t)[0] ?? '') as string
        const desc = (t.description ?? t.desc ?? Object.values(t)[1] ?? '') as string
        return (
          <div key={i} className="trait">
            <b>{name}.</b> {desc}
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
          {c.proficiency_bonus != null && <Chip icon={Dices}>бонус мастерства +{c.proficiency_bonus}</Chip>}
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

export function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: c, error } = useOne<GameClass>('classes', id)
  const [subclasses, setSubclasses] = useState<Subclass[]>([])

  useEffect(() => {
    if (!id) return
    setSubclasses([])
    getSubList<Subclass>('classes', id, 'subclasses').then(setSubclasses).catch(() => {})
  }, [id])

  if (error) return <p className="status-line is-error">Класс не найден: {error}</p>
  if (!c) return <p className="status-line">Листаем хроники орденов…</p>

  return (
    <DetailShell
      backTo="/classes"
      backLabel="к классам"
      kicker="класс"
      title={c.class_name}
      image={realImage(c.image_gallery)}
      imageIcon={Swords}
      chips={
        <>
          <Chip icon={Dices}>кость хитов к{c.hit_dice}</Chip>
          {c.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
          {c.saving_throw_proficiencies?.length ? (
            <Chip icon={Shield}>спасброски: {c.saving_throw_proficiencies.join(', ')}</Chip>
          ) : null}
        </>
      }
    >
      <div className="stat-rows">
        <StatRow label="Доспехи" value={c.armor_proficiencies?.join(', ')} />
        <StatRow label="Оружие" value={c.weapon_proficiencies?.join(', ')} />
      </div>
      <DetailSection title="Описание">
        <Rich text={c.description} />
      </DetailSection>
      {subclasses.length > 0 && (
        <DetailSection title={`Подклассы — ${subclasses.length}`}>
          <div className="subclass-grid">
            {subclasses.map((sc) => (
              <Link key={sc.id} to={`/subclasses/${sc.id}`} className="card-slot">
                <article className="card">
                  <h3 className="card-name">{sc.subclass_name}</h3>
                  {sc.subclass_flavor && <span className="card-kicker">{sc.subclass_flavor}</span>}
                  <div className="card-chips">
                    {sc.level_available != null && <Chip icon={Star}>с {sc.level_available} уровня</Chip>}
                    {sc.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
                  </div>
                  <p className="card-desc">{cleanDescription(sc.description)}</p>
                </article>
              </Link>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailShell>
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
                    <p className="card-desc">{cleanDescription(sr.traits ?? sr.description)}</p>
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
  if (error) return <p className="status-line is-error">Подкласс не найден: {error}</p>
  if (!sc) return <p className="status-line">Листаем хроники ордена…</p>

  return (
    <DetailShell
      backTo={`/classes/${sc.parent_class_id}`}
      backLabel={parent ? `к классу «${parent.class_name}»` : 'к классу'}
      kicker={sc.subclass_flavor ?? 'подкласс'}
      title={sc.subclass_name}
      image={null}
      imageIcon={Shield}
      chips={
        <>
          <SourceBadge book={book} />
          {sc.level_available != null && <Chip icon={Star}>с {sc.level_available} уровня</Chip>}
          {sc.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
        </>
      }
    >
      <DetailSection title="Описание">
        <Rich text={sc.description} />
      </DetailSection>
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
   ПРЕДМЕТ
   ============================================================ */

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: it, error } = useOne<Item>('items', id)
  const book = useBookRef(it?.item_source)
  if (error) return <p className="status-line is-error">Предмет не найден: {error}</p>
  if (!it) return <p className="status-line">Открываем сокровищницу…</p>

  const gp = it.cost_copper ? Math.round(it.cost_copper / 100) : null

  return (
    <DetailShell
      backTo="/items"
      backLabel="к сокровищнице"
      kicker={it.item_type ?? 'магический предмет'}
      title={it.item_name}
      image={realImage(it.item_image_gallery)}
      imageIcon={Gem}
      chips={
        <>
          <SourceBadge book={book} />
          {it.rarity && <Chip icon={Gem}>{it.rarity}</Chip>}
          {it.attunement_required && <Chip icon={Sparkles}>требует настройки</Chip>}
          {gp != null && gp > 0 && <Chip icon={Coins}>{gp.toLocaleString('ru')} зм</Chip>}
          {it.weight != null && it.weight > 0 && <Chip icon={Scale}>{it.weight} фнт.</Chip>}
        </>
      }
    >
      <DetailSection title="Описание">
        <Rich text={it.description} />
      </DetailSection>
    </DetailShell>
  )
}
