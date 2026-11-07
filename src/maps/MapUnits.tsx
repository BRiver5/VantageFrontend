/**
 * «Мои существа» на карте: герой и призванные, которыми управляет игрок
 * (GET /my-units). Выбор юнита подсвечивает его ходы, рядом — что можно
 * поднять (пульсирует на карте), что он несёт, и как это бросить или
 * передать соседу. Экономию действий показываем тем, что сервер прислал.
 */
import { useEffect, useState } from 'react'
import { ArrowDownToLine, Backpack, Hand, PawPrint, Send, UserRound, X } from 'lucide-react'
import { getCharacter, roomCharacterRef } from '../api'
import type { InventoryItemInstance } from '../types/character'
import { dropItem, handTo, patchToken, pickUp, tokenVision, type MyUnit } from './api'
import type { BattleMap } from './types'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')
const VISION: Record<string, string> = { normal: 'обычное', darkvision: 'тёмное', blindsight: 'слепое', truesight: 'истинное', tremorsense: 'чувство вибрации' }
const invName = (x: InventoryItemInstance) => x.equipment?.equipment_name ?? x.magic_item?.item_name ?? 'Предмет'

export function MapUnits({
  roomId,
  map,
  units,
  selected,
  onSelect,
  onDone,
  onError,
  moveMode,
  flyHeight,
  onMoveMode,
}: {
  moveMode: 'walk' | 'fly'
  flyHeight: number
  onMoveMode: (mode: 'walk' | 'fly', height: number) => void
  roomId: string
  map: BattleMap
  units: MyUnit[]
  selected: string | null
  onSelect: (tokenId: string | null) => void
  onDone: () => void
  onError: (t: string) => void
}) {
  const [bag, setBag] = useState<InventoryItemInstance[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [giving, setGiving] = useState<{ instance_id?: string; map_item_id?: string; name: string } | null>(null)
  const [modes, setModes] = useState<string[] | null>(null)
  const unit = units.find((u) => u.token_id === selected) ?? null
  const tok = unit ? map.tokens.find((t) => t.id === unit.token_id) : null

  useEffect(() => {
    setBag(null)
    setGiving(null)
    setModes(null)
    if (!selected) return
    let on = true
    tokenVision(roomId, map.id, selected).then(
      (v) => on && setModes(v.modes ?? []),
      () => on && setModes([]),
    )
    return () => {
      on = false
    }
  }, [selected, roomId, map.id])

  if (units.length === 0) return null
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onDone()
    } catch (e) {
      onError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const itemName = (id: string) => map.items.find((i) => i.id === id)?.name ?? 'Предмет'
  // соседи в 5 футах: кому можно передать
  const near = tok
    ? map.tokens.filter((t) => t.id !== tok.id && !t.hidden && Math.hypot(t.x - tok.x, t.y - tok.y) <= map.grid.cell_px * (1 + (t.size + tok.size) / 2 - 1) + 1)
    : []
  const left = unit?.economy ? Math.max(0, unit.speed.walk - unit.economy.movement_used) : null

  return (
    <div className="mu-panel">
      {units.length > 1 && (
        <div className="mu-chips" role="tablist" aria-label="Мои существа">
          {units.map((u) => (
            <button key={u.token_id} type="button" role="tab" aria-selected={selected === u.token_id} className={selected === u.token_id ? 'is-on' : ''} onClick={() => onSelect(selected === u.token_id ? null : u.token_id)} title={u.spell ? `Призвано: ${u.spell}` : undefined}>
              {u.kind === 'character' ? <UserRound aria-hidden="true" /> : <PawPrint aria-hidden="true" />}
              {u.label}
              {u.my_turn && <i className="mu-turn" aria-label="ходит сейчас" />}
            </button>
          ))}
        </div>
      )}
      {unit && (
        <div className="mu-card">
          <header>
            <b>{unit.label}</b>
            {unit.hp && (
              <span className="mu-hp">
                {unit.hp.current}/{unit.hp.max}
              </span>
            )}
            {unit.ac != null && <span className="mu-ac">КД {unit.ac}</span>}
            <button type="button" className="mu-x" onClick={() => onSelect(null)} aria-label="Снять выбор">
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="mu-speed">
            {left != null ? `Осталось ${left} из ${unit.speed.walk} фт.` : `Скорость ${unit.speed.walk} фт.`}
            {unit.speed.fly > 0 && ` · полёт ${unit.speed.fly}`}
          </p>
          {(unit.speed.fly > 0 || (modes?.length ?? 0) > 1) && (
            <div className="mu-row">
              {unit.speed.fly > 0 && (
                <span className="mu-seg" role="radiogroup" aria-label="Как двигаться">
                  <button type="button" role="radio" aria-checked={moveMode === 'walk'} className={moveMode === 'walk' ? 'is-on' : ''} onClick={() => onMoveMode('walk', flyHeight)}>
                    пешком
                  </button>
                  <button type="button" role="radio" aria-checked={moveMode === 'fly'} className={moveMode === 'fly' ? 'is-on' : ''} onClick={() => onMoveMode('fly', flyHeight)}>
                    полёт
                  </button>
                  {moveMode === 'fly' && (
                    <label className="mu-fly">
                      <input type="number" min={0} max={unit.speed.fly} step={5} value={flyHeight} onChange={(e) => onMoveMode('fly', Math.max(0, Number(e.target.value) || 0))} aria-label="Высота полёта, фт" /> фт
                    </label>
                  )}
                </span>
              )}
              {(modes?.length ?? 0) > 1 && tok && (
                <label className="mu-vision">
                  Зрение
                  <select value={tok.vision_mode} onChange={(e) => void run(() => patchToken(roomId, map.id, tok.id, { vision_mode: e.target.value }))}>
                    {modes!.map((m) => (
                      <option key={m} value={m}>
                        {VISION[m] ?? m}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {unit.economy && (
            <p className="mu-eco" aria-label="Что потрачено в этом ходу">
              <span className={unit.economy.action_used ? 'is-used' : ''}>действие</span>
              <span className={unit.economy.bonus_used ? 'is-used' : ''}>бонусное</span>
              <span className={unit.economy.reaction_used ? 'is-used' : ''}>реакция</span>
            </p>
          )}
          {unit.reach_items.length > 0 && (
            <ul className="mu-items">
              {unit.reach_items.map((id) => (
                <li key={id}>
                  <span>{itemName(id)}</span>
                  <button type="button" disabled={busy} onClick={() => void run(() => pickUp(roomId, map.id, id, unit.token_id))}>
                    <Hand aria-hidden="true" /> Поднять
                  </button>
                </li>
              ))}
            </ul>
          )}
          {unit.carried.length > 0 && (
            <ul className="mu-items is-carried">
              {unit.carried.map((id) => (
                <li key={id}>
                  <span>Несёт: {itemName(id)}</span>
                  <button type="button" disabled={busy} onClick={() => void run(() => dropItem(roomId, map.id, { token_id: unit.token_id, map_item_id: id }))}>
                    <ArrowDownToLine aria-hidden="true" /> Бросить
                  </button>
                  {near.length > 0 && (
                    <button type="button" disabled={busy} onClick={() => setGiving({ map_item_id: id, name: itemName(id) })}>
                      <Send aria-hidden="true" /> Передать
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {unit.kind === 'character' && tok?.character_id && (
            <>
              <button
                type="button"
                className="mu-bag"
                aria-expanded={!!bag}
                onClick={() => {
                  if (bag) return setBag(null)
                  getCharacter(roomCharacterRef(roomId, tok.character_id!)).then(
                    (c) => setBag(c.inventory?.items ?? []),
                    (e) => onError(errText(e)),
                  )
                }}
              >
                <Backpack aria-hidden="true" /> {bag ? 'Скрыть сумку' : 'Из сумки…'}
              </button>
              {bag && (
                <ul className="mu-items is-bag">
                  {bag.length === 0 && <li className="mu-empty">Сумка пуста</li>}
                  {bag.map((x) => (
                    <li key={x.instance_id}>
                      <span>
                        {invName(x)}
                        {x.quantity > 1 && <i> ×{x.quantity}</i>}
                      </span>
                      <button type="button" disabled={busy} onClick={() => void run(() => dropItem(roomId, map.id, { token_id: unit.token_id, instance_id: x.instance_id, quantity: x.quantity > 1 ? 1 : undefined }))} title="Положить на клетку под собой">
                        <ArrowDownToLine aria-hidden="true" /> Бросить
                      </button>
                      {near.some((t) => t.character_id) && (
                        <button type="button" disabled={busy} onClick={() => setGiving({ instance_id: x.instance_id, name: invName(x) })}>
                          <Send aria-hidden="true" /> Передать
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {giving && (
            <div className="mu-give" role="dialog" aria-label="Кому передать">
              <span>«{giving.name}» —</span>
              {near
                .filter((t) => giving.map_item_id || t.character_id)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => handTo(roomId, map.id, { token_id: unit.token_id, to_token_id: t.id, ...(giving.map_item_id ? { map_item_id: giving.map_item_id } : { instance_id: giving.instance_id }) })).then(() => {
                        setGiving(null)
                        setBag(null)
                      })
                    }
                  >
                    {t.label}
                  </button>
                ))}
              <button type="button" className="mu-x" onClick={() => setGiving(null)} aria-label="Отмена">
                <X aria-hidden="true" />
              </button>
            </div>
          )}
          {unit.kind !== 'character' && (unit.actions?.length ?? 0) > 0 && (
            <details className="mu-acts">
              <summary>Действия</summary>
              <ul>
                {unit.actions!.map((a) => (
                  <li key={a.name}>
                    <b>{a.name}.</b> {a.desc ?? a.description ?? ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
