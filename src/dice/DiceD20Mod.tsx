import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'

interface DiceD20ModProps {
  open: boolean
  rolling?: boolean
  onToggleOpen: () => void
  onRoll: (mod: 'adv' | 'dis') => void
}

export default function DiceD20Mod({ open, rolling, onToggleOpen, onRoll }: DiceD20ModProps) {
  return (
    <div className={`dice-d20-mod${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="dice-d20-mod-toggle dice-hex-btn dice-hex-btn--sm"
        onClick={onToggleOpen}
        title={open ? 'Свернуть' : 'Преимущество / помеха'}
        aria-label={open ? 'Свернуть преимущество и помеху' : 'Развернуть преимущество и помеху'}
        aria-expanded={open}
      >
        <ChevronRight size={14} aria-hidden="true" className="dice-d20-mod-chevron" />
      </button>
      <div className="dice-d20-mod-drawer" aria-hidden={!open}>
        <button
          type="button"
          className="dice-d20-mod-btn dice-d20-mod-btn--adv dice-hex-btn dice-hex-btn--lg"
          onClick={() => onRoll('adv')}
          disabled={rolling}
          title="Преимущество — бросить 2к20"
          aria-label="Преимущество — бросить 2к20"
        >
          <ChevronUp size={20} strokeWidth={2.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="dice-d20-mod-btn dice-d20-mod-btn--dis dice-hex-btn dice-hex-btn--lg"
          onClick={() => onRoll('dis')}
          disabled={rolling}
          title="Помеха — бросить 2к20"
          aria-label="Помеха — бросить 2к20"
        >
          <ChevronDown size={20} strokeWidth={2.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
