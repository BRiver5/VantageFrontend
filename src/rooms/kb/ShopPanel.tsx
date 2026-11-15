/**
 * Лавка на странице базы знаний. Мастер раскладывает товар (с ширмы или из
 * каталога), правит цены и количество; игрок покупает и продаёт за монеты.
 * Деньги и предметы двигает сервер: здесь только запросы и свежий список.
 */
import { useCallback, useEffect, useState } from 'react'
import { Coins, Package, ShoppingBag, Trash2 } from 'lucide-react'
import { getCharacter, roomCharacterRef } from '../../api'
import type { Character, InventoryItemInstance } from '../../types/character'
import type { ShopView } from '../../types/rooms'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { addShopStock, buyFromShop, getShop, patchShopStock, removeShopStock, sellToShop } from '../roomsApi'
import { errText, itemName } from '../table/parts'
import { CatalogPicker } from './CatalogPicker'
import { formatCoins, formatCopper } from './money'

const instanceName = (it: InventoryItemInstance) => it.equipment?.equipment_name ?? it.magic_item?.item_name ?? 'Предмет'
const instanceCost = (it: InventoryItemInstance) => it.equipment?.cost_copper ?? it.magic_item?.cost_copper ?? 0

export function ShopPanel({ pageId }: { pageId: string }) {
  const { roomId, data, isDm } = useRoom()
  const [view, setView] = useState<ShopView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [hero, setHero] = useState<Character | null>(null)
  const heroId = data?.me.room_character_id ?? null

  const load = useCallback(() => {
    getShop(roomId, pageId).then(
      (v) => {
        setView(v)
        setError(null)
      },
      (e) => setError(errText(e)),
    )
  }, [roomId, pageId])
  const loadHero = useCallback(() => {
    if (!heroId || isDm) return
    getCharacter(roomCharacterRef(roomId, heroId)).then(setHero, () => undefined)
  }, [roomId, heroId, isDm])
  useEffect(load, [load])
  useEffect(loadHero, [loadHero])
  useRoomEvents((msg) => {
    const p = msg.payload as { page_id?: string; character_id?: string } | undefined
    if (msg.type.startsWith('shop.') && p?.page_id === pageId) load()
    if (msg.type === 'character.updated' && heroId) loadHero()
  })

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const msg = await fn()
      if (msg) setNote(msg)
      load()
      loadHero()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!view) return <div className="kb-shop">{error ? <p className="tb-err">{error}</p> : <p className="kb-hint">Открываем лавку…</p>}</div>
  const { shop, stock } = view
  const screen = isDm ? (data?.items ?? []).filter((i) => i.holder === 'screen') : []
  const wallet = hero?.inventory?.currency
  const sellable = (hero?.inventory?.items ?? []).filter((it) => instanceCost(it) > 0 && !it.equipped)

  return (
    <section className="kb-shop" aria-label="Лавка">
      <header className="kb-shop-head">
        <ShoppingBag aria-hidden="true" />
        <b>{shop.open ? 'Лавка открыта' : 'Лавка закрыта'}</b>
        <span className="kb-hint">
          цены ×{shop.buy_multiplier} · скупает за ×{shop.sell_multiplier}
        </span>
        {wallet && (
          <span className="kb-shop-wallet" title="Ваш кошелёк">
            <Coins aria-hidden="true" /> {formatCoins(wallet)}
          </span>
        )}
      </header>
      {stock.length === 0 ? (
        <p className="kb-hint">{isDm ? 'Полки пусты: положите товар с ширмы или из каталога.' : 'Полки пусты.'}</p>
      ) : (
        <ul className="kb-shop-stock">
          {stock.map((it) => (
            <li key={it.id}>
              <span className="kb-shop-name">
                <Package aria-hidden="true" /> {itemName(it)}
                <em>×{it.quantity}</em>
              </span>
              <span className="kb-shop-price" title={it.price_cp == null ? 'цена предмета × множитель' : 'своя цена'}>
                {formatCopper(it.unit_price_cp)}
              </span>
              {isDm ? (
                <span className="kb-shop-acts">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    defaultValue={it.quantity}
                    aria-label="Сколько на полке"
                    onBlur={(e) => {
                      const n = Math.max(1, Number(e.target.value) || 1)
                      if (n !== it.quantity) void run(() => patchShopStock(roomId, pageId, it.id, { quantity: n }).then(() => undefined))
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    defaultValue={it.price_cp ?? ''}
                    placeholder={String(it.unit_price_cp)}
                    aria-label="Своя цена, мм"
                    title="Своя цена в медных; пусто — цена предмета × множитель"
                    onBlur={(e) => {
                      const raw = e.target.value.trim()
                      const price = raw === '' ? null : Math.max(0, Math.round(Number(raw)) || 0)
                      if (price !== it.price_cp) void run(() => patchShopStock(roomId, pageId, it.id, { price_cp: price }).then(() => undefined))
                    }}
                  />
                  <button type="button" className="kb-chip is-danger" disabled={busy} onClick={() => void run(() => removeShopStock(roomId, pageId, it.id).then(() => `${itemName(it)}: обратно за ширму`))} title="Убрать на ширму">
                    <Trash2 aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <span className="kb-shop-acts">
                  {it.quantity > 1 && (
                    <input
                      type="number"
                      min={1}
                      max={it.quantity}
                      value={qty[it.id] ?? 1}
                      aria-label="Сколько купить"
                      onChange={(e) => setQty((q) => ({ ...q, [it.id]: Math.min(it.quantity, Math.max(1, Number(e.target.value) || 1)) }))}
                    />
                  )}
                  <button
                    type="button"
                    className="kb-chip is-on"
                    disabled={busy || !shop.open || !heroId}
                    onClick={() =>
                      void run(async () => {
                        const r = await buyFromShop(roomId, pageId, { item_id: it.id, quantity: qty[it.id] ?? 1 })
                        return `Куплено: ${r.name}${r.quantity > 1 ? ` ×${r.quantity}` : ''} за ${formatCopper(r.price_cp)}`
                      })
                    }
                  >
                    купить
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {isDm && (
        <div className="kb-shop-add">
          {screen.length > 0 && (
            <label>
              <span>С ширмы:</span>
              <select
                value=""
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) void run(() => addShopStock(roomId, pageId, { room_item_id: id }).then(() => undefined))
                }}
              >
                <option value="">выберите предмет…</option>
                {screen.map((i) => (
                  <option key={i.id} value={i.id}>
                    {itemName(i)}
                    {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <CatalogPicker
            entities={['equipment', 'items']}
            placeholder="Товар из каталога…"
            onPick={(h) => void run(() => addShopStock(roomId, pageId, { kind: h.entity === 'items' ? 'magic_item' : 'equipment', catalog_ref: h.id, quantity: 1 }).then(() => `${h.title}: на полке`))}
          />
        </div>
      )}
      {!isDm && shop.open && sellable.length > 0 && (
        <details className="kb-shop-sell">
          <summary>Продать торговцу</summary>
          <ul>
            {sellable.map((it) => (
              <li key={it.instance_id}>
                <span>
                  {instanceName(it)}
                  {it.quantity > 1 && <em> ×{it.quantity}</em>}
                </span>
                <span className="kb-shop-price">{formatCopper(Math.floor(instanceCost(it) * shop.sell_multiplier))}</span>
                <button
                  type="button"
                  className="kb-chip"
                  disabled={busy || Math.floor(instanceCost(it) * shop.sell_multiplier) <= 0}
                  onClick={() =>
                    void run(async () => {
                      const r = await sellToShop(roomId, pageId, { instance_id: it.instance_id, quantity: 1 })
                      return `Продано: ${r.name} за ${formatCopper(r.price_cp)}`
                    })
                  }
                >
                  продать 1
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!isDm && !heroId && <p className="kb-hint">Покупать может только герой партии.</p>}
      {note && (
        <p className="kb-shop-note" role="status">
          {note}
        </p>
      )}
      {error && <p className="tb-err">{error}</p>}
    </section>
  )
}
