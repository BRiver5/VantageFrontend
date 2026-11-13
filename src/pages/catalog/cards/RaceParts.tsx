import type { LucideIcon } from 'lucide-react'

/** Одна ячейка нижней «рейки» карточки расы: иконка, значение, подпись. */
export function RaceRailCell({ icon: Icon, value, label }: { icon: LucideIcon; value: string | null; label: string }) {
  return (
    <span className="race-rail-cell" data-off={value ? undefined : ''}>
      <Icon aria-hidden="true" />
      <b>{value ?? '—'}</b>
      <i>{label}</i>
    </span>
  )
}
