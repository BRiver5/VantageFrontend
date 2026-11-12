import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Fingerprint,
  Skull,
} from 'lucide-react'
import type { Creature } from '../api'
import { Img, bgUrl } from '../media'
import { AbilityRose } from './AbilityRose'
import { ArmorCard, HitPointsCard, MovementCard } from './DefenseCards'

/** Арт мира кампании, растворяющийся за верхом страницы */
export function WorldBackdrop({ art }: { art: string }) {
  return (
    <div className="beast-world" aria-hidden="true">
      <span className="beast-world-bg" style={{ backgroundImage: `url("${bgUrl(art)}")` }} />
    </div>
  )
}

function UniqueMark({ npc }: { npc: boolean }) {
  return (
    <span className="beast-unique" tabIndex={0} aria-label="Уникальный персонаж">
      <Fingerprint aria-hidden="true" />
      <span className="beast-unique-tip" role="tooltip">
        <b>Уникальный персонаж</b>
        {npc
          ? 'Именной НПС: в мире он один, со своей историей и ролью в сюжете — это не типовое существо.'
          : 'Существует в единственном экземпляре — это не типовое существо, а конкретная личность.'}
      </span>
    </span>
  )
}

export function CreatureStage({
  c,
  image,
  kicker,
  cr,
  chips,
}: {
  c: Creature
  image: string | null
  kicker: string
  cr: string
  chips: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  return (
    <header className="beast-stage">
      <aside className="beast-stage-left">
        <ArmorCard ac={c.ac} source={c.ac_source} />
        <HitPointsCard hp={c.hp} formula={c.hp_formula} />
        <MovementCard c={c} />
      </aside>

      <div className="beast-stage-center">
        <div className="beast-art">
          <span className="beast-art-aura" aria-hidden="true" />
          <svg className="beast-art-sigil" viewBox="0 0 200 200" aria-hidden="true">
            <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
            <polygon points="100,22 167,61 167,139 100,178 33,139 33,61" />
            <polygon points="100,6 167,139 33,139" />
            <polygon points="100,194 33,61 167,61" />
          </svg>
          <span className="beast-art-floor" aria-hidden="true" />
          {image && !broken ? (
            <Img
              src={image}
              alt={c.name}
              style={{ viewTransitionName: 'class-hero-img' } as CSSProperties}
              onError={() => setBroken(true)}
            />
          ) : (
            <Skull className="beast-art-fallback" aria-hidden="true" />
          )}
        </div>

        <div className="beast-nameplate">
          <span className="hex-badge beast-cr" title="показатель опасности">
            <span className="hex-badge-inner">
              <b>{cr}</b>
              <i>ПО</i>
            </span>
          </span>
          <div className="beast-nameplate-text">
            <div className="beast-name-row">
              <h1 className="book-title gold-text" style={{ viewTransitionName: 'class-hero-title' } as CSSProperties}>
                {c.name}
              </h1>
              {c.is_unique && <UniqueMark npc={c.is_npc} />}
            </div>
            <span className="beast-kicker">{kicker}</span>
          </div>
        </div>
        <div className="card-chips beast-chips">{chips}</div>
      </div>

      <aside className="beast-stage-right">
        <AbilityRose c={c} />
      </aside>
    </header>
  )
}
