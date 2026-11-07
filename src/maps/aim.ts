/**
 * Как наводить заклинание на карте. Сервер карт присылает
 * mechanics.targeting; если его нет (старый каталог) — выводим из area/range.
 * Одиночные цели не наводятся фигурой: их выбирают кликом по жетонам.
 */
import type { SpellMechanics } from '../api'
import type { SpellTargeting } from './types'

const SHAPES = new Set(['sphere', 'cone', 'line', 'cube', 'cylinder', 'emanation', 'wall', 'square'])

export function targetingOf(mech: SpellMechanics): SpellTargeting | null {
  const t = mech.targeting
  if (t) return t.mode === 'area_from_self' || t.mode === 'area_at_point' || t.mode === 'point' || t.mode === 'direction' ? t : null
  const a = mech.area
  if (!a || !SHAPES.has(a.shape)) return null
  const shape = a.shape as SpellTargeting['shape']
  const range = mech.range.kind === 'ranged' ? (mech.range.feet ?? 60) : 0
  if (a.origin === 'self' || mech.range.kind === 'self') {
    return { mode: 'area_from_self', shape, size_ft: a.size_ft, width_ft: a.width_ft, range_ft: 0, joystick: { rotate: shape !== 'emanation' && shape !== 'sphere', step_deg: 5, distance: false, snap_to_grid: false } }
  }
  return { mode: 'area_at_point', shape, size_ft: a.size_ft, width_ft: a.width_ft, range_ft: range || 60, joystick: { rotate: false, step_deg: 1, distance: true, snap_to_grid: true } }
}

/** Цвет фигуры по типу урона */
export function aimColor(mech: SpellMechanics): string {
  const t = mech.damage[0]?.type
  if (mech.heal && !mech.damage.length) return '#6fdc8c'
  return (
    {
      fire: '#ff8a3d',
      cold: '#8fd3ff',
      lightning: '#a5b4ff',
      thunder: '#c9b6ff',
      acid: '#a6e05a',
      poison: '#7ccf6a',
      necrotic: '#9a7cc0',
      radiant: '#ffe58a',
      force: '#d48cff',
      psychic: '#ff8ad8',
    } as Record<string, string>
  )[t ?? ''] ?? '#f5d06a'
}
