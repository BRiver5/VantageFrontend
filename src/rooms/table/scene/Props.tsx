import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Crown, Gem, Backpack } from 'lucide-react'
import type { AnyCreature, RoomItem } from '../../../types/rooms'
import { isFullCreature } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { creatureArt, creatureHp, creatureName, Hex, itemArt, itemName, originFromEvent, seed, type Origin } from '../parts'
import { auraClass, describeEffect, EffectSigils } from '../effects'
import { Img } from '../../../media'
import { slideFrom } from './motion'
import { type Bubble, RollBubble } from './Seat'

/* ---------- мешок ---------- */

export function Sack({ up, gulp }: { up: boolean; gulp: boolean }) {
  return (
    <div className={`tb-sack${up ? ' is-up' : ''}${gulp ? ' is-gulp' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 160 170">
        <defs>
          <linearGradient id="tb-burlap" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6d4d2a" />
            <stop offset="0.45" stopColor="#a67f4d" />
            <stop offset="1" stopColor="#5e4224" />
          </linearGradient>
          <pattern id="tb-weave" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M0 2.5H5M2.5 0V5" stroke="rgba(40,24,8,.26)" strokeWidth="0.8" />
          </pattern>
        </defs>
        {/* горловина: тёмное нутро */}
        <ellipse cx="80" cy="22" rx="58" ry="16" fill="#23160a" />
        <path d="M24 26c4 40-8 92-14 144h140c-6-52-18-104-14-144-16 14-96 14-112 0z" fill="url(#tb-burlap)" />
        <path d="M24 26c4 40-8 92-14 144h140c-6-52-18-104-14-144-16 14-96 14-112 0z" fill="url(#tb-weave)" />
        {/* отогнутый край */}
        <path d="M22 22c-2 10 2 18 6 20 14 12 90 12 104 0 4-2 8-10 6-20-16 18-100 18-116 0z" fill="#b8925c" />
        <path d="M22 22c-2 10 2 18 6 20 14 12 90 12 104 0 4-2 8-10 6-20-16 18-100 18-116 0z" fill="url(#tb-weave)" />
        {/* верёвка */}
        <path d="M28 54c20 12 84 12 104 0" fill="none" stroke="#e0c48d" strokeWidth="5" strokeLinecap="round" strokeDasharray="7 4" />
      </svg>
      <span className="tb-sack-mouth" />
    </div>
  )
}

/* ---------- существо на столе ---------- */

export function Token({ c, count, onOpen }: { c: AnyCreature; count: number; onOpen: (o: Origin) => void }) {
  const hp = creatureHp(c)
  const dx = (seed(c.id, 1) * 26 - 13).toFixed(0)
  const dy = (seed(c.id, 2) * 22 - 11).toFixed(0)
  const r = (seed(c.id, 4) * 16 - 8).toFixed(1)
  const hidden = isFullCreature(c) && c.on_screen_only
  const fx = (isFullCreature(c) ? c.conditions.map((e) => e.label) : (c.effects ?? [])).map((l) => describeEffect(l))
  return (
    <button
      type="button"
      className={`tb-token${hp.ratio === 0 ? ' is-down' : ''}${hidden ? ' is-hidden' : ''}${count > 8 ? ' is-small' : ''} ${auraClass(fx)}`}
      style={{ '--dx': `${dx}`, '--dy': `${dy}`, '--r': `${r}deg` } as CSSProperties}
      onClick={(e) => onOpen(originFromEvent(e))}
      aria-label={`${creatureName(c)}: открыть карту`}
    >
      <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
      <EffectSigils effects={fx} size="sm" />
      <b>{creatureName(c)}</b>
    </button>
  )
}

/* ---------- предмет на столе ---------- */

export function Loot({ item, origin, onOpen }: { item: RoomItem; origin?: Origin; onOpen: (o: Origin) => void }) {
  const el = useRef<HTMLButtonElement>(null)
  const art = itemArt(item)
  const [broken, setBroken] = useState(false)
  const dx = (seed(item.id, 5) * 26 - 13).toFixed(0)
  const dy = (seed(item.id, 6) * 22 - 11).toFixed(0)
  const r = (seed(item.id, 7) * 20 - 10).toFixed(1)
  useLayoutEffect(() => {
    if (el.current && origin) slideFrom(el.current, origin)
    // только при появлении
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <button
      ref={el}
      type="button"
      className={`tb-loot${item.magic_item ? ' is-magic' : ''}`}
      style={{ '--dx': `${dx}`, '--dy': `${dy}`, '--r': `${r}deg` } as CSSProperties}
      data-loot={item.id}
      onClick={(e) => onOpen(originFromEvent(e))}
      aria-label={`${itemName(item)}${item.quantity > 1 ? `, ${item.quantity} шт.` : ''}: рассмотреть`}
    >
      <span className="tb-loot-art" data-art>
        {art && !broken ? <Img src={art} alt="" draggable={false} onError={() => setBroken(true)} /> : item.magic_item ? <Gem aria-hidden="true" /> : <Backpack aria-hidden="true" />}
      </span>
      <span className="tb-loot-tag">
        {itemName(item)}
        {item.quantity > 1 && <em> ×{item.quantity}</em>}
      </span>
    </button>
  )
}

/* ---------- ширма напротив игрока ---------- */

export function DmProp({ bubble }: { bubble?: Bubble }) {
  const { data } = useRoom()
  const dm = data?.members.find((m) => m.role === 'dm')
  const name = dm?.display_name || dm?.nickname || 'Мастер'
  return (
    <div className={`tb-dmprop${dm?.online ? '' : ' is-away'}`} data-dm-prop title={`Мастер: ${name}`}>
      <svg viewBox="0 0 420 96" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tb-leather" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4b2f1c" />
            <stop offset="1" stopColor="#23140b" />
          </linearGradient>
        </defs>
        <path d="M6 96 L34 6 L136 0 L136 96 Z" fill="url(#tb-leather)" stroke="#8a6a2f" strokeWidth="1.5" />
        <path d="M136 0 L284 0 L284 96 L136 96 Z" fill="url(#tb-leather)" stroke="#8a6a2f" strokeWidth="1.5" />
        <path d="M284 0 L386 6 L414 96 L284 96 Z" fill="url(#tb-leather)" stroke="#8a6a2f" strokeWidth="1.5" />
        <path d="M152 84 L268 84 M152 14 L268 14" stroke="#c49a3c" strokeWidth="1" opacity="0.5" />
        <path d="M48 20 L122 16 M26 84 L122 84 M298 16 L372 20 M298 84 L394 84" stroke="#c49a3c" strokeWidth="1" opacity="0.32" />
      </svg>
      <span className="tb-dmprop-face">
        <Hex raw={dm?.avatar_url} name={name} icon={Crown} online={dm?.online} />
        {bubble && <RollBubble key={bubble.id} b={bubble} />}
      </span>
      <b>{name}</b>
    </div>
  )
}
