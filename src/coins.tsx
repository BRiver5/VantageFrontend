import type { Cost } from './api'
import { CURRENCY_RU, formatCost, formatCostAmount, resolveCost } from './equipment'
import copperCoin from './assets/coins/copper coin icon.png'
import silverCoin from './assets/coins/silver coin icon.png'
import electrumCoin from './assets/coins/electrum coin icon.png'
import goldCoin from './assets/coins/golden coin icon.png'
import platinumCoin from './assets/coins/platinum coin icon.png'

const COIN_SRC = {
  cp: copperCoin,
  sp: silverCoin,
  ep: electrumCoin,
  gp: goldCoin,
  pp: platinumCoin,
} as const

/**
 * Цена с миниатюрой монеты той валюты, в которой она указана.
 * Сумму пишем рядом, единицу не дублируем — её несёт сама иконка.
 */
export function PriceMark({
  cost,
  costCopper,
  className,
}: {
  cost?: Cost | null
  costCopper?: number | null
  className?: string
}) {
  const resolved = resolveCost(cost, costCopper)
  if (!resolved) return null
  const label = formatCost(resolved, null) ?? ''
  return (
    <span className={['price-mark', className].filter(Boolean).join(' ')} title={label}>
      <img src={COIN_SRC[resolved.currency]} alt={CURRENCY_RU[resolved.currency]} />
      <b>{formatCostAmount(resolved.amount)}</b>
    </span>
  )
}
