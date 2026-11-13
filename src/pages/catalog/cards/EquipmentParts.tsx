import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Img } from '../../../media'

/** Арт снаряжения в карточке сетки: картинка или иконка категории. */
export function EquipmentCardArt({ src, alt, fallback: Icon }: { src: string | null; alt: string; fallback: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="eq-card-art">
      {src && !broken ? (
        <Img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon className="eq-card-fallback" aria-hidden="true" />
      )}
    </span>
  )
}
