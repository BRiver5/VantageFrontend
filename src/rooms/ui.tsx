/**
 * Мелкие общие кирпичи экранов комнат: аватар, подписи ролей и статусов,
 * индикатор соединения, копирование в буфер.
 */
import { useState, type ReactNode } from 'react'
import { Crown, Radio, UserRound, WifiOff } from 'lucide-react'
import { imageVariant } from '../api'
import type { SocketStatus } from './roomSocket'
import type { MemberStatus, RoomRole, RoomStatus } from '../types/rooms'
import { statusRu } from './applyEvent'

/** Круглый аватар: картинка в малом размере, а без неё — инициал */
export function RoomAvatar({
  src,
  name,
  size = 36,
  online,
  dm,
}: {
  src?: string | null
  name?: string | null
  size?: number
  online?: boolean
  dm?: boolean
}) {
  const [broken, setBroken] = useState(false)
  const initial = (name ?? '').trim().charAt(0).toUpperCase()
  return (
    <span className={`rm-avatar${dm ? ' is-dm' : ''}`} style={{ width: size, height: size }}>
      {src && !broken ? (
        <img src={imageVariant(src, 'low')} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
      ) : initial ? (
        <b style={{ fontSize: size * 0.42 }}>{initial}</b>
      ) : (
        <UserRound aria-hidden="true" />
      )}
      {online != null && <i className={`rm-presence${online ? ' is-on' : ''}`} title={online ? 'в сети' : 'не в сети'} />}
      {dm && <Crown className="rm-crown" aria-label="мастер" />}
    </span>
  )
}

export const ROLE_RU: Record<RoomRole, string> = { dm: 'Мастер', player: 'Игрок' }

export function StatusChip({ status }: { status: RoomStatus }) {
  return <span className={`rm-status is-${status}`}>{statusRu(status)}</span>
}

export const MEMBER_STATUS_RU: Record<MemberStatus, string> = {
  pending: 'ждёт решения мастера',
  approved: 'в партии',
  rejected: 'отклонён',
  kicked: 'исключён',
  left: 'вышел',
}

/** Состояние соединения: видно, когда оно не «открыто» */
export function LinkBadge({ status }: { status: SocketStatus }) {
  if (status === 'open') {
    return (
      <span className="rm-link is-ok" title="Соединение установлено">
        <Radio aria-hidden="true" /> онлайн
      </span>
    )
  }
  if (status === 'closed') {
    return (
      <span className="rm-link is-bad">
        <WifiOff aria-hidden="true" /> нет связи
      </span>
    )
  }
  return (
    <span className="rm-link is-wait" role="status">
      <WifiOff aria-hidden="true" /> {status === 'syncing' ? 'догоняем события…' : 'подключаемся…'}
    </span>
  )
}

/** Скопировать текст; в старых браузерах — через временное поле */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export const inviteLink = (code: string) => `${location.origin}/rooms/join/${code}`

/** Подпись поля формы */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="rm-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
