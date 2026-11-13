import { useEffect, useMemo, useState } from 'react'
import type { BlockRefs } from '../blocks'
import { allPresets, type VfxPreset } from '../vfx'
import type { BattleMap } from '../types'

/** Ссылки для полей блоков: двери, свет, зоны, объекты, триггеры, пресеты */
export function useRefs(map: BattleMap): BlockRefs {
  const [presets, setPresets] = useState<VfxPreset[]>([])
  useEffect(() => {
    void allPresets().then(setPresets)
  }, [])
  return useMemo(
    () => ({
      wall_id: map.walls.filter((w) => w.kind === 'door' || w.kind === 'secret').map((w, i) => ({ id: w.id, label: `${w.kind === 'secret' ? 'Тайная дверь' : 'Дверь'} ${i + 1}` })),
      light_id: map.lights.map((l, i) => ({ id: l.id, label: `Свет ${i + 1}` })),
      zone_id: map.zones.map((z) => ({ id: z.id, label: z.name || 'Зона' })),
      object_id: map.objects.map((o) => ({ id: o.id, label: o.name || 'Объект' })),
      trigger_id: (map.triggers ?? []).map((t) => ({ id: t.id, label: t.name || 'Триггер' })),
      preset: presets.map((p) => ({ id: p.id, label: p.name })),
    }),
    [map.walls, map.lights, map.zones, map.objects, map.triggers, presets],
  )
}
