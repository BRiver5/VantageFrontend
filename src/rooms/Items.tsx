/**
 * Передача предмета и монет другому герою партии и бросок предмета на стол.
 * Вызываются из сумки на листе героя.
 */
import { useState } from 'react'
import { Coins, Send } from 'lucide-react'
import { ApiError, type Currency } from '../api'
import { SheetModal } from '../characters/SheetModal'
import { CoinImg } from '../coins'
import type { InventoryItemInstance } from '../types/character'
import type { CharacterCard, RoomItem } from '../types/rooms'
import { useRoom } from './RoomProvider'
import { dropItem, transferCurrency, transferItem } from './roomsApi'
import { RoomAvatar } from './ui'

const CURRENCIES: Currency[] = ['pp', 'gp', 'ep', 'sp', 'cp']

const errText = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'Предмет уже забрали или комната закрыта. Список обновится сам.'
    if (e.status === 422) return `Не получилось: ${e.message}`
  }
  return e instanceof Error ? e.message : 'Ошибка сервера'
}

export const roomItemName = (it: RoomItem) => it.equipment?.equipment_name ?? it.magic_item?.item_name ?? 'Предмет'

/* ---------- передача предмета и монет ---------- */

function HeroPicker({ heroes, value, onChange }: { heroes: CharacterCard[]; value: string | null; onChange: (id: string) => void }) {
  if (heroes.length === 0) return <p className="muted">В партии больше никого нет.</p>
  return (
    <div className="rm-pick-list" role="radiogroup" aria-label="Кому передать">
      {heroes.map((h) => (
        <button key={h.id} type="button" role="radio" aria-checked={value === h.id} className={`rm-pick${value === h.id ? ' is-on' : ''}`} onClick={() => onChange(h.id)}>
          <RoomAvatar src={h.avatar_url} name={h.name} size={36} />
          <span>
            <b>{h.name}</b>
            <i>{h.level} ур.</i>
          </span>
        </button>
      ))}
    </div>
  )
}

export function TransferItemDialog({ characterId, item, onClose }: { characterId: string; item: InventoryItemInstance; onClose: () => void }) {
  const { data, roomId } = useRoom()
  const [to, setTo] = useState<string | null>(null)
  const [qty, setQty] = useState(item.quantity)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const heroes = (data?.characters ?? []).filter((c) => c.id !== characterId)
  const name = item.equipment?.equipment_name ?? item.magic_item?.item_name ?? 'Предмет'

  const submit = async () => {
    if (!to) return
    setBusy(true)
    setError(null)
    try {
      await transferItem(roomId, characterId, item.instance_id, { to_character_id: to, quantity: qty })
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title={`Передать: ${name}`}
      kicker="другому герою партии"
      tone="rest"
      visual={<Send className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={!to || busy} onClick={() => void submit()}>
            Передать
          </button>
        </>
      }
    >
      <div className="rm-form">
        <p className="rm-hint">Предмет перейдёт сразу, без подтверждения получателя; с него снимется «надето» и «настроено».</p>
        <HeroPicker heroes={heroes} value={to} onChange={setTo} />
        {item.quantity > 1 && (
          <div className="rm-qty">
            <span>Сколько</span>
            <button type="button" className="cw-mini-btn" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Меньше">
              −
            </button>
            <b>
              {qty} из {item.quantity}
            </b>
            <button type="button" className="cw-mini-btn" onClick={() => setQty((n) => Math.min(item.quantity, n + 1))} aria-label="Больше">
              +
            </button>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

export function TransferCoinsDialog({ characterId, purse, onClose }: { characterId: string; purse: Record<Currency, number>; onClose: () => void }) {
  const { data, roomId } = useRoom()
  const [to, setTo] = useState<string | null>(null)
  const [amount, setAmount] = useState<Partial<Record<Currency, number>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const heroes = (data?.characters ?? []).filter((c) => c.id !== characterId)
  const total = Object.values(amount).reduce((a, b) => a + (b ?? 0), 0)

  const submit = async () => {
    if (!to || total <= 0) return
    setBusy(true)
    setError(null)
    try {
      await transferCurrency(roomId, characterId, { to_character_id: to, amount: Object.fromEntries(Object.entries(amount).filter(([, v]) => (v ?? 0) > 0)) })
      onClose()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? 'Не хватает монет.' : errText(e))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title="Передать монеты"
      kicker="другому герою партии"
      tone="rest"
      visual={<Coins className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={!to || total <= 0 || busy} onClick={() => void submit()}>
            Передать
          </button>
        </>
      }
    >
      <div className="rm-form">
        <HeroPicker heroes={heroes} value={to} onChange={setTo} />
        <div className="rm-coins">
          {CURRENCIES.map((c) => (
            <label key={c}>
              <CoinImg currency={c} size={22} />
              <input
                type="number"
                min={0}
                max={purse[c]}
                inputMode="numeric"
                value={amount[c] ?? ''}
                placeholder={`из ${purse[c]}`}
                aria-label={`Монет ${c}`}
                onChange={(e) => setAmount((a) => ({ ...a, [c]: Math.max(0, Math.min(purse[c], parseInt(e.target.value, 10) || 0)) }))}
              />
            </label>
          ))}
        </div>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/** Бросить предмет со своего инвентаря на общий стол */
export async function dropToTable(roomId: string, characterId: string, item: InventoryItemInstance): Promise<void> {
  await dropItem(roomId, characterId, item.instance_id, item.quantity)
}

