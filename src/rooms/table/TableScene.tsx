/**
 * Стол — главная страница комнаты. Деревянная столешница, на которой лежит всё
 * нужное: из-за краёв выглядывают листы напарников с жетонами, напротив стоит
 * ширма мастера, в углу — карта с личными заметками, снизу — свой лист. Мастер
 * выставляет на стол существ (жетоны) и находки; предмет можно поднять и убрать
 * в мешок, который сам выдвигается из-за листа героя.
 */
import { MapField } from '../../maps/MapField'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Backpack } from 'lucide-react'
import { ApiError, type Currency } from '../../api'
import { CoinImg } from '../../coins'
import type { RollPayload, RoomItem } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { useRoomRoll } from '../RoomDice'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { claimItem } from '../roomsApi'
import { CreatureCard, HeroCard, LootCard } from './Cards'
import { cardRatio, errText, Hex, hpTone, originFromEvent, originOf, relayArt, relayKey, useHeroArt, type Origin } from './parts'
import { TopBar } from './TopBar'
import { auraClass, describeEffect, EffectSigils } from './effects'
import { Img } from '../../media'
import { COIN_ORDER, COIN_RU, bubbleOf, flyTo, relay } from './scene/motion'
import { NotesMapOpen } from './scene/Notes'
import { type Bubble, RollBubble, Seat, type SeatInfo } from './scene/Seat'
import { DmProp, Loot, Sack, Token } from './scene/Props'

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

