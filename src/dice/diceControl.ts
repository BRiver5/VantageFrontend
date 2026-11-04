/**
 * Бросок общих 3D-костей из кода.
 *
 * DiceRoller живёт один на всё приложение (вне `.page`, поэтому его fixed-сцена
 * не попадает под transform анимации роутов). Он регистрирует здесь свой
 * обработчик, а визард и другие места бросают через `useDice().roll` — без
 * второй сцены и без оверлея результата лотка.
 */
import { useSyncExternalStore } from 'react'

type Roller = (notation: string) => Promise<number[]>

let roller: Roller | null = null
let rolling = false
const listeners = new Set<() => void>()

function setRolling(value: boolean) {
  rolling = value
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Вызывается из DiceRoller; возвращает отписку */
export function registerDiceRoller(fn: Roller): () => void {
  roller = fn
  return () => {
    if (roller === fn) roller = null
  }
}

/** Бросает нотацию вида «4d6» общими костями и возвращает выпавшие значения */
export async function rollDice(notation: string): Promise<number[]> {
  if (!roller) throw new Error('Кости недоступны')
  if (rolling) throw new Error('Кости уже катятся')
  setRolling(true)
  try {
    return await roller(notation)
  } finally {
    setRolling(false)
  }
}

/* ---------- кости с заданным исходом (комнаты) ---------- */

export interface ForcedDie {
  sides: number
  /** значение, которое сервер уже выбросил */
  value: number
}
export interface ForcedRoll {
  dice: ForcedDie[]
  /** цвет корпуса бросившего; цвет цифр и акцент в текстуре темы, на бросок не меняются */
  themeColor?: string
}
type ForcedRoller = (roll: ForcedRoll) => Promise<number[]>

const FORCED_TIMEOUT_MS = 12000
/** Для автотестов: какие броски запускались */
let addForcedListener: ((roll: ForcedRoll) => void) | null = null

let forcedRoller: ForcedRoller | null = null
/** Очередь: чужие броски катятся по одному и не стирают друг друга со сцены */
let forcedQueue: Promise<unknown> = Promise.resolve()

/** Вызывается из DiceRoller; возвращает отписку */
export function registerForcedRoller(fn: ForcedRoller): () => void {
  forcedRoller = fn
  return () => {
    if (forcedRoller === fn) forcedRoller = null
  }
}

/**
 * Показать на 3D-костях бросок, значения которого уже известны. Возвращает
 * значения, которые кубики показали на самом деле (для проверки).
 */
export function playForcedRoll(roll: ForcedRoll): Promise<number[]> {
  addForcedListener?.(roll)
  const run = () => {
    if (!forcedRoller) return Promise.reject(new Error('Кости недоступны'))
    // зависший бросок (скрытая вкладка не рисует кадры) не должен держать очередь
    return Promise.race([
      forcedRoller(roll),
      new Promise<number[]>((_, reject) => setTimeout(() => reject(new Error('Бросок не завершился')), FORCED_TIMEOUT_MS)),
    ])
  }
  const p = forcedQueue.then(run, run)
  forcedQueue = p.catch(() => undefined)
  return p
}

/* ---------- режим комнаты: бросает сервер ---------- */

/** Кто увидит бросок: всем; мне и мастеру; вслепую — только мастер */
export type RoomRollVisibility = 'public' | 'dm' | 'self' | 'blind'

export interface RoomRollRequest {
  expression: string
  label?: string
  mode?: 'adv' | 'dis' | null
  visibility?: RoomRollVisibility
}
/** Пока комната открыта, лоток костей шлёт броски на сервер вместо локального броска */
type RoomRollHandler = (req: RoomRollRequest) => Promise<void>

let roomHandler: RoomRollHandler | null = null
/** Скрытые режимы, доступные в этой комнате (кроме «всем») */
let roomVisibilities: RoomRollVisibility[] = []
const visListeners = new Set<() => void>()

/** Вызывается мостом комнаты; возвращает отписку */
export function setRoomRollHandler(fn: RoomRollHandler | null, visibilities: RoomRollVisibility[] = []): () => void {
  roomHandler = fn
  roomVisibilities = fn ? visibilities : []
  visListeners.forEach((l) => l())
  return () => {
    if (roomHandler !== fn) return
    roomHandler = null
    roomVisibilities = []
    visListeners.forEach((l) => l())
  }
}
export const getRoomRollHandler = () => roomHandler

/** Какие скрытые броски можно делать из лотка: пусто — только открытые */
export function useRoomRollVisibilities(): RoomRollVisibility[] {
  return useSyncExternalStore(
    (l) => {
      visListeners.add(l)
      return () => visListeners.delete(l)
    },
    () => roomVisibilities,
  )
}

export interface DiceApi {
  /** Бросок в процессе — кнопки должны блокироваться */
  rolling: boolean
  roll: (notation: string) => Promise<number[]>
}

export function useDice(): DiceApi {
  const isRolling = useSyncExternalStore(subscribe, () => rolling)
  return { rolling: isRolling, roll: rollDice }
}

// Крюк для проверок в браузере: только в dev или в тестовой сборке (VITE_DICE_TEST_HOOK=1)
if ((import.meta.env.DEV || import.meta.env.VITE_DICE_TEST_HOOK) && typeof window !== 'undefined') {
  const forcedLog: { at: number; dice: ForcedDie[] }[] = []
  Object.assign(window, {
    __forcedLog: forcedLog,
    __playForcedRoll: playForcedRoll,
  })
  addForcedListener = (roll) => forcedLog.push({ at: Date.now(), dice: roll.dice })
}
