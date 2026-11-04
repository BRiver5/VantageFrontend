/**
 * Кости в комнате. Бросает сервер: клиент отправляет запрос и показывает то,
 * что пришло событием `dice.rolled`, — у ВСЕХ, включая бросившего, и значения
 * берутся из события, а не случайные. Кубики катятся в 3D и падают ровно на
 * выпавшие грани (см. dice/forcedFaces.ts) в цвете бросившего игрока.
 *
 * Мост также:
 *  - подменяет бросок из лотка костей запросом на сервер;
 *  - показывает «Анна бросает…» по событию `dice.rolling`;
 *  - выдаёт листу `roll()` и `whenPlayed(seq)`: сначала кости ложатся, потом
 *    лист показывает «театр» с числами;
 *  - выводит карточки чужих бросков.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dices } from 'lucide-react'
import { playForcedRoll, setRoomRollHandler, type ForcedDie, type RoomRollVisibility } from '../dice/diceControl'
import type { DiceRollEvent, RollPayload, RollRequest, RoomEventMessage } from '../types/rooms'
import { isEngineRoll } from '../types/rooms'
import { rollSummary } from './applyEvent'
import { useRoom } from './RoomProvider'
import { rollInRoom } from './roomsApi'

/** События старше этого при догоне (sync) не анимируем: только запись в журнале */
const FRESH_MS = 20000
/** Больше костей на сцену не выкладываем: текст всё равно покажет итог */
const MAX_ANIMATED = 30
const TOAST_MS = 6500
const ROLLING_MS = 5000

export interface RoomRollApi {
  /** Отправить бросок: экран обновится событием; в ответе — значения для вызывающего */
  roll: (req: Omit<RollRequest, 'character_id'> & { character_id?: string | null }) => Promise<DiceRollEvent & { seq: number }>
  /** Кости этого броска легли (или вышло время): можно показывать числа */
  whenPlayed: (seq: number | null | undefined) => Promise<void>
  /** Кто сейчас бросает */
  rolling: { user_id: string; label: string }[]
  /** Мой персонаж в комнате (у мастера нет) */
  characterId: string | null
}

const RoomRollContext = createContext<RoomRollApi | null>(null)

/** null вне комнаты: лист и лоток работают локально */
export const useRoomRoll = (): RoomRollApi | null => useContext(RoomRollContext)

/* ---------- из события — в кости на сцене ---------- */

const sidesOf = (dice: string) => Number(/d(\d+)/i.exec(dice)?.[1]) || 6

export function forcedDiceOf(p: RollPayload): ForcedDie[] {
  let list: ForcedDie[]
  if (isEngineRoll(p)) {
    const sides = sidesOf(p.engine.dice)
    list = p.engine.rolls.map((value) => ({ sides, value }))
  } else {
    list = p.dice.flatMap((d) => d.rolls.map((value) => ({ sides: d.sides, value })))
    // преимущество и помеха: в dice только оставленный к20, второй восстанавливаем из итога
    if (p.mode && p.discarded_total != null && p.dice.length === 1 && p.dice[0].sides === 20 && list.length === 1) {
      const other = p.discarded_total - p.modifier
      if (other >= 1 && other <= 20) list.push({ sides: 20, value: other })
    }
  }
  return list.slice(0, MAX_ANIMATED)
}

/* ---------- карточки чужих бросков ---------- */

interface RollToast {
  id: string
  who: string
  label: string
  text: string
  tone: '' | 'crit' | 'fumble'
}

function toastOf(msg: RoomEventMessage, who: string): RollToast | null {
  const p = msg.payload as RollPayload
  if (isEngineRoll(p)) {
    return { id: `${msg.seq}`, who, label: p.label, text: `${p.engine.dice} [${p.engine.rolls.join(', ')}] = ${p.engine.total}`, tone: '' }
  }
  const d20 = p.dice.length === 1 && p.dice[0].sides === 20 && p.dice[0].rolls.length === 1 ? p.dice[0].rolls[0] : null
  return { id: `${msg.seq}`, who, label: p.label || p.expression, text: rollSummary(p), tone: d20 === 20 ? 'crit' : d20 === 1 ? 'fumble' : '' }
}

export function RollToasts({ toasts }: { toasts: RollToast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="rm-toasts" role="log" aria-live="polite" aria-label="Броски других игроков">
      {toasts.map((t) => (
        <div key={t.id} className={`rm-toast${t.tone ? ` is-${t.tone}` : ''}`}>
          <Dices aria-hidden="true" />
          <span>
            <b>{t.who}</b>
            <i>{t.label}</i>
          </span>
          <strong>{t.text}</strong>
        </div>
      ))}
    </div>
  )
}

/* ---------- мост ---------- */

export function RoomDiceBridge({ children }: { children: ReactNode }) {
  const { roomId, data, subscribe, sendRolling, isDm } = useRoom()
  const allowHidden = !!data?.room.settings?.allow_player_rolls_hidden
  const [rolling, setRolling] = useState<RoomRollApi['rolling']>([])
  const [toasts, setToasts] = useState<RollToast[]>([])
  const played = useRef(new Map<number, Promise<void>>())
  const waiters = useRef(new Map<number, (() => void)[]>())
  const meId = data?.me.user_id ?? ''
  const characterId = data?.me.room_character_id ?? null
  const nameOf = useRef<(id: string | null | undefined) => string>(() => '')
  nameOf.current = (id) => {
    if (!id) return ''
    const m = data?.members.find((x) => x.user_id === id)
    return m?.display_name || m?.nickname || ''
  }

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'dice.rolling') {
        const p = msg.payload as { user_id: string; label: string }
        setRolling((list) => [...list.filter((x) => x.user_id !== p.user_id), { user_id: p.user_id, label: p.label }])
        setTimeout(() => setRolling((list) => list.filter((x) => x.user_id !== p.user_id)), ROLLING_MS)
        return
      }
      if (msg.type !== 'dice.rolled' && msg.type !== 'dice.revealed') return
      const revealed = msg.type === 'dice.revealed'

      const p = msg.payload as RollPayload
      const actor = msg.actor?.user_id ?? null
      if (actor && !revealed) setRolling((list) => list.filter((x) => x.user_id !== actor))

      const fresh = !msg.ts || Date.now() - Date.parse(msg.ts) < FRESH_MS
      const dice = forcedDiceOf(p)
      // раскрытый бросок мастер уже видел: катим кости только тем, кто его не видел
      const sawIt = revealed && (isDm || (!isEngineRoll(p) && p.visibility !== 'blind' && !!p.character_id && p.character_id === characterId))
      const animate = fresh && !sawIt && dice.length > 0 && document.visibilityState === 'visible'
      const style = isEngineRoll(p) ? null : p.dice_style
      const done: Promise<void> = animate
        ? playForcedRoll({ dice, themeColor: style?.body_color }).then(
            () => undefined,
            () => undefined,
          )
        : Promise.resolve()

      // свой бросок лист покажет «театром» сам; чужой — коротким тостом, когда кости легли
      const mine = !!actor && actor === meId && !revealed
      const who = nameOf.current(actor) || msg.actor?.label || ''
      const base = !mine && fresh ? toastOf(msg, who) : null
      const toast = base && revealed ? { ...base, label: `раскрыто · ${base.label}` } : base
      void done.then(() => {
        if (toast) {
          setToasts((list) => [...list.slice(-3), toast])
          setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), TOAST_MS)
        }
        if (msg.seq != null) {
          waiters.current.get(msg.seq)?.forEach((f) => f())
          waiters.current.delete(msg.seq)
        }
      })
      if (msg.seq != null) {
        played.current.set(msg.seq, done)
        // карта нужна только на время броска
        setTimeout(() => played.current.delete(msg.seq as number), 30000)
      }
    })
  }, [subscribe, meId, isDm, characterId])

  const roll = useCallback<RoomRollApi['roll']>(
    async (req) => {
      // скрытый бросок не анонсируем: «Анна бросает…» выдало бы его
      if (!req.visibility || req.visibility === 'public') sendRolling(req.label || 'Бросок')
      return rollInRoom(roomId, { visibility: 'public', ...req, character_id: req.character_id ?? characterId })
    },
    [roomId, characterId, sendRolling],
  )

  const whenPlayed = useCallback<RoomRollApi['whenPlayed']>((seq) => {
    if (seq == null) return Promise.resolve()
    const known = played.current.get(seq)
    if (known) return known
    // событие может прийти позже ответа REST: ждём, но не бесконечно
    return new Promise<void>((resolve) => {
      const list = waiters.current.get(seq) ?? []
      waiters.current.set(seq, [...list, resolve])
      setTimeout(resolve, 7000)
    })
  }, [])

  // лоток костей в комнате шлёт броски на сервер. Скрытые режимы: мастеру — «скрыто»;
  // игроку вслепую можно всегда, «себе и мастеру» — если мастер разрешил
  const hiddenModes = useMemo<RoomRollVisibility[]>(() => (isDm ? ['dm'] : allowHidden ? ['dm', 'blind'] : ['blind']), [isDm, allowHidden])
  useEffect(
    () =>
      setRoomRollHandler(async (req) => {
        await roll({ expression: req.expression, label: req.label, mode: req.mode ?? null, visibility: req.visibility ?? 'public' })
        if (req.visibility === 'blind' && !isDm) {
          // сам бросивший получит noop: скажем, что бросок ушёл
          const t: RollToast = { id: `blind-${Date.now()}`, who: 'Вслепую', label: req.label || req.expression, text: 'итог увидит только мастер', tone: '' }
          setToasts((list) => [...list.slice(-3), t])
          setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), TOAST_MS)
        }
      }, hiddenModes),
    [roll, hiddenModes, isDm],
  )

  const value = useMemo<RoomRollApi>(() => ({ roll, whenPlayed, rolling, characterId }), [roll, whenPlayed, rolling, characterId])

  return (
    <RoomRollContext.Provider value={value}>
      {children}
      <RollToasts toasts={toasts} />
    </RoomRollContext.Provider>
  )
}

/** «Анна бросает: Атака…» — для шапки комнаты */
export function RollingNow() {
  const api = useRoomRoll()
  const { data } = useRoom()
  if (!api || api.rolling.length === 0) return null
  const name = (id: string) => data?.members.find((m) => m.user_id === id)?.display_name || data?.members.find((m) => m.user_id === id)?.nickname || 'Кто-то'
  return (
    <span className="rm-rolling" role="status">
      <Dices aria-hidden="true" />
      {api.rolling.map((r) => `${name(r.user_id)}: ${r.label}`).join(' · ')}…
    </span>
  )
}
