import { useCallback } from 'react'
import { useDice } from '../dice/diceControl'

/* ---------- Кубики ---------- */

const d = (sides: number) => 1 + Math.floor(Math.random() * sides)

/** больше костей сцена не разложит читаемо (у великанов бывает 30к20 хитов) */
const MAX_3D_DICE = 20

/**
 * Бросок общими 3D-костями приложения. Если сцена не поднялась (нет WebGL) —
 * бросаем тихо, чтобы кнопки не превращались в мёртвые.
 */
export function useCreatureDice() {
  const { roll: roll3d, rolling } = useDice()
  const roll = useCallback(
    async (n: number, sides: number): Promise<number[] | null> => {
      if (rolling) return null
      if (n <= MAX_3D_DICE) {
        try {
          return await roll3d(`${n}d${sides}`)
        } catch {
          /* тихий бросок ниже */
        }
      }
      return Array.from({ length: n }, () => d(sides))
    },
    [roll3d, rolling],
  )
  return { roll, rolling }
}

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

export const abilityMod = (v: number) => Math.floor((v - 10) / 2)

/** «8 к 8 + 16» → { n: 8, sides: 8, bonus: 16 } */
export function parseDice(formula: string | null | undefined) {
  const m = formula?.match(/(\d+)\s*[кkd]\s*(\d+)(?:\s*([+\-−])\s*(\d+))?/i)
  if (!m) return null
  const bonus = m[3] ? (m[3] === '+' ? 1 : -1) * Number(m[4]) : 0
  return { n: Number(m[1]), sides: Number(m[2]), bonus }
}
