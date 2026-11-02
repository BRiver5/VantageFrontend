/**
 * Предметы комнаты: общий стол, выдача мастером, передача между героями.
 *
 * Стол — предметы, лежащие на виду; «Забрать» кладёт предмет в инвентарь героя
 * (кто первый, того и предмет: опоздавший получит 409). Мастер видит ещё и
 * предметы ширмы (holder = screen) — их игроки не видят. Любое изменение
 * приходит событием, ответ запроса экран не меняет.
 */
import { useMemo, useState } from 'react'
import { Backpack, Coins, Gem, Hand, PackagePlus, Search, Send, Undo2 } from 'lucide-react'
import { ApiError, realImage, type Currency, type Equipment, type Item } from '../api'
import { SheetModal } from '../characters/SheetModal'
import { CoinImg } from '../coins'
import { useCatalogList } from '../create/useCatalog'
import type { InventoryItemInstance } from '../types/character'
import type { CharacterCard, ItemKind, ItemTarget, RoomItem } from '../types/rooms'
import { useRoom } from './RoomProvider'
import { claimItem, dropItem, issueItem, takeBackItem, transferCurrency, transferItem } from './roomsApi'
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
const roomItemArt = (it: RoomItem) => realImage(it.equipment?.equipment_image_gallery) ?? realImage(it.magic_item?.item_image_gallery)
const roomItemSub = (it: RoomItem) => it.magic_item?.rarity ?? it.equipment?.subcategory ?? it.equipment?.category ?? ''

function Thumb({ src, magic }: { src: string | null; magic: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="rm-thumb">
      {src && !broken ? <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} /> : magic ? <Gem aria-hidden="true" /> : <Backpack aria-hidden="true" />}
    </span>
  )
}

/* ---------- стол ---------- */

export function TablePanel({ characterId, bare = false }: { characterId: string | null; bare?: boolean }) {
  const { data, roomId, isDm } = useRoom()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)
  if (!data) return null

  const table = data.items.filter((it) => it.holder === 'table')
  const screen = data.items.filter((it) => it.holder === 'screen')
  const closed = data.room.status === 'closed'

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  const row = (it: RoomItem) => (
    <li key={it.id} className="rm-item">
      <Thumb src={roomItemArt(it)} magic={!!it.magic_item} />
      <span className="rm-item-body">
        <b>
          {roomItemName(it)}
          {it.quantity > 1 && <em> ×{it.quantity}</em>}
        </b>
        <i>{[roomItemSub(it), it.notes].filter(Boolean).join(' · ')}</i>
      </span>
      {it.holder === 'table' && characterId && !isDm && (
        <button type="button" className="cs-btn" disabled={closed || busy === it.id} onClick={() => void run(it.id, () => claimItem(roomId, it.id, characterId))}>
          <Hand aria-hidden="true" /> Забрать
        </button>
      )}
      {isDm && it.holder === 'table' && (
        <>
          <button type="button" className="cw-mini-btn" disabled={busy === it.id} onClick={() => void run(it.id, () => takeBackItem(roomId, it.id))} title="Убрать со стола на ширму">
            <Undo2 aria-hidden="true" /> убрать
          </button>
        </>
      )}
    </li>
  )

  return (
    <div className={bare ? 'rm-items' : 'rm-panel rm-items'}>
      <h3 className="rm-panel-title">
        <Backpack aria-hidden="true" /> На столе · {table.length}
        {isDm && (
          <button type="button" className="cw-mini-btn rm-title-act" disabled={closed} onClick={() => setIssuing(true)}>
            <PackagePlus aria-hidden="true" /> выдать
          </button>
        )}
      </h3>
      {table.length === 0 ? <p className="rm-hint">Стол пуст. Мастер выложит сюда добычу и находки.</p> : <ul className="rm-item-list">{table.map(row)}</ul>}

      {isDm && screen.length > 0 && (
        <>
          <h3 className="rm-panel-title">За ширмой · {screen.length}</h3>
          <p className="rm-hint">Эти предметы игроки не видят.</p>
          <ul className="rm-item-list is-screen">
            {screen.map((it) => (
              <li key={it.id} className="rm-item">
                <Thumb src={roomItemArt(it)} magic={!!it.magic_item} />
                <span className="rm-item-body">
                  <b>
                    {roomItemName(it)}
                    {it.quantity > 1 && <em> ×{it.quantity}</em>}
                  </b>
                  <i>{roomItemSub(it)}</i>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="auth-error">{error}</p>}
      {issuing && <IssueDialog onClose={() => setIssuing(false)} />}
    </div>
  )
}

/* ---------- выдача мастером ---------- */

type Pick = { kind: ItemKind; id: string; name: string; sub: string; art: string | null }

export function IssueDialog({ onClose, defaultTarget = 'table' }: { onClose: () => void; defaultTarget?: ItemTarget }) {
  const { data, roomId } = useRoom()
  const [tab, setTab] = useState<ItemKind>('equipment')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [qty, setQty] = useState(1)
  const [target, setTarget] = useState<ItemTarget>(defaultTarget)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const { items: equipment, loading: l1 } = useCatalogList<Equipment>('equipment')
  const { items: magic, loading: l2 } = useCatalogList<Item>('items')

  const list = useMemo<Pick[]>(() => {
    const needle = q.trim().toLocaleLowerCase('ru')
    const src: Pick[] =
      tab === 'equipment'
        ? equipment.map((e) => ({ kind: 'equipment' as const, id: e.id, name: e.equipment_name, sub: e.subcategory ?? e.category ?? '', art: realImage(e.equipment_image_gallery) }))
        : magic.map((m) => ({ kind: 'magic_item' as const, id: m.id, name: m.item_name, sub: m.rarity ?? m.item_type ?? '', art: realImage(m.item_image_gallery) }))
    return src.filter((p) => !needle || p.name.toLocaleLowerCase('ru').includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'ru')).slice(0, 80)
  }, [tab, q, equipment, magic])

  const submit = async () => {
    if (!pick) return
    setBusy(true)
    setError(null)
    try {
      await issueItem(roomId, { kind: pick.kind, catalog_ref: pick.id, quantity: qty, target })
      setDone(`${pick.name}${qty > 1 ? ` ×${qty}` : ''}`)
      setPick(null)
      setQty(1)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const heroes: CharacterCard[] = data?.characters ?? []

  return (
    <SheetModal
      title="Выдать предмет"
      kicker="из каталога"
      tone="action"
      visual={<PackagePlus className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Готово
          </button>
          <button type="button" className="cs-btn cw-next" disabled={!pick || busy} onClick={() => void submit()}>
            Выдать{pick ? `: ${pick.name}` : ''}
          </button>
        </>
      }
    >
      <div className="rm-form">
        <div className="rm-field">
          <span>Кому</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="table">На общий стол</option>
            <option value="screen">За ширму (пока скрыто)</option>
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                Герою: {h.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rm-seg" role="tablist" aria-label="Тип предмета">
          <button type="button" role="tab" aria-selected={tab === 'equipment'} className={tab === 'equipment' ? 'is-on' : ''} onClick={() => setTab('equipment')}>
            <Backpack aria-hidden="true" /> Снаряжение
          </button>
          <button type="button" role="tab" aria-selected={tab === 'magic_item'} className={tab === 'magic_item' ? 'is-on' : ''} onClick={() => setTab('magic_item')}>
            <Gem aria-hidden="true" /> Магические
          </button>
        </div>
        <label className="rm-search">
          <Search aria-hidden="true" />
          <input type="search" value={q} placeholder="Искать по названию…" onChange={(e) => setQ(e.target.value)} />
        </label>
        {(tab === 'equipment' ? l1 : l2) && <p className="muted">Загружаем каталог…</p>}
        <ul className="rm-pick-items" role="listbox" aria-label="Каталог">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={pick?.id === p.id} className={pick?.id === p.id ? 'is-on' : ''} onClick={() => setPick(p)}>
                <Thumb src={p.art} magic={p.kind === 'magic_item'} />
                <span>
                  <b>{p.name}</b>
                  <i>{p.sub}</i>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rm-qty">
          <span>Количество</span>
          <button type="button" className="cw-mini-btn" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Меньше">
            −
          </button>
          <b>{qty}</b>
          <button type="button" className="cw-mini-btn" onClick={() => setQty((n) => Math.min(999, n + 1))} aria-label="Больше">
            +
          </button>
        </div>
        {done && <p className="auth-ok">Выдано: {done}</p>}
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

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

