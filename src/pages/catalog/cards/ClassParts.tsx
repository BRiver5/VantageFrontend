import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Swords,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  isFramedArt,
} from '../../../api'
import { Img } from '../../../media'

export function ClassCardPortrait({
  src,
  alt,
  fallback: Fallback = Swords,
  imgStyle,
}: {
  src: string | null
  alt: string
  fallback?: LucideIcon
  imgStyle?: CSSProperties
}) {
  const [broken, setBroken] = useState(false)
  const framed = isFramedArt(src)
  return (
    <div className={`class-card-portrait${framed ? ' creature-portrait--framed' : ''}`}>
      {src && !broken ? (
        <Img src={src} alt={alt} loading="lazy" style={imgStyle} onError={() => setBroken(true)} />
      ) : (
        <Fallback className="class-card-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

export function ClassCardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ccs-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
