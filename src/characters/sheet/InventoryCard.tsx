import { Backpack, Send } from 'lucide-react'
import type { Currency } from '../../api'
import { CoinImg } from '../../coins'
import type { InventoryItemInstance, SheetView } from '../../types/character'
import { InventoryBoard } from '../InventoryBoard'
import type { SheetPatch } from '../sheetPlay'
import { Card } from './parts'

/** Карточка «Инвентарь»: доска предметов и кошелёк */
export function InventoryCard({
  sheet,
  onInventory,
  onPatch,
  live,
  lockedPurse,
  roomMode,
}: {
  sheet: SheetView
  onInventory: (items: InventoryItemInstance[], coins?: Partial<Record<Currency, number>>) => void
  onPatch?: SheetPatch
  live: boolean
  lockedPurse: boolean
  roomMode?: {
    onTransfer?: (item: InventoryItemInstance) => void
    onDropToTable?: (item: InventoryItemInstance) => void
    onTransferCoins?: () => void
  }
}) {
  const items = sheet.inventory.items
  const coins = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
  const purse = live ? coins : coins.filter((c) => sheet.inventory.currency[c] > 0)

  return (
    <Card title="Инвентарь" icon={Backpack} className="cw-sheet-card--inv" aside={items.length ? String(items.length) : null}>
      <InventoryBoard items={items} onChange={onInventory} locked={lockedPurse} onTransfer={roomMode?.onTransfer} onDropToTable={roomMode?.onDropToTable} />
      {purse.length > 0 && (
        <div className={`cw-purse${live ? ' is-live' : ''}`}>
          {purse.map((c) => (
            <span key={c}>
              <CoinImg currency={c} size={20} />
              {onPatch && !lockedPurse ? (
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={sheet.inventory.currency[c]}
                  aria-label={`Монеты: ${c}`}
                  onChange={(e) => {
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0)
                    onPatch((ch) => ({
                      ...ch,
                      inventory: { ...ch.inventory, currency: { ...ch.inventory.currency, [c]: v } },
                    }))
                  }}
                />
              ) : (
                <b>{sheet.inventory.currency[c]}</b>
              )}
            </span>
          ))}
          {roomMode?.onTransferCoins && (
            <button type="button" className="cw-mini-btn" onClick={roomMode.onTransferCoins} title="Передать монеты другому герою">
              <Send aria-hidden="true" /> передать
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
