/** Раздел «Кошелёк»: монеты героя */
import { Coins } from 'lucide-react'
import { CoinImg } from '../../../coins'
import type { Character } from '../../../types/character'
import { EdField, EdSection, Stepper } from '../../editorFields'
import { COINS } from '../editorData'

export function PurseSection({ c, set }: { c: Character; set: (patch: Partial<Character>) => void }) {
  return (
    <EdSection id="purse" icon={Coins} title="Кошелёк" lead="Монеты героя; предметы — в инвентаре на листе.">
      <div className="ed-grid ed-grid--coins">
        {COINS.map(([key, label]) => (
          <EdField key={key} label={label} hint={<CoinImg currency={key} size={16} />}>
            <Stepper
              value={c.inventory.currency[key]}
              min={0}
              max={9999999}
              onChange={(v) => set({ inventory: { ...c.inventory, currency: { ...c.inventory.currency, [key]: v } } })}
            />
          </EdField>
        ))}
      </div>
    </EdSection>
  )
}
