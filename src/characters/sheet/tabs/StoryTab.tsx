import type { ReactNode } from 'react'
import { Camera } from 'lucide-react'
import type { SheetView } from '../../../types/character'
import { HeroPortrait } from '../parts'

/** Страница характера: большой портрет во весь рост и всё о внешности */
export function StoryTab({
  info,
  portrait,
  fallbackPortrait,
  onPortraitClick,
  persona,
}: {
  info: SheetView['basic_info']
  portrait: string | null
  fallbackPortrait: string | null
  onPortraitClick?: () => void
  persona: ReactNode
}) {
  const looks = (
    [
      ['Раса', info.subrace?.name ?? info.race.name],
      ['Предыстория', info.background?.name],
      ['Мировоззрение', info.alignment],
      ['Пол', info.gender],
      ['Возраст', info.age != null ? String(info.age) : ''],
      ['Рост', info.height],
      ['Вес', info.weight],
      ['Глаза', info.eyes],
      ['Волосы', info.hair],
      ['Кожа', info.skin],
    ] as const
  ).filter(([, v]) => v && String(v).trim())

  return (
    <div className="cw-story">
      <figure className="cw-story-art">
        <HeroPortrait own={portrait} fallback={fallbackPortrait} />
        {onPortraitClick && (
          <button type="button" className="cw-portrait-edit" onClick={onPortraitClick} title="Сменить портрет">
            <Camera aria-hidden="true" />
          </button>
        )}
        {looks.length > 0 && (
          <figcaption className="cw-story-looks">
            {looks.map(([label, value]) => (
              <span key={label}>
                <i>{label}</i>
                <b>{value}</b>
              </span>
            ))}
          </figcaption>
        )}
      </figure>
      <div className="cw-story-text">{persona}</div>
    </div>
  )
}
