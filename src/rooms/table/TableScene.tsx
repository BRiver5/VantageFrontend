/**
 * Стол — главная страница комнаты. Деревянная столешница, на которой лежит всё
 * нужное: из-за краёв выглядывают листы напарников с жетонами, напротив стоит
 * ширма мастера, в углу — карта с личными заметками, снизу — свой лист. Мастер
 * выставляет на стол существ (жетоны) и находки; предмет можно поднять и убрать
 * в мешок, который сам выдвигается из-за листа героя.
 */
import { MapField } from '../../maps/MapField'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Crown, Gem, Backpack, Check, Feather, X } from 'lucide-react'
import { ApiError, getCharacter, roomCharacterRef, updateCharacter, type Currency } from '../../api'
import { CoinImg } from '../../coins'
import type { AnyCreature, CharacterCard, RollPayload, RoomItem } from '../../types/rooms'
import { isEngineRoll, isFullCreature } from '../../types/rooms'
import { useRoomRoll } from '../RoomDice'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { claimItem } from '../roomsApi'
import { CreatureCard, HeroCard, LootCard } from './Cards'
import { cardRatio, creatureArt, creatureHp, creatureName, Emerge, errText, Hex, hpTone, itemArt, itemName, originFromEvent, originOf, relayArt, relayKey, seed, useEmergeClose, useHeroArt, type Origin } from './parts'
import { TopBar } from './TopBar'
import { auraClass, describeEffect, EffectSigils } from './effects'
import { MarkdownBody } from '../kb/Markdown'
import { parsePage } from '../kb/mdparse'
import { Img } from '../../media'

/* ---------- полёт предмета ---------- */

const COIN_ORDER: Currency[] = ['pp', 'gp', 'ep', 'sp', 'cp']
const COIN_RU: Record<Currency, string> = { pp: 'пм', gp: 'зм', ep: 'эм', sp: 'см', cp: 'мм' }

const EASE_ARC = 'cubic-bezier(0.45, 0.05, 0.3, 1)'

/** Копия предмета летит по дуге от стола к цели и исчезает в ней */
function flyTo(from: Element, to: Element, onLanded: () => void) {
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const clone = from.cloneNode(true) as HTMLElement
  Object.assign(clone.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', zIndex: '130', pointerEvents: 'none' })
  clone.classList.add('tb-flying')
  document.body.appendChild(clone)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const lift = Math.min(-60, dy * 0.25 - 80)
  const anim = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.12}px, ${lift * 0.8}px) scale(1.22) rotate(-10deg)`, opacity: 1, offset: 0.32 },
      { transform: `translate(${dx * 0.72}px, ${dy * 0.55 + lift * 0.5}px) scale(0.86) rotate(14deg)`, opacity: 1, offset: 0.74 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.28) rotate(30deg)`, opacity: 0.25, offset: 1 },
    ],
    { duration: 820, easing: EASE_ARC, fill: 'forwards' },
  )
  anim.onfinish = () => {
    clone.remove()
    onLanded()
  }
}

/**
 * Передача из рук в руки: вещь выходит от отправителя, по дуге ложится на
 * середину стола, лежит мгновение и уже оттуда улетает получателю.
 */
function relay(from: Element | null, content: ReactNode, onLand: (piece: HTMLElement) => void) {
  const field = document.querySelector('.tb-field')
  if (!field) return
  const f = field.getBoundingClientRect()
  const node = document.createElement('div')
  node.className = 'tb-relay'
  document.body.appendChild(node)
  const root = createRoot(node)
  flushSync(() => root.render(content))
  const w = node.offsetWidth
  const h = node.offsetHeight
  const mx = f.left + f.width / 2 + (Math.random() * 2 - 1) * f.width * 0.12
  const my = f.top + f.height / 2 + (Math.random() * 2 - 1) * f.height * 0.1
  Object.assign(node.style, { left: `${mx - w / 2}px`, top: `${my - h / 2}px` })
  const s = from?.getBoundingClientRect()
  const dx = s ? s.left + s.width / 2 - mx : 0
  const dy = s ? s.top + s.height / 2 - my : -f.height / 2
  const lift = Math.min(-50, -Math.abs(dy) * 0.35 - 40)
  const tilt = (Math.random() * 2 - 1) * 9
  const drop = node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(-70deg)`, opacity: 0 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.5 + lift}px) scale(1.18) rotate(-18deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(0, 0) scale(0.94) rotate(${tilt + 4}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(0, -6px) scale(1.04) rotate(${tilt - 2}deg)`, opacity: 1, offset: 0.9 },
      { transform: `translate(0, 0) scale(1) rotate(${tilt}deg)`, opacity: 1 },
    ],
    { duration: 900, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)', fill: 'forwards' },
  )
  drop.onfinish = () => {
    // полежать на столе, чтобы все успели разглядеть, что передают
    setTimeout(() => {
      drop.cancel()
      node.style.transform = `rotate(${tilt}deg)`
      onLand(node)
      root.unmount()
      node.remove()
    }, 520)
  }
}

/** Предмет подъезжает к своему месту от того, кто его выложил */
function slideFrom(el: HTMLElement, origin: Origin) {
  const r = el.getBoundingClientRect()
  const dx = origin.x - (r.left + r.width / 2)
  const dy = origin.y - (r.top + r.height / 2)
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(-120deg)`, opacity: 0 },
      { transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) scale(1.14) rotate(8deg)`, opacity: 1, offset: 0.72 },
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    ],
    { duration: 760, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' },
  )
}

/* ---------- мешок ---------- */

function Sack({ up, gulp }: { up: boolean; gulp: boolean }) {
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

/* ---------- личные заметки: карта в углу ---------- */

function NotesMapOpen({ characterId, origin, onClose }: { characterId: string; origin: Origin; onClose: () => void }) {
  return (
    <Emerge origin={origin} kind="map" rotate={-16} label="Личные заметки" className="tb-mapopen" onClose={onClose}>
      <NotesPaper characterId={characterId} />
    </Emerge>
  )
}

/** Заметки, которые мастер открыл партии: только чтение */
function SharedNotesList() {
  const { data } = useRoom()
  const notes = [...(data?.sharedNotes ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order)
  if (notes.length === 0) return <p className="tb-map-wait">Мастер пока ничего не открыл</p>
  // ссылки ведут только на открытые партии страницы
  const lookup = { has: (t: string) => notes.some((x) => x.title.toLowerCase() === t.toLowerCase()), body: (t: string) => notes.find((x) => x.title.toLowerCase() === t.toLowerCase())?.body ?? null, titles: notes.map((x) => x.title) }
  return (
    <ul className="tb-shared">
      {notes.map((n) => (
        <li key={n.id} id={`shared-${n.id}`}>
          <h3>
            {parsePage(n.body).meta.icon ? `${parsePage(n.body).meta.icon} ` : ''}
            {n.title || 'Без названия'}
          </h3>
          {n.folder && <i>{n.folder}</i>}
          <div className="kb-doc is-paper">
            <MarkdownBody src={n.body} pages={lookup} onOpen={(t) => document.getElementById(`shared-${notes.find((x) => x.title.toLowerCase() === t.toLowerCase())?.id}`)?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function NotesPaper({ characterId }: { characterId: string }) {
  const { roomId, data } = useRoom()
  const close = useEmergeClose()
  const shared = data?.sharedNotes.length ?? 0
  const [tab, setTab] = useState<'mine' | 'shared'>('mine')
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const ref = roomCharacterRef(roomId, characterId)

  useEffect(() => {
    let alive = true
    getCharacter(ref)
      .then((c) => alive && setText(c.notes ?? ''))
      .catch(() => {
        if (!alive) return
        setText('')
        setState('error')
      })
    return () => {
      alive = false
    }
  }, [ref])

  const save = useCallback(async () => {
    const value = pending.current
    if (value == null) return
    pending.current = null
    setState('saving')
    try {
      await updateCharacter(ref, { notes: value } as Parameters<typeof updateCharacter>[1])
      setState(pending.current == null ? 'saved' : 'saving')
    } catch {
      setState('error')
    }
  }, [ref])

  // при закрытии не теряем последние строчки
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void save()
    },
    [save],
  )

  return (
    <>
      <span className="tb-map-folds" aria-hidden="true" />
      <button type="button" className="tb-card-x" onClick={close} aria-label="Закрыть">
        <X aria-hidden="true" />
      </button>
      <div className="tb-map-paper">
        {shared > 0 ? (
          <div className="tb-map-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-on' : ''} onClick={() => setTab('mine')}>
              Мои заметки
            </button>
            <button type="button" role="tab" aria-selected={tab === 'shared'} className={tab === 'shared' ? 'is-on' : ''} onClick={() => setTab('shared')}>
              От мастера <em>{shared}</em>
            </button>
          </div>
        ) : (
          <h2>Мои заметки</h2>
        )}
        {tab === 'shared' && shared > 0 ? (
          <SharedNotesList />
        ) : text == null ? (
          <p className="tb-map-wait">Разворачиваем карту…</p>
        ) : (
          <textarea
            value={text}
            placeholder="Имена, долги, подозрения, клады. Эту карту видите только вы."
            aria-label="Личные заметки"
            autoFocus
            onChange={(e) => {
              setText(e.target.value)
              pending.current = e.target.value
              setState('idle')
              clearTimeout(timer.current)
              timer.current = setTimeout(() => void save(), 700)
            }}
          />
        )}
        <small className={`tb-map-state is-${state}`} role="status">
          {state === 'saving' ? (
            <>
              <Feather aria-hidden="true" /> записываем…
            </>
          ) : state === 'saved' ? (
            <>
              <Check aria-hidden="true" /> записано
            </>
          ) : state === 'error' ? (
            'не удалось записать: чернила размыло'
          ) : (
            ''
          )}
        </small>
      </div>
    </>
  )
}

/* ---------- места за столом ---------- */

interface SeatInfo {
  card: CharacterCard
  side: 'left' | 'right'
  y: number
  online?: boolean
  player?: string
}

function Seat({ seat, bubble, nudge, onOpen }: { seat: SeatInfo; bubble?: Bubble; nudge: boolean; onOpen: (o: Origin) => void }) {
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

interface Bubble {
  id: string
  total: number | string
  label: string
  tone: '' | 'crit' | 'fumble'
}

function RollBubble({ b }: { b: Bubble }) {
  return (
    <span className={`tb-bubble${b.tone ? ` is-${b.tone}` : ''}`} title={b.label}>
      <b>{b.total}</b>
      <i>{b.label}</i>
    </span>
  )
}

function bubbleOf(id: string, p: RollPayload): Bubble {
  if (isEngineRoll(p)) return { id, total: p.engine.total, label: p.label, tone: '' }
  const d20 = p.dice.length === 1 && p.dice[0].sides === 20 && p.dice[0].rolls.length === 1 ? p.dice[0].rolls[0] : null
  return { id, total: p.total, label: p.label || p.expression, tone: d20 === 20 ? 'crit' : d20 === 1 ? 'fumble' : '' }
}

/* ---------- существо на столе ---------- */

function Token({ c, count, onOpen }: { c: AnyCreature; count: number; onOpen: (o: Origin) => void }) {
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

function Loot({ item, origin, onOpen }: { item: RoomItem; origin?: Origin; onOpen: (o: Origin) => void }) {
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

function DmProp({ bubble }: { bubble?: Bubble }) {
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

/* ---------- сцена ---------- */

export function TableScene({ onSheet }: { onSheet?: () => void }) {
  const { data, roomId, isDm } = useRoom()
  const rollApi = useRoomRoll()
  const mine = data?.me.room_character_id ?? null

  const [heroOpen, setHeroOpen] = useState<{ id: string; origin: Origin; rotate: number } | null>(null)
  const [creatureOpen, setCreatureOpen] = useState<{ id: string; origin: Origin } | null>(null)
  const [lootOpen, setLootOpen] = useState<{ id: string; origin: Origin } | null>(null)
  const [mapOrigin, setMapOrigin] = useState<Origin | null>(null)
  const [sack, setSack] = useState(false)
  const [gulp, setGulp] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({})
  const [nudges, setNudges] = useState<Record<string, boolean>>({})
  const sackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const origins = useRef(new Map<string, Origin>())

  const lowerSack = useCallback((ms: number) => {
    clearTimeout(sackTimer.current)
    sackTimer.current = setTimeout(() => setSack(false), ms)
  }, [])
  useEffect(() => () => clearTimeout(sackTimer.current), [])

  const memberOfCard = useCallback(
    (cardId: string) => data?.members.find((m) => m.room_character_id === cardId),
    [data?.members],
  )

  const seatEl = (cid: string | null | undefined) => (cid ? document.querySelector(`[data-seat="${cid}"]`) : null)

  useRoomEvents((msg) => {
    if (msg.type === 'item.claimed') {
      const p = msg.payload as { item_id: string; character_id: string }
      const art = document.querySelector(`[data-loot="${p.item_id}"] [data-art]`)
      if (!art) return
      if (p.character_id === mine) {
        const mouth = document.querySelector('.tb-sack-mouth')
        clearTimeout(sackTimer.current)
        setSack(true)
        if (mouth) {
          flyTo(art, mouth, () => {
            setGulp(true)
            setTimeout(() => setGulp(false), 480)
            lowerSack(760)
          })
        }
      } else {
        const seat = seatEl(p.character_id)
        if (seat) {
          flyTo(art, seat, () => {
            setNudges((n) => ({ ...n, [p.character_id]: true }))
            setTimeout(() => setNudges((n) => ({ ...n, [p.character_id]: false })), 520)
          })
        }
      }
      return
    }
    if (msg.type === 'item.transferred' || msg.type === 'currency.transferred') {
      if (msg.ts && Date.now() - Date.parse(msg.ts) > 20000) return
      const p = msg.payload as { from_character_id: string; to_character_id: string; name?: string; quantity?: number; amount?: Partial<Record<Currency, number>> }
      const handOf = (cid: string) => (cid === mine ? document.querySelector('.tb-mysheet-token') : seatEl(cid))
      let content: ReactNode
      if (msg.type === 'item.transferred') {
        const key = relayKey(p.from_character_id, p.to_character_id, p.name ?? '')
        const art = relayArt.get(key)
        relayArt.delete(key)
        content = (
          <>
            <span className="tb-relay-art">{art ? <Img src={art} alt="" draggable={false} /> : <Backpack aria-hidden="true" />}</span>
            <span className="tb-relay-tag">
              {p.name ?? 'Предмет'}
              {(p.quantity ?? 1) > 1 && <em> ×{p.quantity}</em>}
            </span>
          </>
        )
      } else {
        const coins = COIN_ORDER.filter((c) => (p.amount?.[c] ?? 0) > 0)
        if (coins.length === 0) return
        content = (
          <>
            <span className="tb-relay-art tb-relay-coins">
              {coins.slice(0, 3).map((c, i) => (
                <CoinImg key={c} currency={c} size={40} className={`is-${i}`} />
              ))}
            </span>
            <span className="tb-relay-tag">{coins.map((c) => `${p.amount?.[c]} ${COIN_RU[c]}`).join(' · ')}</span>
          </>
        )
      }
      const toMe = p.to_character_id === mine
      if (toMe) {
        clearTimeout(sackTimer.current)
        setSack(true)
      }
      relay(handOf(p.from_character_id), content, (piece) => {
        const target = toMe ? document.querySelector('.tb-sack-mouth') : handOf(p.to_character_id)
        if (!target) {
          if (toMe) lowerSack(300)
          return
        }
        flyTo(piece, target, () => {
          if (toMe) {
            setGulp(true)
            setTimeout(() => setGulp(false), 480)
            lowerSack(760)
          } else {
            setNudges((n) => ({ ...n, [p.to_character_id]: true }))
            setTimeout(() => setNudges((n) => ({ ...n, [p.to_character_id]: false })), 520)
          }
        })
      })
      return
    }
    if (msg.type === 'item.issued') {
      const p = msg.payload as { item?: RoomItem; target?: string; from_character_id?: string }
      if (!p.item || p.item.holder !== 'table') return
      // кто положил: герой — от его листа, иначе предмет приезжает от ширмы
      const from = p.from_character_id === mine ? document.querySelector('.tb-mysheet') : (seatEl(p.from_character_id) ?? document.querySelector('[data-dm-prop], .sc-bar'))
      origins.current.set(p.item.id, originOf(from))
      return
    }
    if (msg.type === 'dice.rolled') {
      const p = msg.payload as RollPayload
      if (msg.ts && Date.now() - Date.parse(msg.ts) > 20000) return
      const actor = msg.actor?.user_id
      const cid = ('character_id' in p ? p.character_id : null) ?? data?.members.find((m) => m.user_id === actor)?.room_character_id ?? null
      const dmRoll = !cid && data?.members.find((m) => m.user_id === actor)?.role === 'dm'
      const key = cid ?? (dmRoll ? '__dm' : null)
      if (!key) return
      const b = bubbleOf(String(msg.seq), p)
      void (rollApi?.whenPlayed(msg.seq) ?? Promise.resolve()).then(() => {
        setBubbles((all) => ({ ...all, [key]: b }))
        setTimeout(() => setBubbles((all) => (all[key]?.id === b.id ? Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)) : all)), 5200)
      })
    }
  })

  const meCard = data?.characters.find((c) => c.id === mine)
  const myArtHook = useHeroArt(roomId, mine, meCard?.avatar_url, true)

  const seats = useMemo<SeatInfo[]>(() => {
    if (!data) return []
    const others = data.characters.filter((c) => c.id !== mine)
    const leftN = Math.ceil(others.length / 2)
    const rightN = others.length - leftN
    const spot = (i: number, n: number) => (n === 1 ? 44 : 24 + (44 / (n - 1)) * i)
    return others.map((card, i) => {
      const left = i % 2 === 0
      const idx = left ? i / 2 : (i - 1) / 2
      const m = memberOfCard(card.id)
      return {
        card,
        side: left ? 'left' : 'right',
        y: spot(idx, left ? leftN : rightN),
        online: m?.online,
        player: m?.display_name || m?.nickname || undefined,
      }
    })
  }, [data, mine, memberOfCard])

  if (!data) return null

  const closed = data.room.status === 'closed'
  const tokens = data.creatures.filter((c) => !isFullCreature(c) || !c.on_screen_only)
  const loot = data.items.filter((i) => i.holder === 'table')
  const me = data.characters.find((c) => c.id === mine)
  const myArt = myArtHook
  const openLoot = lootOpen ? loot.find((i) => i.id === lootOpen.id) : null
  const openHero = heroOpen ? data.characters.find((c) => c.id === heroOpen.id) : null

  const claim = async (item: RoomItem) => {
    if (!mine) return
    clearTimeout(sackTimer.current)
    setSack(true)
    setClaimError(null)
    try {
      await claimItem(roomId, item.id, mine)
      // страховка: если событие потеряется, мешок всё равно уедет
      lowerSack(3000)
    } catch (e) {
      setClaimError(e instanceof ApiError && e.status === 409 ? 'Кто-то оказался быстрее!' : errText(e))
      setTimeout(() => setClaimError(null), 2600)
      lowerSack(500)
    }
  }

  return (
    <div className={`tb-scene${isDm ? ' is-dm' : ''}`}>
      <span className="tb-wood" aria-hidden="true" />
      <span className="tb-light" aria-hidden="true" />

      <TopBar onSheet={onSheet} />

      {!isDm && <DmProp bubble={bubbles.__dm} />}

      {seats.map((s) => (
        <Seat
          key={s.card.id}
          seat={s}
          bubble={bubbles[s.card.id]}
          nudge={!!nudges[s.card.id]}
          onOpen={(origin) => setHeroOpen({ id: s.card.id, origin, rotate: s.side === 'left' ? -24 : 24 })}
        />
      ))}

      <div className={`tb-field${data?.activeMap ? ' has-map' : ''}`}>
        {data?.activeMap && (
          <div className="tb-map">
            <MapField
              onOpen={(t) => {
                if (t.creature_id) setCreatureOpen({ id: t.creature_id, origin: originOf(null) })
                else if (t.character_id) setHeroOpen({ id: t.character_id, origin: originOf(null), rotate: 0 })
              }}
            />
          </div>
        )}
        {!data?.activeMap && tokens.length > 0 && (
          <div className="tb-tokens" aria-label="Существа на столе">
            {tokens.map((c) => (
              <Token key={c.id} c={c} count={tokens.length} onOpen={(origin) => setCreatureOpen({ id: c.id, origin })} />
            ))}
          </div>
        )}
        {loot.length > 0 && (
          <div className="tb-loots" aria-label="Находки на столе">
            {loot.map((it) => (
              <Loot
                key={it.id}
                item={it}
                origin={origins.current.get(it.id)}
                onOpen={(origin) => setLootOpen({ id: it.id, origin })}
              />
            ))}
          </div>
        )}
        {!data?.activeMap && tokens.length === 0 && loot.length === 0 && (
          <p className="tb-carved">{isDm ? 'Выставьте сюда существ и находки из ширмы' : 'Стол пуст. Мастер выложит сюда находки'}</p>
        )}
      </div>

      {claimError && (
        <p className="tb-claimerr" role="alert">
          {claimError}
        </p>
      )}

      {/* свой лист и всё, что рядом с ним */}
      {me && (
        <>
          <button type="button" className="tb-mysheet" onClick={onSheet} aria-label={`Открыть лист героя: ${me.name}`}>
            <span className="tb-mysheet-paper" aria-hidden="true">
              <i>{me.name}</i>
              <u>{me.level} уровень</u>
            </span>
            <span className={`tb-mysheet-token ${auraClass(me.effects.map((l) => describeEffect(l)))}`}>
              <Hex raw={myArt} name={me.name} tone={hpTone(cardRatio(me)) === 'down' ? 'down' : undefined} />
              <EffectSigils effects={me.effects.map((l) => describeEffect(l))} />
              <b>
                {me.hp.current}
                <i>/{me.hp.max}</i>
              </b>
              {bubbles[me.id] && <RollBubble key={bubbles[me.id].id} b={bubbles[me.id]} />}
            </span>
          </button>
          <Sack up={sack} gulp={gulp} />
          <button
            type="button"
            className="tb-mapcorner"
            onClick={(e) => setMapOrigin(originFromEvent(e))}
            aria-label={data.sharedNotes.length ? `Заметки: своя и ${data.sharedNotes.length} от мастера` : 'Личные заметки'}
            title="Заметки"
          >
            <span aria-hidden="true" />
            {data.sharedNotes.length > 0 && <em className="tb-mapcorner-seal">{data.sharedNotes.length}</em>}
          </button>
        </>
      )}

      {openHero && heroOpen && (
        <HeroCard
          card={openHero}
          origin={heroOpen.origin}
          rotate={heroOpen.rotate}
          online={memberOfCard(openHero.id)?.online}
          player={memberOfCard(openHero.id)?.display_name || memberOfCard(openHero.id)?.nickname || undefined}
          onClose={() => setHeroOpen(null)}
        />
      )}
      {creatureOpen && <CreatureCard id={creatureOpen.id} origin={creatureOpen.origin} onClose={() => setCreatureOpen(null)} />}
      {openLoot && lootOpen && (
        <LootCard
          item={openLoot}
          origin={lootOpen.origin}
          canClaim={!!mine && !closed}
          onClaim={() => void claim(openLoot)}
          onClose={() => setLootOpen(null)}
        />
      )}
      {mapOrigin && mine && <NotesMapOpen characterId={mine} origin={mapOrigin} onClose={() => setMapOrigin(null)} />}
    </div>
  )
}

