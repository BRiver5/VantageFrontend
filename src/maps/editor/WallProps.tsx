/** Свойства стены, двери или окна */
import { Trash2 } from 'lucide-react'
import type { MapWall } from '../types'
import { wallOf } from './geometry'

export function WallProps({ wall, setWall, remove }: { wall: MapWall; setWall: (patch: Partial<MapWall>) => void; remove: (id: string) => void }) {
  return (
    <section>
      <h3>{wall.kind === 'door' ? 'Дверь' : wall.kind === 'window' ? 'Окно' : 'Стена'}</h3>
      <label>
        Вид
        <select
          value={wall.kind}
          onChange={(e) => {
            const k = e.target.value as MapWall['kind']
            const w = wallOf(k, wall.a, wall.b)
            setWall({ kind: k, blocks: w.blocks, door: k === 'door' || k === 'secret' ? (wall.door ?? { open: false, locked: false }) : null })
          }}
        >
          <option value="wall">стена</option>
          <option value="door">дверь</option>
          <option value="secret">тайная дверь</option>
          <option value="window">окно</option>
          <option value="invisible">невидимая</option>
          <option value="terrain">низкая (ограда)</option>
        </select>
      </label>
      <label>
        Высота, фт
        <input type="number" min={0} step={5} value={wall.height_ft} onChange={(e) => setWall({ height_ft: Number(e.target.value) || 0 })} />
      </label>
      {(wall.kind === 'door' || wall.kind === 'secret') && (
        <>
          <label className="me-check">
            <input type="checkbox" checked={!!wall.door?.locked} onChange={(e) => setWall({ door: { ...(wall.door ?? { open: false, locked: false }), locked: e.target.checked } })} /> заперта
          </label>
          {wall.door?.locked && (
            <label>
              Сл взлома
              <input type="number" min={5} max={30} value={wall.door?.lock_dc ?? 15} onChange={(e) => setWall({ door: { ...(wall.door ?? { open: false, locked: true }), lock_dc: Number(e.target.value) || 15 } })} />
            </label>
          )}
        </>
      )}
      <button type="button" className="me-del" onClick={() => remove(wall.id)}>
        <Trash2 aria-hidden="true" /> Удалить
      </button>
    </section>
  )
}
