/** Раздел «Атаки»: атаки из инвентаря и свои */
import { Plus, Swords, Trash2 } from 'lucide-react'
import type { AttackEntry } from '../../../types/character'
import { EdSection, Stepper } from '../../editorFields'
import { ATTACK_TYPES } from '../editorData'
import { signed } from '../rules'

type Props = {
  weaponAttacks: AttackEntry[]
  ownAttacks: { a: AttackEntry; i: number }[]
  setAttacks: (fn: (list: AttackEntry[]) => AttackEntry[]) => void
}

export function AttacksSection({ weaponAttacks, ownAttacks, setAttacks }: Props) {
  return (
    <EdSection
      id="attacks"
      icon={Swords}
      title="Атаки"
      lead="Свои атаки — заклинания-атаки, естественное оружие, особые приёмы."
      actions={
        <button
          type="button"
          className="ed-btn"
          onClick={() =>
            setAttacks((list) => [
              ...list,
              { name: 'Новая атака', type: 'melee', attack_bonus: 0, damage: '1к6', damage_type: '', range: '5 фт.', properties: [], inventory_instance_id: null },
            ])
          }
        >
          <Plus aria-hidden="true" /> атака
        </button>
      }
    >
      {weaponAttacks.length > 0 && (
        <div className="ed-ro-list">
          {weaponAttacks.map((a) => (
            <span key={a.inventory_instance_id} className="ed-ro">
              <Swords aria-hidden="true" />
              <b>{a.name}</b>
              <i>
                {signed(a.attack_bonus)} · {a.damage} {a.damage_type}
              </i>
              <em>из инвентаря</em>
            </span>
          ))}
        </div>
      )}
      {ownAttacks.length > 0 ? (
        <div className="ed-table ed-table--attacks">
          <div className="ed-tr ed-th">
            <span>Название</span>
            <span>Вид</span>
            <span>Попадание</span>
            <span>Урон</span>
            <span>Тип урона</span>
            <span>Дистанция</span>
            <span />
          </div>
          {ownAttacks.map(({ a, i }) => {
            const setA = (p: Partial<AttackEntry>) => setAttacks((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)))
            return (
              <div key={i} className="ed-tr">
                <input className="ed-input" value={a.name} onChange={(e) => setA({ name: e.target.value })} aria-label="Название" />
                <select className="ed-input ed-select" value={a.type} onChange={(e) => setA({ type: e.target.value as AttackEntry['type'] })} aria-label="Вид">
                  {ATTACK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Stepper value={a.attack_bonus} min={-10} max={30} sign onChange={(v) => setA({ attack_bonus: v })} />
                <input className="ed-input" value={a.damage} placeholder="1к8+3" onChange={(e) => setA({ damage: e.target.value })} aria-label="Урон" />
                <input className="ed-input" value={a.damage_type} placeholder="рубящий" onChange={(e) => setA({ damage_type: e.target.value })} aria-label="Тип урона" />
                <input className="ed-input" value={a.range} placeholder="5 фт." onChange={(e) => setA({ range: e.target.value })} aria-label="Дистанция" />
                <button
                  type="button"
                  className="ed-btn ed-btn--icon is-danger"
                  onClick={() => setAttacks((list) => list.filter((_, j) => j !== i))}
                  title="Удалить атаку"
                  aria-label="Удалить атаку"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="ed-empty">Своих атак нет — добавьте кнопкой справа сверху.</p>
      )}
    </EdSection>
  )
}
