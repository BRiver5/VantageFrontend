/** Дарованные заклинания: от расы и подкласса */
import { Sparkles } from 'lucide-react'
import type { GrantedSpell } from '../../grantedSpells'

export function GrantedBlock({ grantedNow }: { grantedNow: GrantedSpell[] }) {
  return (
    <section className="cw-block">
      <h4 className="cw-block-title">
        <Sparkles aria-hidden="true" /> Дарованные заклинания
      </h4>
      <div className="cw-granted">
        {grantedNow.map((g) => (
          <span key={g.spell.id} className={`cw-granted-item cw-granted-item--${g.origin}`}>
            <span className="cw-sp-circle">{g.spell.spell_level === 0 ? '◈' : g.spell.spell_level}</span>
            <span className="cw-granted-text">
              <b>{g.spell.spell_name}</b>
              <i>
                {g.origin === 'race'
                  ? `доступно от расы${g.spell.spell_level === 0 ? ' · заговор' : ' · раз в продолжительный отдых'}`
                  : `от подкласса «${g.from}» · всегда подготовлено`}
              </i>
            </span>
          </span>
        ))}
      </div>
    </section>
  )
}
