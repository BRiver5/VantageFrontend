/** Монеты для лавок и раздела: подписи и суммы в медных (как app/rooms/coins.py на сервере) */
import type { Currency } from '../../api'
import { CURRENCY_RU } from '../../equipment'

export const COIN_ORDER: Currency[] = ['pp', 'gp', 'ep', 'sp', 'cp']
export const COIN_VALUE: Record<Currency, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 }

export type Coins = Partial<Record<Currency, number>>

export const coinsTotal = (c: Coins | null | undefined) => COIN_ORDER.reduce((s, k) => s + (c?.[k] ?? 0) * COIN_VALUE[k], 0)

/** «3 зм, 1 мм»; пустая сумма — «0 мм» */
export function formatCoins(c: Coins | null | undefined): string {
  const parts = COIN_ORDER.filter((k) => c?.[k]).map((k) => `${c?.[k]} ${CURRENCY_RU[k]}`)
  return parts.join(', ') || '0 мм'
}

/** Сумма в медных — зм, см, мм */
export function formatCopper(cp: number): string {
  const gp = Math.floor(cp / 100)
  const sp = Math.floor((cp % 100) / 10)
  return formatCoins({ gp, sp, cp: cp % 10 })
}
