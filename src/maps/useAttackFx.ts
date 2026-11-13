/**
 * Анимация атак на карте по combat.action, если сервер не прислал map.vfx:
 * план из attackFx (таблица по виду урона и дальности), играет MapCanvas.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { useRoomEvents } from '../rooms/RoomProvider'
import type { CombatActionResult } from '../types/rooms'
import { AutoAttackFx, MISS_COLOR, STEEL, damageOf, isMiss, missPoint, planAttackFx } from './attackFx'
import { pxPerFt } from './geometry'
import { ELEMENT } from './render/constants'
import type { MapCanvasHandle } from './render/types'
import type { BattleMap, Pt } from './types'

export function useAttackFx(canvas: RefObject<MapCanvasHandle | null>, map: BattleMap | null) {
  const mapRef = useRef(map)
  useEffect(() => {
    mapRef.current = map
  })
  const queue = useRef<AutoAttackFx | null>(null)
  useEffect(() => {
    const q = new AutoAttackFx((r) => {
      const m = mapRef.current
      const c = canvas.current
      if (!m || !c) return
      const posOf = (cid: string): Pt | null => {
        const t = m.tokens.find((x) => x.combatant_id === cid)
        return t ? { x: t.x, y: t.y } : null
      }
      const from = posOf(r.actor_combatant_id)
      const rows = (r.targets ?? []).map((t) => ({ t, at: posOf(t.combatant_id) })).filter((x): x is { t: (typeof r.targets)[number]; at: Pt } => !!x.at)
      if (!rows.length) return
      const first = rows[0].at
      const types = r.damage_types?.length ? r.damage_types : [...new Set(rows.flatMap((x) => x.t.damage.map((d) => d.type).filter((d): d is string => !!d)))]
      const plan = planAttackFx({
        kind: r.kind,
        ranged: r.ranged,
        damageTypes: types,
        vfx: r.vfx,
        distanceFt: from ? Math.hypot(first.x - from.x, first.y - from.y) / pxPerFt(m.grid) : null,
        healed: rows.some((x) => !!x.t.healed),
      })
      if (!plan) return
      const palette = ELEMENT[plan.element] ?? STEEL
      const hitColor = ELEMENT[plan.element] ? palette[2] : '#ffd27a'
      c.attack(
        plan,
        from,
        rows.map(({ t, at }, i) => {
          const miss = isMiss(t)
          const dmg = damageOf(t)
          const text = t.healed ? `+${t.healed}` : dmg > 0 && !miss ? `−${dmg}` : t.save && t.saved ? 'спас' : miss ? 'мимо' : ''
          return { at, miss: miss && from ? missPoint(from, at, m.grid.cell_px, i % 2 ? -1 : 1) : null, text, color: t.healed ? '#6fe39a' : miss ? MISS_COLOR : hitColor }
        }),
        palette,
      )
    })
    queue.current = q
    return () => q.dispose()
  }, [canvas])

  useRoomEvents((msg) => {
    if (msg.type === 'combat.action') {
      const live = !msg.ts || Date.now() - Date.parse(msg.ts) < 15000
      if (live) queue.current?.action(msg.payload as unknown as CombatActionResult)
    } else if (msg.type === 'map.vfx') {
      const p = msg.payload as { actor_combatant_id?: string; spell?: string }
      if (p.actor_combatant_id && p.spell) queue.current?.vfx({ actor_combatant_id: p.actor_combatant_id, spell: p.spell })
    }
  })
}
