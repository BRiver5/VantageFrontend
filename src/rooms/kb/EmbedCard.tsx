/**
 * Карточки @Embed[вид:id]: предмет, снаряжение, существо или заклинание из
 * каталога — коротко, в одну карточку. Страницы встраивает Markdown.tsx.
 */
import { useEffect, useState } from 'react'
import { Backpack, Dices, Gem, Skull, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCachedEntity, getOne } from '../../api/catalog'
import { Img } from '../../media'
import type { EmbedKind } from './mdparse'
import { formatCopper } from './money'

type CatalogKind = Exclude<EmbedKind, 'page'>

const RESOURCE: Record<CatalogKind, string> = { item: 'items', equipment: 'equipment', creature: 'creatures', spell: 'spells', table: '' }
const ICON: Record<CatalogKind, LucideIcon> = { item: Gem, equipment: Backpack, creature: Skull, spell: Sparkles, table: Dices }
const LABEL: Record<CatalogKind, string> = { item: 'Предмет', equipment: 'Снаряжение', creature: 'Существо', spell: 'Заклинание', table: 'Таблица' }

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Описание без разметки: для карточки хватит пары строк */
const brief = (v: unknown, max = 220) => {
  const t = str(v)
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t && t.length > max ? `${t.slice(0, max - 1)}…` : (t ?? null)
}
const firstImage = (...lists: unknown[]) => {
  for (const l of lists) if (Array.isArray(l) && typeof l[0] === 'string') return l[0] as string
  return null
}
const fraction = (cr: number) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr))

function describe(kind: CatalogKind, d: Row): { title: string; facts: string[]; text: string | null; image: string | null } {
  if (kind === 'spell') {
    const level = num(d.spell_level)
    return {
      title: str(d.spell_name) ?? 'Заклинание',
      facts: [level ? `${level} круг` : 'заговор', str(d.school), str(d.casting_time), str(d.range), d.concentration ? 'концентрация' : null].filter(Boolean) as string[],
      text: brief(d.description),
      image: null,
    }
  }
  if (kind === 'creature') {
    const cr = num(d.challenge_rating)
    return {
      title: str(d.name) ?? 'Существо',
      facts: [str(d.size), str(d.creature_type), num(d.ac) != null ? `КД ${d.ac}` : null, num(d.hp) != null ? `хиты ${d.hp}` : null, cr != null ? `ПО ${fraction(cr)}` : null].filter(Boolean) as string[],
      text: brief(d.creature_description ?? d.description),
      image: firstImage(d.image_gallery, d.image_url),
    }
  }
  const cost = num(d.cost_copper)
  if (kind === 'item') {
    return {
      title: str(d.item_name) ?? 'Предмет',
      facts: [str(d.item_type), str(d.rarity), d.attunement_required ? 'настройка' : null, cost ? formatCopper(cost) : null].filter(Boolean) as string[],
      text: brief(d.description),
      image: firstImage(d.item_image_gallery),
    }
  }
  return {
    title: str(d.equipment_name) ?? 'Снаряжение',
    facts: [str(d.subcategory) ?? str(d.category), num(d.weight) ? `${d.weight} фнт` : null, cost ? formatCopper(cost) : null].filter(Boolean) as string[],
    text: brief(d.description),
    image: firstImage(d.equipment_image_gallery),
  }
}

/** Карточка каталога по id; table — заглушка до модуля таблиц случайностей */
export function EmbedCard({ kind, id }: { kind: CatalogKind; id: string }) {
  const resource = RESOURCE[kind]
  const [data, setData] = useState<Row | null>(() => (resource ? getCachedEntity<Row>(resource, id) : null))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!resource || data) return
    let alive = true
    getOne<Row>(resource, id).then(
      (d) => alive && setData(d),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [resource, id, data])
  const Icon = ICON[kind]
  if (!resource || failed) {
    return (
      <span className="kb-card is-missing">
        <Icon aria-hidden="true" />
        <span>{kind === 'table' ? 'Таблица случайностей появится здесь, когда модуль таблиц будет подключён' : `${LABEL[kind]} не найден`}</span>
      </span>
    )
  }
  if (!data) {
    return (
      <span className="kb-card is-loading">
        <Icon aria-hidden="true" />
        <span>Достаём из каталога…</span>
      </span>
    )
  }
  const v = describe(kind, data)
  return (
    <span className={`kb-card is-${kind}`}>
      <span className="kb-card-art">{v.image ? <Img src={v.image} alt="" loading="lazy" /> : <Icon aria-hidden="true" />}</span>
      <span className="kb-card-main">
        <span className="kb-card-kind">{LABEL[kind]}</span>
        <b className="kb-card-title">{v.title}</b>
        {v.facts.length > 0 && <span className="kb-card-facts">{v.facts.join(' · ')}</span>}
        {v.text && <span className="kb-card-text">{v.text}</span>}
      </span>
    </span>
  )
}
