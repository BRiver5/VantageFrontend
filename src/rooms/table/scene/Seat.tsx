import { type CSSProperties } from 'react'
import type { CharacterCard } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { Hex, originFromEvent, seed, useHeroArt, type Origin } from '../parts'
import { auraClass, describeEffect, EffectSigils } from '../effects'

/* ---------- места за столом ---------- */

export interface SeatInfo {
  card: CharacterCard
  side: 'left' | 'right'
  y: number
  online?: boolean
  player?: string
}

export function Seat({ seat, bubble, nudge, onOpen }: { seat: SeatInfo; bubble?: Bubble; nudge: boolean; onOpen: (o: Origin) => void }) {
  const { card, side, y, online } = seat
  const { roomId, isDm } = useRoom()
  const art = useHeroArt(roomId, card.id, card.avatar_url, isDm)
  const down = card.hp.current <= 0
  const tilt = (seed(card.id, 3) * 14 - 7).toFixed(1)
  const fx = card.effects.map((l) => describeEffect(l))
  return (
    <button
      type="button"
      className={`tb-seat is-${side}${down ? ' is-down' : ''}${online === false ? ' is-away' : ''}${nudge ? ' is-nudge' : ''}`}
      style={{ top: `${y}%`, '--tilt': `${tilt}deg` } as CSSProperties}
      data-seat={card.id}
      onClick={(e) => onOpen(originFromEvent(e))}
      aria-label={`${card.name}: хиты ${card.hp.current} из ${card.hp.max}, КД ${card.ac}. Открыть карточку`}
    >
      <span className="tb-seat-paper" aria-hidden="true">
        <i>{card.name}</i>
      </span>
      <span className={`tb-seat-token ${auraClass(fx)}`}>
        <Hex raw={art} name={card.name} online={online} />
        <EffectSigils effects={fx} size="sm" />
        <b>{card.name}</b>
        {bubble && <RollBubble key={bubble.id} b={bubble} />}
      </span>
    </button>
  )
}

/* ---------- всплывающий результат броска рядом с тем, кто бросил ---------- */

export interface Bubble {
  id: string
  total: number | string
  label: string
  tone: '' | 'crit' | 'fumble'
}

export function RollBubble({ b }: { b: Bubble }) {
  return (
    <span className={`tb-bubble${b.tone ? ` is-${b.tone}` : ''}`} title={b.label}>
      <b>{b.total}</b>
      <i>{b.label}</i>
    </span>
  )
}
