/**
 * Инвентарь прямо в листе: сетка 7 × N, предметы перетаскиваются между
 * клетками (или: выбрать предмет, затем пустую клетку — так работает и на
 * телефоне). Под сеткой — выбранный предмет: количество, подробности, удаление
 * и, у контейнеров, то, что лежит внутри, с кнопкой «выложить в инвентарь».
 * Добавление из каталога — в окне управления инвентарём.
 */
import { useState, type DragEvent } from 'react'
import { BookOpen, Minus, PackageOpen, Package, Plus, Shield, Trash2 } from 'lucide-react'
import { realImage } from '../api'
import type { Currency, Equipment } from '../api'
import { categoryIcon } from '../equipment'
import { useEquipmentDrawer } from '../equipmentDrawer'
import { useEquipmentIndex } from '../equipmentIndex'
import { coinOf, inventoryItem } from '../create/startingGear'
import { InventoryManager } from '../create/steps/InventoryManager'
import type { InventoryItemInstance } from '../types/character'

const COLS = 7
const cellKey = (col: number, row: number) => `${col}:${row}`

function firstFree(items: InventoryItemInstance[]): { col: number; row: number } {
  const taken = new Set(items.map((i) => cellKey(i.position.col, i.position.row)))
  for (let n = 0; ; n++) {
    const pos = { col: n % COLS, row: Math.floor(n / COLS) }
    if (!taken.has(cellKey(pos.col, pos.row))) return pos
  }
}

const itemName = (it: InventoryItemInstance) => it.equipment?.equipment_name ?? it.magic_item?.item_name ?? 'Предмет'
const contentsOf = (it: InventoryItemInstance) => it.equipment?.container?.default_contents ?? []

function ItemFace({ eq, src: forced }: { eq: Equipment | null | undefined; src?: string | null }) {
  const [broken, setBroken] = useState(false)
  const src = forced ?? realImage(eq?.equipment_image_gallery)
  const Icon = categoryIcon(eq?.category)
  return src && !broken ? (
    <img src={src} alt="" draggable={false} loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <Icon aria-hidden="true" />
  )
}

export function InventoryBoard({
  items,
  onChange,
}: {
  items: InventoryItemInstance[]
  /** новые предметы и монеты, высыпанные из контейнера */
  onChange: (items: InventoryItemInstance[], coins?: Partial<Record<Currency, number>>) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCell, setOverCell] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  const index = useEquipmentIndex()
  const drawer = useEquipmentDrawer()

  const byCell = new Map(items.map((i) => [cellKey(i.position.col, i.position.row), i]))
  const maxRow = Math.max(-1, ...items.map((i) => i.position.row))
  // всегда есть свободный ряд — есть куда перетащить
  const rows = Math.max(3, maxRow + 2)
  const current = items.find((i) => i.instance_id === selected) ?? null

  /** Перенос в клетку; если она занята — предметы меняются местами */
  const moveTo = (id: string, col: number, row: number) => {
    const moving = items.find((i) => i.instance_id === id)
    if (!moving || (moving.position.col === col && moving.position.row === row)) return
    const target = byCell.get(cellKey(col, row))
    onChange(
      items.map((i) =>
        i.instance_id === id
          ? { ...i, position: { col, row } }
          : target && i.instance_id === target.instance_id
            ? { ...i, position: moving.position }
            : i,
      ),
    )
  }

  const onDrop = (e: DragEvent, col: number, row: number) => {
    e.preventDefault()
    setOverCell(null)
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    if (id) moveTo(id, col, row)
    setDragId(null)
  }

  const patch = (id: string, change: Partial<InventoryItemInstance>) =>
    onChange(items.map((i) => (i.instance_id === id ? { ...i, ...change } : i)))

  const remove = (id: string) => {
    onChange(items.filter((i) => i.instance_id !== id))
    setSelected(null)
  }

  /** Выложить содержимое контейнера: предметы — в свободные клетки (стопкой к таким же), монеты — в кошелёк */
  const unpack = (it: InventoryItemInstance) => {
    const eq = it.equipment
    if (!eq?.container) return
    const coins: Partial<Record<Currency, number>> = {}
    let next = items.map((i) =>
      i.instance_id === it.instance_id ? { ...i, equipment: { ...eq, container: { ...eq.container!, default_contents: [] } } } : i,
    )
    for (const c of eq.container.default_contents) {
      const coin = coinOf(c.slug)
      if (coin) {
        coins[coin] = (coins[coin] ?? 0) + c.quantity
        continue
      }
      const content = index?.bySlug.get(c.slug)
      if (!content) continue
      const same = content.stackable ? next.find((i) => i.equipment?.slug === content.slug) : null
      next = same
        ? next.map((i) => (i === same ? { ...i, quantity: i.quantity + c.quantity } : i))
        : [...next, { ...inventoryItem(content, c.quantity, 0, { equipped: false, slot: null }), position: firstFree(next) }]
    }
    onChange(next, coins)
  }

  const contents = current ? contentsOf(current) : []

  return (
    <div className="cw-ib">
      <div className="cw-inv-grid cw-ib-grid">
        {Array.from({ length: rows * COLS }, (_, n) => {
          const col = n % COLS
          const row = Math.floor(n / COLS)
          const key = cellKey(col, row)
          const it = byCell.get(key)
          const packed = it ? contentsOf(it).length : 0
          return (
            <div
              key={key}
              className={`cw-inv-slot${overCell === key ? ' is-over' : ''}${!it && selected ? ' is-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setOverCell(key)
              }}
              onDragLeave={() => setOverCell((c) => (c === key ? null : c))}
              onDrop={(e) => onDrop(e, col, row)}
              // выбранный предмет — в пустую клетку по клику
              onClick={() => !it && selected && moveTo(selected, col, row)}
            >
              {it && (
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragId(it.instance_id)
                    e.dataTransfer.setData('text/plain', it.instance_id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => setDragId(null)}
                  className={`cw-inv-cell${it.equipped ? ' is-equipped' : ''}${selected === it.instance_id ? ' is-selected' : ''}${dragId === it.instance_id ? ' is-dragging' : ''}${packed ? ' is-container' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(selected === it.instance_id ? null : it.instance_id)
                  }}
                  title={`${itemName(it)}${it.quantity > 1 ? ` ×${it.quantity}` : ''}${packed ? ` · внутри ${packed}` : ''}`}
                >
                  <ItemFace eq={it.equipment} />
                  {it.quantity > 1 && <i className="cw-inv-qty">{it.quantity}</i>}
                  {it.equipped && <Shield className="cw-inv-worn" aria-label="надето" />}
                  {packed > 0 && (
                    <span className="cw-ib-pack" aria-label={`Внутри: ${packed}`}>
                      <Package aria-hidden="true" />
                      {packed}
                    </span>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="cw-ib-bar">
        <span className="cw-field-note">
          {current ? 'Нажмите пустую клетку, чтобы переложить предмет' : 'Перетаскивайте предметы; нажмите — подробности'}
        </span>
        <button type="button" className="cw-mini-btn" onClick={() => setManage(true)}>
          <Plus aria-hidden="true" /> добавить
        </button>
      </div>

      {current && (
        <div className="cw-ib-detail">
          <div className="cw-ib-detail-row">
            <span className="cw-ib-face">
              <ItemFace eq={current.equipment} />
            </span>
            <span className="cw-ib-detail-body">
              <b>{itemName(current)}</b>
              <i>
                {[current.equipment?.subcategory ?? current.equipment?.category, current.equipped ? 'надето' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </i>
            </span>
            <span className="cw-inv-qty-ctl" aria-label="Количество">
              <button
                type="button"
                onClick={() => patch(current.instance_id, { quantity: Math.max(1, current.quantity - 1) })}
                aria-label="Меньше"
              >
                <Minus aria-hidden="true" />
              </button>
              <b>{current.quantity}</b>
              <button type="button" onClick={() => patch(current.instance_id, { quantity: current.quantity + 1 })} aria-label="Больше">
                <Plus aria-hidden="true" />
              </button>
            </span>
          </div>
          <div className="cw-ib-detail-actions">
            {current.equipment?.id && (
              <button type="button" className="cw-mini-btn" onClick={() => drawer.open(current.equipment!.id)}>
                <BookOpen aria-hidden="true" /> подробнее
              </button>
            )}
            <button type="button" className="cw-mini-btn cw-mini-btn--danger" onClick={() => remove(current.instance_id)}>
              <Trash2 aria-hidden="true" /> удалить
            </button>
          </div>

          {contents.length > 0 && (
            <div className="cw-ib-contents">
              <span className="cw-ib-contents-title">
                <PackageOpen aria-hidden="true" /> Внутри · {contents.length}
              </span>
              <div className="cw-ib-contents-grid">
                {contents.map((c, i) => {
                  const eq = index?.bySlug.get(c.slug) ?? null
                  const name = eq?.equipment_name ?? c.slug
                  return (
                    <button
                      key={`${c.slug}-${i}`}
                      type="button"
                      className="cw-ib-content"
                      title={`${name}${c.quantity > 1 ? ` ×${c.quantity}` : ''}`}
                      onClick={() => eq && drawer.open(eq.id)}
                      disabled={!eq}
                    >
                      <span className="cw-ib-content-face">
                        <ItemFace eq={eq} src={realImage(c.image_gallery)} />
                        {c.quantity > 1 && <i className="cw-inv-qty">{c.quantity}</i>}
                      </span>
                      <span className="cw-ib-content-name">{name}</span>
                    </button>
                  )
                })}
              </div>
              <button type="button" className="cw-mini-btn" onClick={() => unpack(current)} disabled={!index}>
                <PackageOpen aria-hidden="true" /> выложить в инвентарь
              </button>
            </div>
          )}
        </div>
      )}

      {manage && <InventoryManager items={items} onSave={(next) => onChange(next)} onClose={() => setManage(false)} />}
    </div>
  )
}
