/** Выбор подкласса */
import { Shield } from 'lucide-react'
import { realImage } from '../../../api'
import type { Subclass } from '../../../api'
import { Img } from '../../../media'
import type { CharacterDraft, DraftUpdate } from '../../draft'
import type { ClassBundle } from '../../useClassBundle'
import { MoreTab } from '../ui'

type Props = {
  draft: CharacterDraft
  update: DraftUpdate
  bundle: ClassBundle | null
  setSubDetails: (sub: Subclass) => void
}

export function SubclassBlock({ draft, update, bundle, setSubDetails }: Props) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <Shield aria-hidden="true" /> Подкласс
      </h4>
      <div className="cw-subclasses">
        {bundle?.subs.map((sub: Subclass) => {
          const art = realImage(sub.image_gallery)
          const on = draft.subclass?.id === sub.id
          return (
            <div key={sub.id} className="cw-pick-slot cw-pick-slot--sub">
              <button
                type="button"
                className={`cw-subclass${on ? ' is-on' : ''}`}
                onClick={() => update({ subclass: sub })}
                aria-pressed={on}
              >
                {art ? (
                  <Img src={art} alt="" loading="lazy" className="cw-subclass-art" />
                ) : (
                  <span className="cw-subclass-art cw-subclass-art--empty">
                    <Shield aria-hidden="true" />
                  </span>
                )}
                <span className="cw-subclass-name">{sub.subclass_name}</span>
                {sub.subclass_flavor && (
                  <span className="cw-subclass-flavor">{sub.subclass_flavor}</span>
                )}
              </button>
              <MoreTab onClick={() => setSubDetails(sub)} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
