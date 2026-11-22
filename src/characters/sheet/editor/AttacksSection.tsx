/**
 * Раздел «Атаки»: оружие из инвентаря и свои атаки.
 *
 * Оружие считает движок (бонус, кость, Боевые искусства), но строку можно
 * переименовать, перевести на ручные числа или скрыть из листа. Настройки
 * оружия хранятся строкой `attacks` с тем же `inventory_instance_id`: её нет,
 * пока игрок ничего не менял.
 */
import { Eye, EyeOff, Plus, Swords, Trash2 } from 'lucide-react'
import type { AttackEntry } from '../../../types/character'
import { EdSection, Stepper, Toggle } from '../../editorFields'
import { ATTACK_TYPES } from '../editorData'
import { signed } from '../rules'

type Props = {
  /** строки документа */
  attacks: AttackEntry[]
  /** оружие инвентаря с числами движка (из листа) */
  liveWeapons: AttackEntry[]
  setAttacks: (fn: (list: AttackEntry[]) => AttackEntry[]) => void
}

/** Поля, которые есть только в листе: в документ их не пишем */
function docRow(a: AttackEntry): AttackEntry {
  const { ability: _a, rules: _r, versatile: _v, equipped: _e, ...rest } = a
  return rest
}

export function AttacksSection({ attacks, liveWeapons, setAttacks }: Props) {
  const ownAttacks = attacks.map((a, i) => ({ a, i })).filter(({ a }) => !a.inventory_instance_id)
  const rowOf = (id: string) => attacks.find((a) => a.inventory_instance_id === id)
  // оружие: всё из инвентаря плюс ручные строки, чей предмет движок не видит
  const weaponIds = new Set(liveWeapons.map((w) => w.inventory_instance_id))
  const orphans = attacks.filter((a) => a.inventory_instance_id && !weaponIds.has(a.inventory_instance_id))
  const weapons = [...liveWeapons, ...orphans]

  /** Изменить настройки оружия: строки ещё нет — создаётся из живых чисел */
  const patchWeapon = (live: AttackEntry, patch: Partial<AttackEntry>) =>
    setAttacks((list) => {
      const id = live.inventory_instance_id
      const i = list.findIndex((a) => a.inventory_instance_id === id)
      if (i < 0) return [...list, docRow({ ...live, manual: false, hidden: false, ...patch })]
      return list.map((a, j) => (j === i ? { ...a, ...patch } : a))
    })

  return (
    <EdSection
      id="attacks"
      icon={Swords}
      title="Атаки"
      lead="Оружие из инвентаря появляется само — его можно переименовать, задать числа вручную или скрыть. Свои атаки — заклинания, естественное оружие, приёмы."
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
      {weapons.length > 0 && (
        <div className="ed-sub">
          <h5>Оружие из инвентаря</h5>
          <div className="ed-weapons">
            {weapons.map((live) => {
              const id = live.inventory_instance_id!
              const row = rowOf(id)
              const manual = !!row?.manual
              const hidden = !!row?.hidden
              const shown = manual && row ? row : { ...live, name: row?.name || live.name }
              const setRow = (p: Partial<AttackEntry>) => patchWeapon(live, p)
              return (
                <div key={id} className={`ed-weapon${hidden ? ' is-hidden' : ''}`}>
                  <div className="ed-weapon-head">
                    <Swords aria-hidden="true" />
                    <input
                      className="ed-input ed-weapon-name"
                      value={shown.name}
                      onChange={(e) => setRow({ name: e.target.value })}
                      aria-label="Название атаки"
                    />
                    {live.equipped === false && <em className="ed-weapon-tag">в сумке</em>}
                    {!weaponIds.has(id) && <em className="ed-weapon-tag is-warn">предмета нет в инвентаре</em>}
                    <Toggle
                      on={!manual}
                      onChange={(auto) => setRow(auto ? { manual: false } : { ...docRow(live), name: shown.name, manual: true })}
                      label="считать автоматически"
                      title="Авто — бонус и урон считает движок по уровню, владениям и умениям"
                    />
                    <button
                      type="button"
                      className="ed-btn ed-btn--icon"
                      onClick={() => setRow({ hidden: !hidden })}
                      title={hidden ? 'Показывать в листе' : 'Скрыть из листа'}
                      aria-label={hidden ? 'Показывать в листе' : 'Скрыть из листа'}
                    >
                      {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                    {row && (
                      <button
                        type="button"
                        className="ed-btn ed-btn--icon is-danger"
                        onClick={() => setAttacks((list) => list.filter((a) => a !== row))}
                        title="Сбросить настройки оружия"
                        aria-label="Сбросить настройки оружия"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {manual ? (
                    <div className="ed-tr ed-weapon-nums">
                      <select
                        className="ed-input ed-select"
                        value={shown.type}
                        onChange={(e) => setRow({ type: e.target.value as AttackEntry['type'] })}
                        aria-label="Вид"
                      >
                        {ATTACK_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <Stepper value={shown.attack_bonus} min={-10} max={30} sign onChange={(v) => setRow({ attack_bonus: v })} />
                      <input className="ed-input" value={shown.damage} placeholder="1к8+3" onChange={(e) => setRow({ damage: e.target.value })} aria-label="Урон" />
                      <input
                        className="ed-input"
                        value={shown.damage_type}
                        placeholder="рубящий"
                        onChange={(e) => setRow({ damage_type: e.target.value })}
                        aria-label="Тип урона"
                      />
                      <input className="ed-input" value={shown.range} placeholder="5 фт." onChange={(e) => setRow({ range: e.target.value })} aria-label="Дистанция" />
                    </div>
                  ) : (
                    <p className="ed-weapon-live">
                      <b>{signed(live.attack_bonus)}</b> к попаданию · <b>{live.damage}</b> {live.damage_type}
                      {live.range ? ` · ${live.range}` : ''}
                      {live.rules?.length ? ` · ${live.rules.join(', ')}` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="ed-sub">
        <h5>Свои атаки</h5>
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
      </div>
    </EdSection>
  )
}
