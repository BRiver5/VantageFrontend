import { useRoom } from '../RoomProvider'
import { VISIBILITY_RU } from './logic'
import type { TableVisibility } from './types'

/** Кто видит таблицу и может тянуть из неё (игроки — только с возвращением) */
export function VisibilityPicker({ value, sharedWith, onChange }: { value: TableVisibility; sharedWith: string[]; onChange: (v: TableVisibility, sharedWith: string[]) => void }) {
  const { data } = useRoom()
  const players = (data?.members ?? []).filter((m) => m.role !== 'dm' && m.status === 'approved')
  return (
    <div className="rt-vis">
      <label>
        Видят
        <select value={value} onChange={(e) => onChange(e.target.value as TableVisibility, sharedWith)}>
          {(Object.keys(VISIBILITY_RU) as TableVisibility[]).map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_RU[v]}
            </option>
          ))}
        </select>
      </label>
      {value === 'some' && (
        <span className="rt-vis-who">
          {players.length === 0 && <i className="tb-hint">В комнате пока нет игроков</i>}
          {players.map((m) => (
            <label key={m.user_id} className="rt-check">
              <input
                type="checkbox"
                checked={sharedWith.includes(m.user_id)}
                onChange={(e) => onChange(value, e.target.checked ? [...sharedWith, m.user_id] : sharedWith.filter((id) => id !== m.user_id))}
              />
              {m.display_name || m.nickname || 'Игрок'}
            </label>
          ))}
        </span>
      )}
    </div>
  )
}
