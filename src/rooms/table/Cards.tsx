/**
 * Карточки того, что лежит на столе: лист напарника (бумага выезжает из-за края),
 * карта существа (жетон переворачивается в карту, у мастера — с настройками на
 * обороте) и найденный предмет (его поднимают к глазам, а потом кладут в мешок).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, Hand, Minus, Plus, RotateCw, Shield, Star, Trash2, Undo2, X } from 'lucide-react'
import { ApiError } from '../../api'
import type { AnyCreature, CharacterCard, CreatureVisibility, HpVisibility, RoomCreature, RoomItem } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { creatureVitals, patchRoomCreature, removeRoomCreature, revealCreature, takeBackItem } from '../roomsApi'
import { cardRatio, creatureArt, creatureHp, creatureName, Emerge, errText, Hex, HpArc, itemArt, itemName, itemSub, Silhouette, SIZE_RU, useEmergeClose, type Origin } from './parts'

const sizeRu = (s: string | null | undefined) => (s ? (SIZE_RU[s] ?? s) : null)
export const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function CloseMark() {
  const close = useEmergeClose()
  return (
    <button type="button" className="tb-card-x" onClick={close} aria-label="Закрыть">
      <X aria-hidden="true" />
    </button>
  )
}

/* ---------- лист напарника ---------- */

export function HeroCard({ card, origin, online, player, rotate, onClose }: { card: CharacterCard; origin: Origin; online?: boolean; player?: string; rotate?: number; onClose: () => void }) {
  const { isDm, roomId } = useRoom()
  const ratio = cardRatio(card)
  return (
    <Emerge origin={origin} rotate={rotate} kind="paper" label={card.name} className="tb-herocard" onClose={onClose}>
      <CloseMark />
      <header>
        <Hex raw={card.avatar_url} name={card.name} ratio={ratio} online={online} />
        <div>
          <h2>{card.name}</h2>
          <p>
            {card.level} уровень{player ? ` · ${player}` : ''}
          </p>
        </div>
      </header>
      <div className="tb-herocard-vitals">
        <HpArc ratio={ratio} current={card.hp.current} max={card.hp.max} temp={card.hp.temp} />
        <span className="tb-ac" title="Класс доспеха">
          <Shield aria-hidden="true" />
          <b>{card.ac}</b>
        </span>
      </div>
      {card.effects.length > 0 ? (
        <ul className="tb-herocard-fx" aria-label="Состояния и эффекты">
          {card.effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="tb-herocard-calm">Ни эффектов, ни состояний.</p>
      )}
      {isDm && (
        <Link className="tb-inkbtn" to={`/rooms/${roomId}?hero=${card.id}`} onClick={onClose}>
          Открыть лист целиком
        </Link>
      )}
    </Emerge>
  )
}

/* ---------- существо: лицо карты ---------- */

const HP_OPTIONS: { key: HpVisibility; label: string }[] = [
  { key: 'exact', label: 'числом' },
  { key: 'band', label: 'словом' },
  { key: 'hidden', label: 'скрыты' },
]
const FLAGS: { key: keyof Omit<CreatureVisibility, 'hp'>; label: string }[] = [
  { key: 'name', label: 'Имя' },
  { key: 'image', label: 'Картинка' },
  { key: 'ac', label: 'КД' },
  { key: 'stats', label: 'Характеристики' },
  { key: 'actions', label: 'Действия' },
  { key: 'description', label: 'Описание' },
]
export const STAT_RU: Record<string, string> = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' }

export function statsOf(c: AnyCreature): [string, number | null][] {
  if (isFullCreature(c)) {
    const s = c.snapshot
    return [
      ['str', s.strenght],
      ['dex', s.dexterity],
      ['con', s.constitution],
      ['int', s.intelligence],
      ['wis', s.wisdom],
      ['cha', s.charisma],
    ]
  }
  return c.stats ? (Object.entries(c.stats) as [string, number | null][]) : []
}

/** Хиты мастером: число и три действия */
export function HpControls({ c }: { c: RoomCreature }) {
  const { roomId } = useRoom()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (op: 'damage' | 'heal' | 'temp') => {
    const n = Math.abs(parseInt(amount, 10))
    if (!n) return
    setBusy(true)
    setError(null)
    try {
      await creatureVitals(roomId, c.id, { op, amount: n })
      setAmount('')
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="tb-hpctl">
      <button type="button" className="is-dmg" disabled={busy || !amount} onClick={() => void act('damage')} aria-label="Урон" title="Урон">
        <Minus aria-hidden="true" />
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={amount}
        placeholder="хиты"
        aria-label="Сколько хитов"
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void act('damage')
        }}
      />
      <button type="button" className="is-heal" disabled={busy || !amount} onClick={() => void act('heal')} aria-label="Лечение" title="Лечение">
        <Plus aria-hidden="true" />
      </button>
      <button type="button" className="is-temp" disabled={busy || !amount} onClick={() => void act('temp')} aria-label="Временные хиты" title="Временные хиты">
        <Shield aria-hidden="true" />
      </button>
      {error && <span className="tb-err">{error}</span>}
    </div>
  )
}

/** Лицо карты существа: и в карточке на столе, и в ширме */
export function CreatureFace({ c, onFlip }: { c: AnyCreature; onFlip?: () => void }) {
  const { roomId, isDm } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = isFullCreature(c)
  const hp = creatureHp(c)
  const art = creatureArt(c)
  const stats = statsOf(c).filter(([, v]) => v != null)
  const ac = full ? c.snapshot.ac : c.ac
  const actions = full ? c.snapshot.actions : c.actions
  const description = full ? c.snapshot.creature_description : c.description
  const meta = full
    ? [c.snapshot.creature_type, sizeRu(c.snapshot.size), c.snapshot.challenge_rating != null ? `ПО ${c.snapshot.challenge_rating}` : null]
    : [c.creature_type, sizeRu(c.size)]
  const effects = full ? c.conditions.map((e) => e.label) : c.effects

  return (
    <div className="tb-face">
      <div className="tb-face-art">
        {art ? <img src={art} alt="" draggable={false} /> : <Silhouette enemy />}
        <span className="tb-face-shade" />
        <h2>{creatureName(c)}</h2>
        {ac != null && (
          <span className="tb-ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{ac}</b>
          </span>
        )}
      </div>
      <div className="tb-face-hp">
        <HpArc ratio={hp.ratio} current={hp.current} max={hp.max} temp={hp.temp} band={hp.band} />
      </div>
      <div className="tb-face-text">
        {meta.filter(Boolean).length > 0 && <p className="tb-face-meta">{meta.filter(Boolean).join(' · ')}</p>}
        {effects.length > 0 && <p className="tb-face-fx">{effects.join(' · ')}</p>}
        {stats.length > 0 && (
          <dl className="tb-face-stats">
            {stats.map(([k, v]) => (
              <div key={k}>
                <dt>{STAT_RU[k] ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {full && isDm && <HpControls c={c} />}
        {actions && actions.length > 0 && (
          <ul className="tb-face-acts">
            {actions.map((a, i) => (
              <li key={i}>
                <b>{a.name ?? a.title}</b> {a.description ?? a.text}
              </li>
            ))}
          </ul>
        )}
        {description && <p className="tb-face-desc">{stripTags(description)}</p>}
      </div>
      {full && isDm && (
        <footer className="tb-face-foot">
          {c.on_screen_only ? (
            <button
              type="button"
              className="tb-goldbtn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await revealCreature(roomId, c.id)
                } catch (e) {
                  setError(errText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Eye aria-hidden="true" /> Выставить на стол
            </button>
          ) : (
            <span className="tb-face-state">
              <Eye aria-hidden="true" /> на столе
            </span>
          )}
          {onFlip && (
            <button type="button" className="tb-linkbtn" onClick={onFlip}>
              <RotateCw aria-hidden="true" /> что видят игроки
            </button>
          )}
          {error && <span className="tb-err">{error}</span>}
        </footer>
      )}
    </div>
  )
}

/** Оборот карты: что открыто игрокам */
export function CreatureBack({ c, onFlip, onRemoved }: { c: RoomCreature; onFlip?: () => void; onRemoved?: () => void }) {
  const { roomId, data } = useRoom()
  const [publicName, setPublicName] = useState(c.public_name)
  const [error, setError] = useState<string | null>(null)
  const inCombat = !!data?.combat && data.combat.status !== 'ended'
  const patch = async (body: Parameters<typeof patchRoomCreature>[2]) => {
    setError(null)
    try {
      await patchRoomCreature(roomId, c.id, body)
    } catch (e) {
      setError(errText(e))
    }
  }
  const v = c.visibility
  return (
    <div className="tb-back">
      <h3>{c.display_name}</h3>
      <p className="tb-back-hint">Игроки увидят только открытые глаза.</p>
      <ul className="tb-eyes">
        {FLAGS.map(({ key, label }) => (
          <li key={key}>
            <button type="button" className={v[key] ? 'is-on' : ''} aria-pressed={v[key]} onClick={() => void patch({ visibility: { ...v, [key]: !v[key] } })}>
              {v[key] ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="tb-back-row">
        <span>Хиты</span>
        <div className="tb-tri" role="radiogroup" aria-label="Как видны хиты">
          {HP_OPTIONS.map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={v.hp === o.key} className={v.hp === o.key ? 'is-on' : ''} onClick={() => void patch({ visibility: { ...v, hp: o.key } })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {!v.name && (
        <label className="tb-back-row">
          <span>Имя для игроков</span>
          <input value={publicName} maxLength={120} onChange={(e) => setPublicName(e.target.value)} onBlur={() => publicName.trim() !== c.public_name && void patch({ public_name: publicName.trim() || 'Существо' })} />
        </label>
      )}
      <div className="tb-back-foot">
        <button type="button" className={`tb-linkbtn${c.quick_access ? ' is-on' : ''}`} aria-pressed={c.quick_access} onClick={() => void patch({ quick_access: !c.quick_access })}>
          <Star aria-hidden="true" /> быстрый доступ
        </button>
        <button
          type="button"
          className="tb-linkbtn is-danger"
          disabled={inCombat}
          title={inCombat ? 'Нельзя убрать, пока идёт бой' : undefined}
          onClick={async () => {
            if (!confirm(`Убрать «${c.display_name}» из комнаты?`)) return
            try {
              await removeRoomCreature(roomId, c.id)
              onRemoved?.()
            } catch (e) {
              setError(errText(e))
            }
          }}
        >
          <Trash2 aria-hidden="true" /> убрать
        </button>
        {onFlip && (
          <button type="button" className="tb-linkbtn" onClick={onFlip}>
            <RotateCw aria-hidden="true" /> перевернуть
          </button>
        )}
      </div>
      {error && <span className="tb-err">{error}</span>}
    </div>
  )
}

export function CreatureCard({ id, origin, onClose }: { id: string; origin: Origin; onClose: () => void }) {
  const { data } = useRoom()
  const [back, setBack] = useState(false)
  const c = data?.creatures.find((x) => x.id === id)
  if (!c) return null
  const full = isFullCreature(c)
  return (
    <Emerge origin={origin} kind="flip" label={creatureName(c)} className={`tb-tarot${full ? '' : ' is-simple'}`} onClose={onClose}>
      <CloseMark />
      <div className={`tb-tarot-in${back ? ' is-back' : ''}`}>
        <div className="tb-tarot-side">{!back && <CreatureFace c={c} onFlip={full ? () => setBack(true) : undefined} />}</div>
        {full && <div className="tb-tarot-side is-rear">{back && <CreatureBack c={c} onFlip={() => setBack(false)} onRemoved={onClose} />}</div>}
      </div>
    </Emerge>
  )
}

/* ---------- предмет ---------- */

function LootBody({ item, canClaim, onClaim }: { item: RoomItem; canClaim: boolean; onClaim: () => void }) {
  const { roomId, isDm, data } = useRoom()
  const close = useEmergeClose()
  const [error, setError] = useState<string | null>(null)
  const art = itemArt(item)
  const text = stripTags(item.magic_item?.description ?? item.equipment?.description ?? '')
  const closed = data?.room.status === 'closed'
  return (
    <>
      <CloseMark />
      <div className={`tb-lootcard-art${item.magic_item ? ' is-magic' : ''}`}>{art ? <img src={art} alt="" draggable={false} /> : <Hand aria-hidden="true" />}</div>
      <h2>
        {itemName(item)}
        {item.quantity > 1 && <em> ×{item.quantity}</em>}
      </h2>
      {itemSub(item) && <p className="tb-lootcard-sub">{itemSub(item)}</p>}
      {item.notes && <p className="tb-lootcard-note">{item.notes}</p>}
      {text && <p className="tb-lootcard-text">{text}</p>}
      <div className="tb-lootcard-acts">
        {canClaim && (
          <button
            type="button"
            className="tb-goldbtn"
            disabled={closed}
            onClick={() => {
              onClaim()
              close()
            }}
          >
            <Check aria-hidden="true" /> В мешок
          </button>
        )}
        {isDm && (
          <button
            type="button"
            className="tb-goldbtn is-quiet"
            onClick={async () => {
              try {
                await takeBackItem(roomId, item.id)
                close()
              } catch (e) {
                setError(e instanceof ApiError && e.status === 409 ? 'Предмет уже забрали.' : errText(e))
              }
            }}
          >
            <Undo2 aria-hidden="true" /> За ширму
          </button>
        )}
      </div>
      {error && <span className="tb-err">{error}</span>}
    </>
  )
}

export function LootCard({ item, origin, canClaim, onClaim, onClose }: { item: RoomItem; origin: Origin; canClaim: boolean; onClaim: () => void; onClose: () => void }) {
  return (
    <Emerge origin={origin} kind="object" label={itemName(item)} className="tb-lootcard" onClose={onClose}>
      <LootBody item={item} canClaim={canClaim} onClaim={onClaim} />
    </Emerge>
  )
}

