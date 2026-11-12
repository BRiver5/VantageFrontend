/** Свойства объекта и действия на нём */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { BlockList } from '../blocks'
import type { BattleMap, MapInteraction, MapObject } from '../types'
import { uid } from './batch'
import { useRefs } from './useRefs'

export function ObjectProps({ obj, map, onChange, onRemove }: { obj: MapObject; map: BattleMap; onChange: (o: Partial<MapObject>) => void; onRemove: () => void }) {
  const num = (k: 'height_ft' | 'base_ft' | 'rotation' | 'w' | 'h', label: string, step = 5) => (
    <label>
      {label}
      <input type="number" step={step} value={obj[k]} onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 })} />
    </label>
  )
  const flag = (k: 'climbable' | 'blocks_move' | 'blocks_sight' | 'blocks_light' | 'walkable_top' | 'container' | 'hidden', label: string) => (
    <label className="me-check">
      <input type="checkbox" checked={!!obj[k]} onChange={(e) => onChange({ [k]: e.target.checked })} /> {label}
    </label>
  )
  return (
    <section>
      <h3>Объект</h3>
      <label>
        Название
        <input value={obj.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {num('height_ft', 'Высота, фт')}
      {num('base_ft', 'Основание, фт')}
      {num('rotation', 'Поворот, °', 15)}
      {num('w', 'Ширина, px', 10)}
      {num('h', 'Глубина, px', 10)}
      <label>
        Укрытие
        <select value={obj.cover} onChange={(e) => onChange({ cover: e.target.value as MapObject['cover'] })}>
          <option value="none">нет</option>
          <option value="half">половинное</option>
          <option value="three_quarters">на три четверти</option>
          <option value="full">полное</option>
        </select>
      </label>
      {flag('blocks_move', 'не пройти')}
      {flag('blocks_sight', 'закрывает обзор')}
      {flag('blocks_light', 'отбрасывает тень')}
      {flag('climbable', 'можно залезть')}
      {flag('walkable_top', 'можно встать сверху')}
      {flag('container', 'контейнер (сундук)')}
      {flag('hidden', 'скрыт от игроков')}
      <Interactions obj={obj} map={map} onChange={(interactions) => onChange({ interactions })} />
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Удалить
      </button>
    </section>
  )
}

const SKILLS: [string, string][] = [
  ['', 'без проверки'],
  ['athletics', 'Атлетика'],
  ['acrobatics', 'Акробатика'],
  ['sleight_of_hand', 'Ловкость рук'],
  ['stealth', 'Скрытность'],
  ['arcana', 'Магия'],
  ['history', 'История'],
  ['investigation', 'Анализ'],
  ['nature', 'Природа'],
  ['religion', 'Религия'],
  ['perception', 'Внимательность'],
  ['insight', 'Проницательность'],
  ['survival', 'Выживание'],
  ['str', 'Сила'],
  ['dex', 'Ловкость'],
  ['con', 'Телосложение'],
  ['int', 'Интеллект'],
  ['wis', 'Мудрость'],
  ['cha', 'Харизма'],
]
const ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const QUICK: { label: string; skill: string; dc: number }[] = [
  { label: 'Обыскать', skill: 'investigation', dc: 12 },
  { label: 'Открыть', skill: '', dc: 0 },
  { label: 'Взломать', skill: 'sleight_of_hand', dc: 15 },
  { label: 'Потянуть рычаг', skill: '', dc: 0 },
]

/** Действия на объекте: «Обыскать» с проверкой Анализа Сл 12 → сценарий успеха и провала */
function Interactions({ obj, map, onChange }: { obj: MapObject; map: BattleMap; onChange: (list: MapInteraction[]) => void }) {
  const refs = useRefs(map)
  const list = obj.interactions ?? []
  const [open, setOpen] = useState<string | null>(null)
  const set = (id: string, patch: Partial<MapInteraction>) => onChange(list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  return (
    <div className="me-inter">
      <p className="me-say">Действия на объекте</p>
      <ul className="me-list">
        {list.map((x) => {
          const key = x.check?.skill ?? x.check?.ability ?? ''
          return (
            <li key={x.id} className={open === x.id ? 'is-open' : ''}>
              <button type="button" className="me-list-head" onClick={() => setOpen(open === x.id ? null : x.id)}>
                <b>{x.label}</b>
                <i>{x.check ? `${SKILLS.find(([k]) => k === key)?.[1] ?? key}, Сл ${x.check.dc}` : 'без проверки'}</i>
              </button>
              {open === x.id && (
                <div className="me-trig">
                  <label>
                    Название
                    <input value={x.label} onChange={(e) => set(x.id, { label: e.target.value })} />
                  </label>
                  <label>
                    Проверка
                    <select
                      value={key}
                      onChange={(e) => {
                        const v = e.target.value
                        set(x.id, { check: v ? { ...(ABILITIES.has(v) ? { ability: v } : { skill: v }), dc: x.check?.dc ?? 13 } : null })
                      }}
                    >
                      {SKILLS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  {x.check && (
                    <label>
                      Сл
                      <input type="number" min={1} max={30} value={x.check.dc} onChange={(e) => set(x.id, { check: { ...x.check!, dc: Number(e.target.value) || 10 } })} />
                    </label>
                  )}
                  <label>
                    Стоит
                    <select value={x.economy} onChange={(e) => set(x.id, { economy: e.target.value as MapInteraction['economy'] })}>
                      <option value="free">ничего</option>
                      <option value="object">взаимодействие</option>
                      <option value="action">действие</option>
                      <option value="bonus">бонусное</option>
                    </select>
                  </label>
                  <label>
                    Дотянуться, фт
                    <input type="number" min={0} step={5} value={x.reach_ft} onChange={(e) => set(x.id, { reach_ft: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={!!x.once} onChange={(e) => set(x.id, { once: e.target.checked })} /> один раз
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={!!x.dm_only} onChange={(e) => set(x.id, { dm_only: e.target.checked })} /> только мастеру
                  </label>
                  <p className="me-say">{x.check ? 'При успехе:' : 'Что происходит:'}</p>
                  <BlockList value={x.on_success ?? []} onChange={(v) => set(x.id, { on_success: v })} refs={refs} />
                  {x.check && (
                    <>
                      <p className="me-say">При провале:</p>
                      <BlockList value={x.on_fail ?? []} onChange={(v) => set(x.id, { on_fail: v })} refs={refs} />
                    </>
                  )}
                  <button type="button" className="me-del" onClick={() => onChange(list.filter((y) => y.id !== x.id))}>
                    <Trash2 aria-hidden="true" /> Убрать действие
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <span className="me-chips">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              const x: MapInteraction = { id: uid('ia'), label: q.label, economy: 'object', reach_ft: 5, check: q.skill ? { skill: q.skill, dc: q.dc } : null, on_success: [], on_fail: [], once: false, dm_only: false }
              onChange([...list, x])
              setOpen(x.id)
            }}
          >
            <Plus aria-hidden="true" /> {q.label}
          </button>
        ))}
      </span>
    </div>
  )
}
