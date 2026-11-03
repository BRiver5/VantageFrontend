/**
 * Партия и управление комнатой: участники с карточками героев, заявки,
 * приглашение, статус, правка и удаление. Один и тот же блок «Партия» потом
 * живёт и на экране игрока, и в ширме мастера.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Crown, Heart, KeyRound, LogOut, RefreshCw, Shield, Trash2, UserMinus, UserPlus, X } from 'lucide-react'
import { ApiError, uploadMedia } from '../api'
import { useAuth } from '../auth/AuthContext'
import { useRoom } from './RoomProvider'
import { approveMember, deleteRoom, kickMember, leaveRoom, patchRoom, rejectMember, rotateInvite, setRoomStatus } from './roomsApi'
import { Field, MEMBER_STATUS_RU, ROLE_RU, RoomAvatar, copyText, inviteLink } from './ui'
import { statusRu } from './applyEvent'
import type { CharacterCard, RoomMemberView, RoomStatus } from '../types/rooms'
import { Img } from '../media'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка сервера')

/** Краткая карточка героя: хиты, КД, эффекты */
export function HeroCardLine({ card }: { card: CharacterCard }) {
  const ratio = card.hp.max > 0 ? Math.max(0, Math.min(1, card.hp.current / card.hp.max)) : 0
  const tone = card.hp.current === 0 ? 'down' : ratio <= 0.3 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'
  return (
    <span className="rm-hero">
      <b>{card.name}</b>
      <i>{card.level} ур.</i>
      <span className="rm-hero-stats">
        <span className={`rm-hp is-${tone}`} title="Хиты">
          <Heart aria-hidden="true" /> {card.hp.current}/{card.hp.max}
          {card.hp.temp > 0 && <em>+{card.hp.temp}</em>}
        </span>
        <span title="Класс доспеха">
          <Shield aria-hidden="true" /> {card.ac}
        </span>
      </span>
      {card.effects.length > 0 && <span className="rm-hero-effects">{card.effects.join(' · ')}</span>}
    </span>
  )
}

/* ---------- участники ---------- */

function MemberRow({ m, card, isDm, me, busy, onAct }: {
  m: RoomMemberView
  card?: CharacterCard
  isDm: boolean
  me: string
  busy: boolean
  onAct: (kind: 'approve' | 'reject' | 'kick', m: RoomMemberView) => void
}) {
  const name = m.display_name || m.nickname || 'Игрок'
  const pending = m.status === 'pending'
  return (
    <li className={`rm-member${m.status !== 'approved' && !pending ? ' is-gone' : ''}`}>
      <RoomAvatar src={m.avatar_url ?? card?.avatar_url} name={name} online={m.status === 'approved' ? m.online : undefined} dm={m.role === 'dm'} />
      <span className="rm-member-body">
        <b>
          {name}
          {m.user_id === me && <em> (вы)</em>}
        </b>
        {card ? (
          <HeroCardLine card={card} />
        ) : (
          <i>
            {m.role === 'dm' ? ROLE_RU.dm : pending ? `хочет войти${m.character_name ? ` героем «${m.character_name}»` : ''}` : MEMBER_STATUS_RU[m.status]}
          </i>
        )}
      </span>
      {isDm && pending && (
        <span className="rm-member-acts">
          <button type="button" className="cs-btn" disabled={busy} onClick={() => onAct('approve', m)}>
            <Check aria-hidden="true" /> Принять
          </button>
          <button type="button" className="cw-mini-btn" disabled={busy} onClick={() => onAct('reject', m)} aria-label="Отклонить заявку" title="Отклонить">
            <X aria-hidden="true" />
          </button>
        </span>
      )}
      {isDm && m.status === 'approved' && m.role !== 'dm' && (
        <button type="button" className="cw-mini-btn" disabled={busy} onClick={() => onAct('kick', m)} title="Исключить из комнаты" aria-label="Исключить">
          <UserMinus aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

export function PartyPanel() {
  const { data, roomId, isDm } = useRoom()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data) return null

  const act = async (kind: 'approve' | 'reject' | 'kick', m: RoomMemberView) => {
    if (kind === 'kick' && !confirm(`Исключить «${m.display_name || m.nickname}»? Вернуться он уже не сможет.`)) return
    setBusy(true)
    setError(null)
    try {
      if (kind === 'approve') await approveMember(roomId, m.user_id)
      else if (kind === 'reject') await rejectMember(roomId, m.user_id)
      else await kickMember(roomId, m.user_id)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'Нет свободных мест: поднимите лимит игроков в настройках комнаты.' : errText(e))
    } finally {
      setBusy(false)
    }
  }

  const cardOf = (m: RoomMemberView) => data.characters.find((c) => c.id === m.room_character_id)
  const pending = data.members.filter((m) => m.status === 'pending')
  const active = data.members.filter((m) => m.status === 'approved')
  const gone = isDm ? data.members.filter((m) => m.status === 'kicked' || m.status === 'left') : []
  // мастера — первым
  const ordered = [...active].sort((a, b) => Number(b.role === 'dm') - Number(a.role === 'dm'))
  const me = user?.id ?? data.me.user_id

  return (
    <div className="rm-panel">
      {isDm && pending.length > 0 && (
        <div className="rm-requests">
          <h3 className="rm-panel-title">
            <UserPlus aria-hidden="true" /> Заявки · {pending.length}
          </h3>
          <ul className="rm-members">
            {pending.map((m) => (
              <MemberRow key={m.user_id} m={m} isDm={isDm} me={me} busy={busy} onAct={act} />
            ))}
          </ul>
        </div>
      )}
      <h3 className="rm-panel-title">
        <Crown aria-hidden="true" /> Партия · {active.filter((m) => m.role !== 'dm').length}/{data.room.settings.max_players}
      </h3>
      <ul className="rm-members">
        {ordered.map((m) => (
          <MemberRow key={m.user_id} m={m} card={cardOf(m)} isDm={isDm} me={me} busy={busy} onAct={act} />
        ))}
      </ul>
      {gone.length > 0 && (
        <details className="rm-gone">
          <summary>Вышли и исключены · {gone.length}</summary>
          <ul className="rm-members">
            {gone.map((m) => (
              <MemberRow key={m.user_id} m={m} isDm={isDm} me={me} busy={busy} onAct={act} />
            ))}
          </ul>
        </details>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}

/* ---------- приглашение ---------- */

export function InvitePanel() {
  const { data, roomId, setInviteCode } = useRoom()
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = data?.room.invite_code
  if (!code) return null

  const copy = async (what: 'link' | 'code') => {
    if (await copyText(what === 'link' ? inviteLink(code) : code)) {
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    }
  }
  const rotate = async () => {
    if (!confirm('Старая ссылка перестанет работать. Сменить код приглашения?')) return
    setBusy(true)
    setError(null)
    try {
      setInviteCode((await rotateInvite(roomId)).invite_code)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rm-panel">
      <h3 className="rm-panel-title">
        <KeyRound aria-hidden="true" /> Приглашение
      </h3>
      <div className="rm-invite">
        <output className="rm-code" aria-label="Код приглашения">
          {code}
        </output>
        <div className="rm-invite-acts">
          <button type="button" className="cs-btn" onClick={() => void copy('link')}>
            <Copy aria-hidden="true" /> {copied === 'link' ? 'Скопировано' : 'Копировать ссылку'}
          </button>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={() => void copy('code')}>
            {copied === 'code' ? 'Скопировано' : 'Только код'}
          </button>
          <button type="button" className="cw-mini-btn" disabled={busy} onClick={() => void rotate()} title="Старый код перестанет работать">
            <RefreshCw aria-hidden="true" /> сменить
          </button>
        </div>
      </div>
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}

/* ---------- настройки (мастер) ---------- */

const STATUSES: RoomStatus[] = ['lobby', 'active', 'paused', 'closed']
const STATUS_HINT: Record<RoomStatus, string> = {
  lobby: 'Сбор партии, игра ещё не началась',
  active: 'Идёт игра',
  paused: 'Перерыв',
  closed: 'Только чтение: команды отключены',
}

export function RoomSettingsPanel() {
  const { data, roomId } = useRoom()
  const navigate = useNavigate()
  const [name, setName] = useState(data?.room.name ?? '')
  const [description, setDescription] = useState(data?.room.description ?? '')
  const [maxPlayers, setMaxPlayers] = useState(data?.room.settings.max_players ?? 6)
  const [rollsHidden, setRollsHidden] = useState(data?.room.settings.allow_player_rolls_hidden ?? false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data) return null
  const room = data.room
  const dirty =
    name.trim() !== room.name ||
    description !== room.description ||
    maxPlayers !== room.settings.max_players ||
    rollsHidden !== room.settings.allow_player_rolls_hidden

  const run = async (fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      done?.()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const uploadCover = async (file: File | undefined) => {
    if (!file) return
    await run(async () => patchRoom(roomId, { cover_url: (await uploadMedia(file)).url }))
  }

  return (
    <div className="rm-panel">
      <h3 className="rm-panel-title">Статус</h3>
      <div className="rm-status-pick" role="radiogroup" aria-label="Статус комнаты">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={room.status === s}
            className={`rm-status-btn${room.status === s ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => void run(() => setRoomStatus(roomId, s))}
          >
            <b>{statusRu(s)}</b>
            <i>{STATUS_HINT[s]}</i>
          </button>
        ))}
      </div>

      <h3 className="rm-panel-title">Настройки</h3>
      <div className="rm-form">
        <Field label="Название">
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Описание">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Игроков не больше">
          <input type="number" min={1} max={20} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value) || 1)} />
        </Field>
        <label className="rm-check">
          <input type="checkbox" checked={rollsHidden} onChange={(e) => setRollsHidden(e.target.checked)} />
          <span>Игроки могут бросать скрыто (видит только мастер или сам игрок)</span>
        </label>
        <div className="rm-field">
          <span>Обложка</span>
          <div className="rm-cover-pick">
            <span className="rm-cover-prev">{room.cover_url && <Img src={room.cover_url} alt="" />}</span>
            <label className="cw-mini-btn">
              Заменить
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void uploadCover(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        <div className="rm-form-acts">
          <button
            type="button"
            className="cs-btn"
            disabled={busy || !dirty || !name.trim()}
            onClick={() =>
              void run(
                () =>
                  patchRoom(roomId, {
                    name: name.trim(),
                    description,
                    settings: { max_players: Math.max(1, Math.min(20, maxPlayers)), allow_player_rolls_hidden: rollsHidden },
                  }),
                () => {
                  setSaved(true)
                  setTimeout(() => setSaved(false), 1800)
                },
              )
            }
          >
            {saved ? 'Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>

      <h3 className="rm-panel-title is-danger">Опасная зона</h3>
      <button
        type="button"
        className="cs-btn cs-btn--ghost rm-danger"
        disabled={busy}
        onClick={() => {
          if (!confirm(`Удалить комнату «${room.name}» вместе со всем содержимым? Копии персонажей тоже исчезнут. Это нельзя отменить.`)) return
          void run(() => deleteRoom(roomId), () => navigate('/rooms'))
        }}
      >
        <Trash2 aria-hidden="true" /> Удалить комнату
      </button>
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}

/** Игроку — выйти из комнаты; вернуться можно с тем же героем и прогрессом */
export function LeavePanel() {
  const { roomId } = useRoom()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="rm-panel">
      <button
        type="button"
        className="cs-btn cs-btn--ghost rm-danger"
        disabled={busy}
        onClick={async () => {
          if (!confirm('Выйти из комнаты? Вернуться можно позже с тем же героем — прогресс сохранится.')) return
          setBusy(true)
          try {
            await leaveRoom(roomId)
            navigate('/rooms')
          } catch (e) {
            setError(errText(e))
            setBusy(false)
          }
        }}
      >
        <LogOut aria-hidden="true" /> Выйти из комнаты
      </button>
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}
