import { useState } from 'react'
import {
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react'
import {
  ABILITY_RU,
  descriptionPreview,
  realImage,
} from '../../../api'
import type {
  Book,
  Feat,
} from '../../../api'
import { Img } from '../../../media'
import { Chip, SourceBadge } from '../shared'
import { SoftTitle } from './BackgroundParts'

/** Ряд плашек характеристик, которые повышает черта (аналог EquipmentIconRow у предысторий). */
function FeatAbilityRow({ scores }: { scores: Record<string, number> | null | undefined }) {
  const entries = Object.entries(scores ?? {})
  if (entries.length === 0) return null

  return (
    <div className="fa-row">
      {entries.map(([k, v]) => (
        <span className="fa-tile" key={k}>
          {ABILITY_RU[k] ?? k}
          <b>+{v}</b>
        </span>
      ))}
    </div>
  )
}

export function FeatCard({ f, book }: { f: Feat; book: Book | undefined }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(f.image_gallery)
  const preview = descriptionPreview(f.description, 150)

  return (
    <article className="card card--feat">
      <div className="feat-card-art" aria-hidden={!src}>
        {src && !broken ? (
          <Img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Sparkles className="feat-card-art-fallback" aria-hidden="true" />
        )}
      </div>
      <div className="feat-card-body">
        <div className="bg-card-head">
          <SoftTitle text={f.feat_name} />
          <SourceBadge book={book} />
        </div>
        {preview && <p className="bg-card-desc">{preview}</p>}
        {f.prerequisite && (
          <div className="card-chips bg-card-skills">
            <Chip icon={Shield}>треб.: {f.prerequisite}</Chip>
          </div>
        )}
        <div className="bg-card-foot">
          <FeatAbilityRow scores={f.increase_ability_scores} />
          <span className="bg-card-go">
            перейти <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  )
}
