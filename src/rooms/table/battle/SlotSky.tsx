import { Constellation } from '../../../characters/SpellBook'
import type { SheetSlot } from '../../../types/character'
import { type SlotPick } from './heroKit'

/** Ячейки героя — созвездия в правом нижнем углу; при заклинании по ним выбирают круг */
export function SlotSky({ slots, pick, onPick }: { slots: SheetSlot[]; pick: SlotPick | null; onPick?: (p: SlotPick | null) => void }) {
  const list = slots.filter((s) => s.max > 0).sort((a, b) => Number(a.pool === 'pact') - Number(b.pool === 'pact') || a.level - b.level)
  if (list.length === 0) return null
  return (
    <div className={`bt-sky${onPick ? ' is-picking' : ''}`} aria-label="Ячейки заклинаний">
      {onPick && <p className="bt-sky-hint">Выберите круг ячейки</p>}
      <div className="bt-sky-grid">
        {list.map((s) => {
          const on = pick?.level === s.level && pick.pool === s.pool
          const empty = s.current <= 0
          return (
            <button
              key={`${s.pool}-${s.level}`}
              type="button"
              className={`bt-sky-cell${on ? ' is-on' : ''}${empty ? ' is-empty' : ''}`}
              disabled={!onPick || empty}
              aria-pressed={on}
              onClick={() => onPick?.(on ? null : { level: s.level, pool: s.pool })}
              title={`${s.pool === 'pact' ? 'Договор' : `${s.level} круг`}: ${s.current} из ${s.max}`}
            >
              <Constellation circle={s.level} max={s.max} used={s.max - s.current} locked />
              {s.pool === 'pact' && <i>договор</i>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
