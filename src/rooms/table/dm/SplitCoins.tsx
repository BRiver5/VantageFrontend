/**
 * «Разделить монеты поровну»: мастер вводит сумму (найденный клад) или берёт
 * её из кошелька героя-«общака» и делит между выбранными героями. Что не
 * делится, сервер мельчит до медных; остаток можно отдать одному из партии.
 */
import { useState } from 'react'
import { Coins, X } from 'lucide-react'
import type { Currency } from '../../../api'
import { CoinImg } from '../../../coins'
import { useRoom } from '../../RoomProvider'
import { splitCurrency } from '../../roomsApi'
import { COIN_ORDER, formatCoins } from '../../kb/money'
import { errText } from '../parts'

export function SplitCoins({ onClose }: { onClose: () => void }) {
  const { roomId, data } = useRoom()
  const heroes = data?.characters ?? []
  const [amount, setAmount] = useState<Partial<Record<Currency, number>>>({})
  const [picked, setPicked] = useState<Set<string>>(() => new Set(heroes.map((h) => h.id)))
  const [from, setFrom] = useState('')
  const [restTo, setRestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ids = heroes.filter((h) => picked.has(h.id)).map((h) => h.id)
  const empty = !COIN_ORDER.some((c) => (amount[c] ?? 0) > 0)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await splitCurrency(roomId, { amount, character_ids: ids, from_character_id: from || null, remainder_to: restTo && ids.includes(restTo) ? restTo : null })
      const nameOf = (id: string | null) => heroes.find((h) => h.id === id)?.name ?? 'герою'
      const rest = r.remainder ? ` Остаток ${formatCoins(r.remainder)}: ${r.remainder_to ? nameOf(r.remainder_to) : r.from_character_id ? `остался у ${nameOf(r.from_character_id)}` : 'никому не роздан'}.` : ' Поделилось без остатка.'
      setResult(`Каждому по ${formatCoins(r.share)}.${rest}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sc-split" role="dialog" aria-label="Разделить монеты поровну">
      <header>
        <Coins aria-hidden="true" />
        <b>Разделить монеты поровну</b>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="sc-split-coins">
        {COIN_ORDER.map((c) => (
          <label key={c}>
            <CoinImg currency={c} />
            <input type="number" min={0} value={amount[c] ?? ''} placeholder="0" onChange={(e) => setAmount((a) => ({ ...a, [c]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
          </label>
        ))}
      </div>
      <label className="sc-split-row">
        <span>Откуда:</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">новая добыча (из воздуха)</option>
          {heroes.map((h) => (
            <option key={h.id} value={h.id}>
              кошелёк: {h.name}
            </option>
          ))}
        </select>
      </label>
      <div className="sc-split-heroes" role="group" aria-label="Между кем делить">
        {heroes.map((h) => (
          <label key={h.id}>
            <input
              type="checkbox"
              checked={picked.has(h.id)}
              onChange={() =>
                setPicked((s) => {
                  const next = new Set(s)
                  if (next.has(h.id)) next.delete(h.id)
                  else next.add(h.id)
                  return next
                })
              }
            />
            {h.name}
          </label>
        ))}
      </div>
      <label className="sc-split-row">
        <span>Остаток:</span>
        <select value={restTo} onChange={(e) => setRestTo(e.target.value)}>
          <option value="">{from ? 'остаётся в кошельке-источнике' : 'не раздавать'}</option>
          {heroes
            .filter((h) => picked.has(h.id))
            .map((h) => (
              <option key={h.id} value={h.id}>
                отдать: {h.name}
              </option>
            ))}
        </select>
      </label>
      <button type="button" className="tb-goldbtn" disabled={busy || empty || ids.length === 0} onClick={() => void submit()}>
        <Coins aria-hidden="true" /> Разделить на {ids.length}
      </button>
      {result && (
        <p className="sc-done" role="status">
          {result}
        </p>
      )}
      {error && <p className="tb-err">{error}</p>}
    </div>
  )
}
