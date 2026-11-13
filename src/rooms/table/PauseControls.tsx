/**
 * Пауза игры: значок для всех и кнопка мастера в шапке (и Пробел вне полей
 * ввода). Пауза — статус комнаты `paused`.
 */
import { useState } from 'react'
import { Hourglass, Pause, Play } from 'lucide-react'
import { useKeybinding } from '../../input/useKeybinding'
import { useRoom } from '../RoomProvider'
import { setRoomStatus } from '../roomsApi'
import { canTogglePause, isPausedStatus, isTypingTarget, nextPauseStatus } from '../pause'
import { Round } from './parts'

/** «Пауза» с песочными часами — видна всем, пока игра стоит */
export function PauseBadge() {
  const { data, isDm } = useRoom()
  if (!isPausedStatus(data?.room.status)) return null
  return (
    <span className="tb-pause" role="status" title={isDm ? 'Игроки не могут ходить и действовать' : 'Мастер поставил игру на паузу'}>
      <Hourglass aria-hidden="true" className="tb-pause-glass" />
      Пауза
    </span>
  )
}

/** Кнопка мастера: поставить или снять паузу. Пробел делает то же */
export function PauseButton() {
  const { data, roomId, isDm } = useRoom()
  const [busy, setBusy] = useState(false)
  const status = data?.room.status
  const toggle = () => {
    const next = nextPauseStatus(status)
    if (!next || busy) return
    setBusy(true)
    void setRoomStatus(roomId, next)
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }
  useKeybinding(
    'room.pause',
    (e) => {
      if (e.repeat || isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return
      if (document.querySelector('.cw-modal-layer, .tb-layer, .tb-drawer-layer, .tb-menu-layer')) return
      e.preventDefault()
      toggle()
    },
    isDm && canTogglePause(status),
  )
  if (!isDm || !canTogglePause(status)) return null
  const paused = isPausedStatus(status)
  return <Round icon={paused ? Play : Pause} label={paused ? 'Продолжить игру (Пробел)' : 'Пауза (Пробел)'} on={paused} onClick={toggle} />
}
