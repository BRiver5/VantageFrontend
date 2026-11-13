import { useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Landmark,
  Star,
} from 'lucide-react'
import {
  descriptionPreview,
  ellipsizePenultimate,
  realImage,
} from '../../../api'
import type {
  Book,
  Background,
} from '../../../api'
import { ABILITY_LABELS } from '../../../types/character'
import { abilitiesFromSkills } from '../../../skills'
import { EquipmentIconRow } from '../../StartingEquipment'
import { Img } from '../../../media'
import { Chip, SourceBadge } from '../shared'

export function SoftTitle({ text, className = 'card-name' }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [display, setDisplay] = useState(text)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      const width = el.clientWidth
      if (width <= 0) {
        setDisplay(text)
        return
      }
      if (text.length === 0) {
        setDisplay('')
        return
      }
      // на мобиле заголовок может переноситься — умный эллипсис не нужен
      if (getComputedStyle(el).whiteSpace !== 'nowrap') {
        setDisplay(text)
        return
      }
      // бинарный поиск максимальной длины, при которой строка ещё влезает
      let lo = 4
      let hi = text.length
      let best = ellipsizePenultimate(text, hi)
      const prev = el.textContent
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const candidate = ellipsizePenultimate(text, mid)
        el.textContent = candidate
        if (el.scrollWidth <= width + 1) {
          best = candidate
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      el.textContent = prev
      setDisplay(best)
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  return (
    <h3 className={className} ref={ref} title={text}>
      {display}
    </h3>
  )
}

export function BackgroundCard({ bg, book }: { bg: Background; book: Book | undefined }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(bg.image_gallery)
  const preview = descriptionPreview(bg.description, 180)
  const abilities = abilitiesFromSkills(bg.skill_proficiencies)

  return (
    <article className="card card--bg">
      <span className="bg-card-hex" aria-hidden={!src}>
        <span className="bg-card-hex-inner">
          {src && !broken ? (
            <Img
              src={src}
              alt={bg.background_name}
              loading="lazy"
              onError={() => setBroken(true)}
            />
          ) : (
            <Landmark className="bg-card-hex-fallback" aria-hidden="true" />
          )}
        </span>
      </span>
      <div className="bg-card-body">
        <div className="bg-card-head">
          <SoftTitle text={bg.background_name} />
          <SourceBadge book={book} />
        </div>
        {preview && <p className="bg-card-desc">{preview}</p>}
        {abilities.length > 0 && (
          <div className="bg-card-abilities">
            {abilities.map((a) => (
              <span className="bg-ability" key={a}><b>{ABILITY_LABELS[a].abbr}</b></span>
            ))}
          </div>
        )}
        {!!bg.skill_proficiencies?.length && (
          <div className="card-chips bg-card-skills">
            {bg.skill_proficiencies.map((s) => (
              <Chip key={s} icon={Star}>{s}</Chip>
            ))}
          </div>
        )}
        <div className="bg-card-foot">
          <EquipmentIconRow grants={bg.starting_equipment} max={6} />
          <span className="bg-card-go">
            перейти <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  )
}
