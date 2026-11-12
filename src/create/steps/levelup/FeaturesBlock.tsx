/** Умения этого уровня: класса и подкласса */
import { Swords } from 'lucide-react'
import type { CharacterDraft } from '../../draft'
import { featureText } from '../../featureText'
import type { LevelRequirements } from './LevelParts'

export function FeaturesBlock({ req, draft, className }: { req: LevelRequirements; draft: CharacterDraft; className: string }) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <Swords aria-hidden="true" /> Умения этого уровня
      </h4>
      <ul className="cw-features">
        {req.classFeatures.map((f) => (
          <li key={`c-${f.name}`} className="cw-feature">
            <b>{f.name}</b>
            <span>{featureText(f.html, f.name, className, 260)}</span>
          </li>
        ))}
        {req.subFeatures.map((f) => (
          <li key={`s-${f.name}`} className="cw-feature cw-feature--sub">
            <b>{f.name}</b>
            <span>{featureText(f.html, f.name, draft.subclass?.subclass_name ?? className, 260)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
