/** Кнопка линейки, итог измерения, цена хода и предупреждение об атаке по возможности */
import { Ruler } from 'lucide-react'
import type { RoutePreview } from './api'
import type { PendingMove } from './useRuler'
import { feet } from './math'

export function RulerHud({
  active,
  started,
  total,
  offset,
  route,
  pending,
  onToggle,
  onConfirm,
  onDismiss,
}: {
  active: boolean
  started: boolean
  total: number | null
  offset: number
  route: RoutePreview | null
  pending: PendingMove | null
  onToggle: () => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  const names = (pending?.provokes ?? route?.provokes ?? []).map((p) => p.name)
  return (
    <>
      <button type="button" className={`rl-toggle${active ? ' is-on' : ''}`} onClick={onToggle} aria-pressed={active} aria-label="Линейка" title="Линейка (R)">
        <Ruler aria-hidden="true" />
      </button>
      {active && (
        <p className="rl-bar" role="status">
          {started && total != null ? <b>{feet(total)}</b> : <b>Линейка</b>}
          <i>{started ? 'клик или F — точка, Alt+F — убрать, E/Q — высота, правый клик — сброс' : 'нажмите на карту, чтобы начать'}</i>
          {offset !== 0 && <em>{offset > 0 ? '↑' : '↓'}{feet(Math.abs(offset))}</em>}
        </p>
      )}
      {pending ? (
        <div className="rl-warn is-ask" role="alertdialog" aria-label="Атака по возможности">
          <span>
            Атака по возможности: <b>{names.join(', ')}</b>
          </span>
          <button type="button" className="rl-go" onClick={onConfirm}>
            Всё равно идти
          </button>
          <button type="button" onClick={onDismiss}>
            Отмена
          </button>
        </div>
      ) : (
        names.length > 0 && (
          <p className="rl-warn" role="status">
            Атака по возможности: <b>{names.join(', ')}</b>
          </p>
        )
      )}
    </>
  )
}
