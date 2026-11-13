import { useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Gem,
  Scale,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  realImage,
} from '../../api'
import type {
  Item,
} from '../../api'
import { Divider } from '../../ornaments'
import { SourceBadge } from '../catalog/shared'
import { PriceMark } from '../../coins'
import { Img } from '../../media'
import { Chip, DetailSection, Rich } from './shared'
import { rarityKeyOf, useBookRef, useOne } from './hooks'

export function ItemArt({
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
        <Img src={src} alt={alt} onError={() => setBroken(true)} />
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
      <ReviewsPanel entity="items" id={it.id} />
    </section>
  )
}
