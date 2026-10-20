/**
 * Своя 3D-сцена костей для визарда.
 *
 * Глобальный DiceRoller — плавающий виджет с собственным состоянием, его нельзя
 * попросить бросить кость из кода. Поэтому здесь поднимается отдельный
 * экземпляр dice-box с той же темой `vantage` и теми же ассетами, а шаги
 * визарда получают через контекст функции, которые возвращают результат броска.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type DiceBoxType from '@3d-dice/dice-box'
import { initDiceAudio, playDropsForRoll } from '../dice/diceSounds'
import { useAuth } from '../auth/AuthContext'

const STAGE_ID = 'creator-dice-box'
const DEFAULT_COLOR = '#34302a'
const SCALE = 6

export interface DiceApi {
  /** Кость инициализирована и готова к броску */
  ready: boolean
  /** Бросок в процессе — кнопки должны блокироваться */
  rolling: boolean
  /** Бросает нотацию вида «4d6» и возвращает выпавшие значения */
  roll: (notation: string) => Promise<number[]>
  /** Убирает кости со сцены */
  clear: () => void
}

const DiceContext = createContext<DiceApi | null>(null)

/** Доступ к 3D-костям визарда */
export function useDice(): DiceApi {
  const api = useContext(DiceContext)
  if (!api) throw new Error('useDice вне DiceStageProvider')
  return api
}

/** Бросок 4d6 с отбрасыванием младшей кости */
export function dropLowest(values: number[]): { kept: number[]; dropped: number; total: number } {
  const sorted = [...values].sort((a, b) => a - b)
  const dropped = sorted[0] ?? 0
  const kept = sorted.slice(1)
  return { kept, dropped, total: kept.reduce((s, v) => s + v, 0) }
}

export function DiceStageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const boxRef = useRef<DiceBoxType | null>(null)
  const initRef = useRef<Promise<void> | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [active, setActive] = useState(false)

  const themeColor = user?.preferences?.dice?.body_color ?? DEFAULT_COLOR
  // цвет корпуса читаем через ref: пересоздавать сцену посреди визарда нельзя,
  // иначе теряется WebGL-контекст
  const colorRef = useRef(themeColor)
  colorRef.current = themeColor

  useEffect(() => {
    if (initRef.current) return
    initRef.current = (async () => {
      const { default: DiceBox } = await import('@3d-dice/dice-box')
      const box = new DiceBox({
        container: `#${STAGE_ID}`,
        assetPath: '/assets/',
        theme: 'vantage',
        themeColor: colorRef.current,
        scale: SCALE,
        gravity: 1,
        throwForce: 6,
        spinForce: 6,
        settleTimeout: 6000,
      })
      await box.init()
      boxRef.current = box
      setReady(true)
    })().catch(() => {
      // без 3D визард всё равно работает: шаги умеют ручной ввод
      setReady(false)
    })
  }, [])

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current)
  }, [])

  const clear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
    boxRef.current?.clear()
    setActive(false)
  }, [])

  const roll = useCallback(
    async (notation: string): Promise<number[]> => {
      await initRef.current
      const box = boxRef.current
      if (!box) throw new Error('Кости недоступны')

      const count = parseInt(notation, 10) || 1
      initDiceAudio()
      playDropsForRoll(count)

      if (clearTimer.current) {
        clearTimeout(clearTimer.current)
        clearTimer.current = null
      }
      box.clear()
      setActive(true)
      setRolling(true)
      try {
        const results = await box.roll(notation, { themeColor: colorRef.current })
        return results.map((r) => r.value)
      } finally {
        setRolling(false)
        // кости задерживаются на сцене, чтобы игрок увидел грани
        clearTimer.current = setTimeout(() => {
          boxRef.current?.clear()
          setActive(false)
          clearTimer.current = null
        }, 4000)
      }
    },
    [],
  )

  const api = useMemo<DiceApi>(() => ({ ready, rolling, roll, clear }), [ready, rolling, roll, clear])

  return (
    <DiceContext.Provider value={api}>
      <div
        id={STAGE_ID}
        className={`create-dice-stage${active ? ' is-active' : ''}`}
        aria-hidden="true"
      />
      {children}
    </DiceContext.Provider>
  )
}
