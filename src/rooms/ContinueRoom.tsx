/**
 * «Продолжить» на главной: комната, в которой вы играете сейчас. Берём из
 * списка комнат самую живую (идёт бой → идёт игра → пауза → лобби, затем
 * по свежести) и дочитываем её снимок: кто онлайн, ваш герой, раунд боя.
 * Гостю и тем, у кого комнат нет, полоски нет.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Crown, Hourglass, Swords } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { parsePortrait } from '../characters/portrait'
import { Img } from '../media'
import type { RoomListItem, RoomState } from '../types/rooms'
import { getRoomState, listRooms } from './roomsApi'

const RANK: Record<string, number> = { active: 0, paused: 1, lobby: 2 }
const STATUS: Record<string, string> = { active: 'идёт игра', paused: 'пауза', lobby: 'сбор отряда' }

function pick(rooms: RoomListItem[]): RoomListItem | null {
  const live = rooms.filter((r) => r.my_status === 'approved' && r.status !== 'closed')
  live.sort(
    (a, b) =>
      Number(!!b.active_combat_id) - Number(!!a.active_combat_id) ||
      (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) ||
      Date.parse(b.updated_at ?? '0') - Date.parse(a.updated_at ?? '0'),
  )
  return live[0] ?? null
}

export function ContinueRoom() {
  const { user } = useAuth()
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null)
  const [state, setState] = useState<RoomState | null>(null)

  useEffect(() => {
    if (!user) return
    let on = true
    listRooms('low').then(
      (list) => {
        if (!on) return
        setRooms(list)
        const room = pick(list)
        if (room) getRoomState(room.id, 'low').then((s) => on && setState(s), () => undefined)
      },
      () => on && setRooms([]),
    )
    return () => {
      on = false
    }
  }, [user])

  if (!user || !rooms) return null
  const room = pick(rooms)
  const waiting = rooms.filter((r) => r.my_status === 'pending')
  if (!room) {
    if (!waiting.length) return null
    return (
      <Link to="/rooms" className="cr-wait">
        <Hourglass aria-hidden="true" /> Заявка в «{waiting[0].name}» ждёт мастера
      </Link>
    )
  }

  const isDm = room.my_role === 'dm'
  const hero = state?.characters.find((c) => c.id === state.me.room_character_id) ?? null
  const online = state?.online ?? []
  const combat = state?.combat && state.combat.status !== 'ended' ? state.combat : null
  const others = rooms.filter((r) => r.id !== room.id && r.my_status === 'approved' && r.status !== 'closed').length
  const portrait = hero?.avatar_url ? parsePortrait(hero.avatar_url).src : null

  return (
    <div className="cr-wrap">
      <Link to={`/rooms/${room.id}`} className={`cr-card${combat ? ' is-combat' : ''}`} aria-label={`Продолжить: ${room.name}`}>
        {room.cover_url && <Img className="cr-cover" src={room.cover_url} alt="" draggable={false} />}
        <span className="cr-face" aria-hidden="true">
          {isDm ? <Crown /> : portrait ? <Img src={portrait} alt="" draggable={false} /> : <b>{(hero?.name ?? room.name).slice(0, 1)}</b>}
        </span>
        <span className="cr-text">
          <i className="cr-kicker">Продолжить</i>
          <b className="cr-name">{room.name}</b>
          <span className="cr-meta">
            {combat ? (
              <em className="cr-fight">
                <Swords aria-hidden="true" /> {combat.status === 'setup' ? 'бой начинается' : `бой · раунд ${combat.round}`}
              </em>
            ) : (
              <em className={`cr-status is-${room.status}`}>{STATUS[room.status] ?? room.status}</em>
            )}
            <span>{isDm ? 'вы мастер' : hero ? `${hero.name}, ${hero.level} ур.` : 'игрок'}</span>
            {online.length > 0 && (
              <span className="cr-online" title={online.map((o) => o.label).join(', ')}>
                <i aria-hidden="true" /> онлайн {online.length}
              </span>
            )}
            {isDm && (room.pending_requests ?? 0) > 0 && <span className="cr-req">заявки: {room.pending_requests}</span>}
          </span>
        </span>
        <span className="cr-go">
          За стол <ChevronRight aria-hidden="true" />
        </span>
      </Link>
      {(others > 0 || waiting.length > 0) && (
        <Link to="/rooms" className="cr-more">
          {others > 0 ? `ещё ${others} ${plural(others, 'комната', 'комнаты', 'комнат')}` : `заявок ждёт: ${waiting.length}`}
        </Link>
      )}
    </div>
  )
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
