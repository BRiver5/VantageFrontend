import { useState } from 'react'
import {
  Skull,
} from 'lucide-react'
import { Img } from '../../../media'

/**
 * Портрет существа. Вырезанные PNG (наши `/media/`) стоят «в полный рост», как
 * у рас; картинки dnd.su — с фоном, их показываем в окне с мягким краем.
 */
export function CreaturePortrait({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  const framed = !!src && !src.includes('/media/')
  return (
    <div className={`class-card-portrait${framed ? ' creature-portrait--framed' : ''}`}>
      {src && !broken ? (
        <Img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Skull className="class-card-fallback" aria-hidden="true" />
      )}
    </div>
  )
}
