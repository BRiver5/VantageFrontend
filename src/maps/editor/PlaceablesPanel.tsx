/** Объекты сцены: список стен, объектов, света, жетонов, находок и зон с фильтрами и закреплением */
import { useMemo, useState } from 'react'
import { EyeOff, Lock, LockOpen, Search, X } from 'lucide-react'
import type { BattleMap, Pt } from '../types'
import { EMPTY_FILTER, filterPlaceables, PLACE_KINDS, placeables, setLocked, toggleId, type PlaceFilter, type Tri } from './placeables'
import type { Change } from './types'

type Props = {
  map: BattleMap
  picked: readonly string[]
  setPicked: (ids: string[]) => void
  change: Change
  /** навести камеру */
  onCenter: (p: Pt) => void
  /** двойной клик: открыть свойства */
  onOpen: (id: string) => void
  onClose: () => void
}

const LIMIT = 400

export function PlaceablesPanel({ map, picked, setPicked, change, onCenter, onOpen, onClose }: Props) {
  const [f, setF] = useState<PlaceFilter>(EMPTY_FILTER)
  const all = useMemo(() => placeables(map), [map])
  const list = useMemo(() => filterPlaceables(all, f), [all, f])
  const kindLabel = Object.fromEntries(PLACE_KINDS.map((k) => [k.id, k.label]))
  const sel = new Set(picked)
  const pickedRows = all.filter((x) => sel.has(x.id))
  const tri = (key: 'hidden' | 'locked', label: string, yes: string, no: string) => (
    <label>
      {label}
      <select value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value as Tri })}>
        <option value="any">все</option>
        <option value="yes">{yes}</option>
        <option value="no">{no}</option>
      </select>
    </label>
  )

  return (
    <aside className="me-outliner" aria-label="Объекты сцены">
      <header>
        <h3>Объекты сцены</h3>
        <span>{list.length === all.length ? all.length : `${list.length} из ${all.length}`}</span>
        <button type="button" className="me-outliner-x" onClick={onClose} aria-label="Закрыть список">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="me-chips" role="group" aria-label="Виды">
        {PLACE_KINDS.map((k) => {
          const on = f.kinds.includes(k.id)
          return (
            <button key={k.id} type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => setF({ ...f, kinds: on ? f.kinds.filter((x) => x !== k.id) : [...f.kinds, k.id] })}>
              {k.label}
            </button>
          )
        })}
      </div>
      <label className="me-outliner-q">
        <Search aria-hidden="true" />
        <input value={f.q} placeholder="Имя" aria-label="Поиск по имени" onChange={(e) => setF({ ...f, q: e.target.value })} />
      </label>
      <div className="me-outliner-tri">
        {tri('hidden', 'Скрытые', 'только', 'без них')}
        {tri('locked', 'Закреплённые', 'только', 'без них')}
      </div>
      {pickedRows.length > 0 && (
        <div className="me-outliner-bulk">
          <span>Выбрано: {pickedRows.length}</span>
          <button type="button" className="me-ghost" onClick={() => change((m) => setLocked(m, picked, true))}>
            <Lock aria-hidden="true" /> Закрепить
          </button>
          <button type="button" className="me-ghost" onClick={() => change((m) => setLocked(m, picked, false))}>
            <LockOpen aria-hidden="true" /> Открепить
          </button>
        </div>
      )}
      <ul className="me-outliner-list">
        {list.slice(0, LIMIT).map((x) => (
          <li key={x.id} className={sel.has(x.id) ? 'is-on' : ''}>
            <button
              type="button"
              className="me-outliner-row"
              aria-pressed={sel.has(x.id)}
              title="Клик — выбрать и показать, Shift — добавить к выбору, двойной клик — свойства"
              onClick={(e) => {
                if (e.shiftKey) return setPicked(toggleId(picked, x.id))
                setPicked([x.id])
                onCenter(x.at)
              }}
              onDoubleClick={() => onOpen(x.id)}
            >
              <b>{x.name}</b>
              <i>{kindLabel[x.kind]}</i>
              {x.hidden && <EyeOff aria-label="скрыто от игроков" />}
            </button>
            <button
              type="button"
              className={`me-outliner-lock${x.locked ? ' is-on' : ''}`}
              aria-pressed={x.locked}
              aria-label={x.locked ? `Открепить «${x.name}»` : `Закрепить «${x.name}»`}
              title={x.locked ? 'Закреплено: на холсте не выбирается' : 'Закрепить'}
              onClick={() => change((m) => setLocked(m, [x.id], !x.locked))}
            >
              {x.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
            </button>
          </li>
        ))}
        {list.length > LIMIT && <li className="me-outliner-more">Ещё {list.length - LIMIT}: уточните фильтр</li>}
        {!list.length && <li className="me-outliner-more">Ничего не нашлось</li>}
      </ul>
    </aside>
  )
}
