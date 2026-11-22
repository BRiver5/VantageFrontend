/**
 * Раздел «Свои бонусы»: вклады игрока в значения движка — то, чего нет в каталоге
 * (подарок мастера, самодельный предмет, домашнее правило). Сервер добавляет их
 * к листу как источник «своё», они видны в расшифровке «откуда число».
 */
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT, DEFAULT_SKILLS } from '../../../types/character'
import type { CustomModifier } from '../../../types/character'
import { ChipList, EdSection, Stepper, Toggle } from '../../editorFields'

type Target = { value: string; label: string; op: CustomModifier['op'] }

const num = (value: string, label: string): Target => ({ value, label, op: 'add' })

/** Что можно усилить: группы для выпадающего списка */
export const BONUS_TARGETS: { group: string; items: Target[] }[] = [
  {
    group: 'Бой',
    items: [
      num('char.ac', 'Класс доспеха'),
      num('char.init', 'Инициатива'),
      num('char.hp.max', 'Максимум хитов'),
      num('char.attack_bonus.weapon', 'Атаки оружием: попадание'),
      num('char.dmg_bonus.weapon', 'Атаки оружием: урон'),
      num('char.attack_bonus.melee_weapon', 'Рукопашное оружие: попадание'),
      num('char.dmg_bonus.melee_weapon', 'Рукопашное оружие: урон'),
      num('char.attack_bonus.ranged', 'Дальнобойное оружие: попадание'),
      num('char.dmg_bonus.ranged', 'Дальнобойное оружие: урон'),
      num('char.attack_bonus.spell', 'Атаки заклинаниями (в бросках)'),
    ],
  },
  {
    group: 'Магия',
    items: [num('char.spell_dc_bonus', 'Сл заклинаний'), num('char.spell_attack_bonus', 'Бонус атаки заклинанием')],
  },
  {
    group: 'Характеристики',
    items: ABILITY_KEYS.map((k) => num(`char.abilities.${ABILITY_SHORT[k]}.score`, `${ABILITY_LABELS[k].label}: значение`)),
  },
  {
    group: 'Спасброски',
    items: [
      num('char.save_bonus', 'Все спасброски'),
      ...ABILITY_KEYS.map((k) => num(`char.abilities.${ABILITY_SHORT[k]}.save`, `Спасбросок: ${ABILITY_LABELS[k].label}`)),
    ],
  },
  {
    group: 'Навыки и проверки',
    items: [
      num('char.check_bonus', 'Все проверки характеристик'),
      ...DEFAULT_SKILLS.map((s) => num(`char.skills.${s.key}.bonus`, `Навык: ${s.label}`)),
      num('char.skills.perception.passive', 'Пассивная Внимательность'),
    ],
  },
  {
    group: 'Скорость и чувства',
    items: [
      num('char.speed.walk', 'Скорость ходьбы'),
      num('char.speed.fly', 'Скорость полёта'),
      num('char.speed.swim', 'Скорость плавания'),
      num('char.speed.climb', 'Скорость лазания'),
      { value: 'char.senses.darkvision', label: 'Тёмное зрение (не меньше)', op: 'max' },
      { value: 'char.senses.blindsight', label: 'Слепое зрение (не меньше)', op: 'max' },
      { value: 'char.senses.truesight', label: 'Истинное зрение (не меньше)', op: 'max' },
    ],
  },
  {
    group: 'Владения и защита (список)',
    items: [
      { value: 'char.prof.languages', label: 'Языки', op: 'union' },
      { value: 'char.prof.tools', label: 'Инструменты', op: 'union' },
      { value: 'char.prof.weapons', label: 'Оружие', op: 'union' },
      { value: 'char.prof.armor', label: 'Доспехи', op: 'union' },
      { value: 'char.defense.resist', label: 'Сопротивления урону', op: 'union' },
      { value: 'char.defense.immune', label: 'Иммунитеты к урону', op: 'union' },
      { value: 'char.defense.cond_immune', label: 'Иммунитеты к состояниям', op: 'union' },
    ],
  },
]

const TARGET_BY_PATH = new Map(BONUS_TARGETS.flatMap((g) => g.items).map((t) => [t.value, t]))

type Props = {
  mods: CustomModifier[]
  setMods: (fn: (list: CustomModifier[]) => CustomModifier[]) => void
}

export function BonusesSection({ mods, setMods }: Props) {
  const setMod = (i: number, patch: Partial<CustomModifier>) => setMods((list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  return (
    <EdSection
      id="bonuses"
      icon={SlidersHorizontal}
      title="Свои бонусы"
      lead="Подарок мастера, самодельный предмет, домашнее правило — бонус прибавится к листу и появится в расшифровке «откуда число»."
      actions={
        <button
          type="button"
          className="ed-btn"
          onClick={() => setMods((list) => [...list, { label: '', target: 'char.ac', op: 'add', value: 1, enabled: true }])}
        >
          <Plus aria-hidden="true" /> бонус
        </button>
      }
    >
      {mods.length > 0 ? (
        <div className="ed-table ed-table--mods">
          <div className="ed-tr ed-th">
            <span />
            <span>Откуда</span>
            <span>Что усиливает</span>
            <span>Значение</span>
            <span />
          </div>
          {mods.map((m, i) => {
            const target = TARGET_BY_PATH.get(m.target)
            const isList = (target?.op ?? m.op) === 'union'
            const listValue = Array.isArray(m.value) ? m.value.map(String) : m.value ? [String(m.value)] : []
            return (
              <div key={i} className={`ed-tr${m.enabled ? '' : ' ed-mod-off'}`}>
                <Toggle on={m.enabled} onChange={(v) => setMod(i, { enabled: v })} title={m.enabled ? 'Действует' : 'Выключен'} />
                <input
                  className="ed-input"
                  value={m.label}
                  placeholder="Плащ защиты"
                  maxLength={120}
                  onChange={(e) => setMod(i, { label: e.target.value })}
                  aria-label="Откуда бонус"
                />
                <select
                  className="ed-input ed-select"
                  value={m.target}
                  aria-label="Что усиливает"
                  onChange={(e) => {
                    const next = TARGET_BY_PATH.get(e.target.value)
                    const op = next?.op ?? 'add'
                    // список ↔ число: значение другого вида не подходит
                    const value = op === 'union' ? (isList ? m.value : []) : isList ? (op === 'max' ? 60 : 1) : m.value
                    setMod(i, { target: e.target.value, op, value })
                  }}
                >
                  {!target && <option value={m.target}>{m.target}</option>}
                  {BONUS_TARGETS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {isList ? (
                  <ChipList items={listValue} onChange={(v) => setMod(i, { value: v })} placeholder="добавить…" />
                ) : (
                  <Stepper
                    value={typeof m.value === 'number' ? m.value : Number(m.value) || 0}
                    min={m.op === 'max' ? 0 : -30}
                    max={m.op === 'max' ? 300 : 60}
                    sign={m.op === 'add'}
                    onChange={(v) => setMod(i, { value: v })}
                  />
                )}
                <button
                  type="button"
                  className="ed-btn ed-btn--icon is-danger"
                  onClick={() => setMods((list) => list.filter((_, j) => j !== i))}
                  title="Удалить бонус"
                  aria-label="Удалить бонус"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="ed-empty">Своих бонусов нет — добавьте кнопкой справа сверху.</p>
      )}
    </EdSection>
  )
}
