/** Инструмент «Жетон»: кого ставить на карту */
import type { useRoom } from '../../rooms/RoomProvider'
import { creatureName } from '../../rooms/table/parts'
import { BeastSearch } from './BeastSearch'
import type { Stamp } from './types'

type Props = {
  data: ReturnType<typeof useRoom>['data']
  stamp: Stamp | null
  setStamp: (s: Stamp) => void
  stampHidden: boolean
  setStampHidden: (v: boolean) => void
  flash: (t: string) => void
}

export function StampPanel({ data, stamp, setStamp, stampHidden, setStampHidden, flash }: Props) {
  return (
    <section>
      <h3>Что ставить</h3>
      <BeastSearch
        onAdded={(c) => {
          setStamp({ creature_id: c.id, label: c.name })
          flash(`«${c.name}» добавлен в комнату — кликните по клетке`)
        }}
      />
      <div className="me-stamps">
        {(data?.characters ?? []).map((c) => (
          <button key={c.id} type="button" className={stamp?.character_id === c.id ? 'is-on' : ''} onClick={() => setStamp({ character_id: c.id, label: c.name })}>
            {c.name}
          </button>
        ))}
        {(data?.creatures ?? []).map((c) => (
          <button key={c.id} type="button" className={`is-foe${stamp?.creature_id === c.id ? ' is-on' : ''}`} onClick={() => setStamp({ creature_id: c.id, label: creatureName(c) })}>
            {creatureName(c)}
          </button>
        ))}
      </div>
      <label className="me-check">
        <input type="checkbox" checked={stampHidden} onChange={(e) => setStampHidden(e.target.checked)} /> ставить скрытыми (игроки не видят)
      </label>
      <p className="tb-hint">
        {stamp
          ? `«${stamp.label}»: кликните по клетке. Каждый следующий клик — ещё один такой же враг.`
          : 'Найдите врага в бестиарии выше или выберите существо комнаты. В бою враг на карте сам станет участником.'}
      </p>
    </section>
  )
}
