import type { MapZone } from '../types'

/** Готовые зоны: одним кликом */
export const ZONE_TEMPLATES: { label: string; patch: Partial<MapZone> }[] = [
  {
    label: 'Лужа кислоты',
    patch: { name: 'Лужа кислоты', vfx_preset: 'zone.acid', frequency: 'once_per_turn', on_enter: [{ op: 'damage', target: 'subject', dice: '2d4', type: 'acid' }], on_start_turn: [{ op: 'damage', target: 'subject', dice: '2d4', type: 'acid' }] },
  },
  {
    label: 'Ловушка-сеть',
    patch: { name: 'Ловушка-сеть', visible_to_players: false, frequency: 'once', on_enter: [{ op: 'save', target: 'subject', ability: 'dex', dc: '16', on_fail: [{ op: 'apply_effect', target: 'subject', label: 'Опутан', rounds: '3' }], on_success: [] }] },
  },
  {
    label: 'Огонь',
    patch: { name: 'Огонь', vfx_preset: 'zone.fire', frequency: 'once_per_turn', on_enter: [{ op: 'damage', target: 'subject', dice: '1d10', type: 'fire' }], on_start_turn: [{ op: 'damage', target: 'subject', dice: '1d10', type: 'fire' }] },
  },
  { label: 'Трясина', patch: { name: 'Трясина', difficult_terrain: true, vfx_preset: 'zone.nature' } },
  { label: 'Туман', patch: { name: 'Туман', obscured: 'heavily', vfx_preset: 'zone.shadow' } },
]
