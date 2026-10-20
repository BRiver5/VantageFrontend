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

export interface DiceApi {
  /** Бросок в процессе — кнопки должны блокироваться */
  rolling: boolean
  roll: (notation: string) => Promise<number[]>
}

export function useDice(): DiceApi {
  const isRolling = useSyncExternalStore(subscribe, () => rolling)
  return { rolling: isRolling, roll: rollDice }
}
