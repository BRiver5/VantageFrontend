/**
 * Управление инвентарём на итоге: сетка 7 × N с перетаскиванием предметов между
 * клетками, выбор предмета (количество, удалить, открыть в панели) и добавление
 * новых предметов из каталога снаряжения — с поиском и фильтрами, как в каталоге.
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Minus, Plus, Shield, Trash2, X } from 'lucide-react'
import { realImage } from '../../api'
import type { Equipment } from '../../api'
import { PriceMark } from '../../coins'
import { categoryIcon } from '../../equipment'
import { useEquipmentDrawer } from '../../equipmentDrawer'
import { useEquipmentIndex } from '../../equipmentIndex'
import type { InventoryItemInstance } from '../../types/character'
import { inventoryItem } from '../startingGear'
import { PickToolbar, usePicker, type PickFilterGroup } from './ui'

const COLS = 7
const cellKey = (col: number, row: number) => `${col}:${row}`
const eqName = (e: Equipment) => e.equipment_name

function ItemFace({ eq }: { eq: Equipment | null }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(eq?.equipment_image_gallery)
  const Icon = categoryIcon(eq?.category)
  return src && !broken ? (
    <img src={src} alt="" draggable={false} onError={() => setBroken(true)} />
  ) : (
    <Icon aria-hidden="true" />
  )
}

/** Первая свободная клетка сетки (слева направо, сверху вниз) */
function firstFree(items: InventoryItemInstance[]): { col: number; row: number } {
  const taken = new Set(items.map((i) => cellKey(i.position.col, i.position.row)))
  for (let n = 0; ; n++) {
    const pos = { col: n % COLS, row: Math.floor(n / COLS) }
    if (!taken.has(cellKey(pos.col, pos.row))) return pos
  }
}

export function InventoryManager({
  items: initial,
  onSave,
  onClose,
}: {
  items: InventoryItemInstance[]
  onSave: (items: InventoryItemInstance[]) => void
  onClose: () => void
}) {
  const [items, setItems] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCell, setOverCell] = useState<string | null>(null)
  const index = useEquipmentIndex()
  const drawer = useEquipmentDrawer()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.eq-drawer-layer')) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /* ---------- сетка ---------- */

  const byCell = new Map(items.map((i) => [cellKey(i.position.col, i.position.row), i]))
  const maxRow = Math.max(0, ...items.map((i) => i.position.row))
  const rows = Math.max(5, maxRow + 2)
  const current = items.find((i) => i.instance_id === selected) ?? null

  /** Перенос в клетку; если она занята — предметы меняются местами */
  const moveTo = (id: string, col: number, row: number) => {
    setItems((prev) => {
      const moving = prev.find((i) => i.instance_id === id)
      if (!moving) return prev
      const target = prev.find((i) => i.position.col === col && i.position.row === row)
      return prev.map((i) =>
        i.instance_id === id
          ? { ...i, position: { col, row } }
          : target && i.instance_id === target.instance_id
            ? { ...i, position: moving.position }
            : i,
      )
    })
  }

  const onDrop = (e: DragEvent, col: number, row: number) => {
    e.preventDefault()
    setOverCell(null)
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    if (id) moveTo(id, col, row)
    setDragId(null)
  }

  const patch = (id: string, change: Partial<InventoryItemInstance>) =>
    setItems((prev) => prev.map((i) => (i.instance_id === id ? { ...i, ...change } : i)))

  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.instance_id !== id))
    setSelected(null)
  }

  /** Добавить из каталога: стопкой к такому же, иначе — в первую свободную клетку */
  const add = (eq: Equipment) => {
    setItems((prev) => {
      const same = eq.stackable ? prev.find((i) => i.equipment?.slug === eq.slug) : null
      if (same) return prev.map((i) => (i === same ? { ...i, quantity: i.quantity + 1 } : i))
      const pos = firstFree(prev)
      const item = inventoryItem(eq, 1, 0, { equipped: false, slot: null })
      return [...prev, { ...item, position: pos }]
    })
  }

  /* ---------- каталог для добавления ---------- */

  const catalog = useMemo(() => index?.list ?? [], [index])
  const groups = useMemo<PickFilterGroup<Equipment>[]>(() => {
    const categories = [...new Set(catalog.map((e) => e.category))].sort((a, b) => a.localeCompare(b, 'ru'))
    return [
      {
        key: 'category',
        label: 'Категория',
        options: categories.map((c) => ({ key: c, label: c })),
        match: (e, sel) => sel.includes(e.category),
      },
      {
        key: 'kind',
        label: 'Оружие',
        options: [
          { key: 'Простое', label: 'Простое' },
          { key: 'Воинское', label: 'Воинское' },
        ],
        match: (e, sel) => !!e.weapon?.weapon_kind && sel.includes(e.weapon.weapon_kind),
      },
    ]
  }, [catalog])
  const picker = usePicker(catalog, eqName, groups)
  const shown = picker.visible.slice(0, 80)

  return createPortal(
    <div className="cw-modal-layer" onClick={onClose}>
      <div
        className="cw-modal cw-inv-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Инвентарь"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cw-modal-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
        <div className="cw-modal-scroll cw-inv-layout">
          {/* ---------- сетка и выбранный предмет ---------- */}
          <div className="cw-inv-left">
            <h3 className="cw-modal-title gold-text">Инвентарь</h3>
            <p className="cw-field-note">Перетаскивайте предметы между клетками; нажмите на предмет, чтобы изменить его.</p>
            <div className="cw-inv-grid cw-inv-grid--edit" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
              {Array.from({ length: rows * COLS }, (_, n) => {
                const col = n % COLS
                const row = Math.floor(n / COLS)
                const key = cellKey(col, row)
                const it = byCell.get(key)
                return (
                  <div
                    key={key}
                    className={`cw-inv-slot${overCell === key ? ' is-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setOverCell(key)
                    }}
                    onDragLeave={() => setOverCell((c) => (c === key ? null : c))}
                    onDrop={(e) => onDrop(e, col, row)}
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
                        className={`cw-inv-cell${it.equipped ? ' is-equipped' : ''}${selected === it.instance_id ? ' is-selected' : ''}${dragId === it.instance_id ? ' is-dragging' : ''}`}
                        onClick={() => setSelected(selected === it.instance_id ? null : it.instance_id)}
                        title={it.equipment?.equipment_name ?? 'Предмет'}
                      >
                        <ItemFace eq={it.equipment} />
                        {it.quantity > 1 && <i className="cw-inv-qty">{it.quantity}</i>}
                        {it.equipped && <Shield className="cw-inv-worn" aria-label="надето" />}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {current && (
              <div className="cw-inv-detail">
                <span className="cw-inv-detail-face">
                  <ItemFace eq={current.equipment} />
                </span>
                <span className="cw-inv-detail-body">
                  <b>{current.equipment?.equipment_name ?? 'Предмет'}</b>
                  <i>{[current.equipment?.category, current.equipped ? 'надето' : null].filter(Boolean).join(' · ')}</i>
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
                  <button
                    type="button"
                    onClick={() => patch(current.instance_id, { quantity: current.quantity + 1 })}
                    aria-label="Больше"
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </span>
                {current.equipment?.id && (
                  <button
                    type="button"
                    className="cw-mini-btn"
                    onClick={() => drawer.open(current.equipment!.id)}
                  >
                    <BookOpen aria-hidden="true" /> подробнее
                  </button>
                )}
                <button type="button" className="cw-mini-btn cw-mini-btn--danger" onClick={() => remove(current.instance_id)}>
                  <Trash2 aria-hidden="true" /> удалить
                </button>
              </div>
            )}
          </div>

          {/* ---------- добавление из каталога ---------- */}
          <div className="cw-inv-right">
            <h4 className="cw-id-title">Добавить предмет</h4>
            <PickToolbar picker={picker} groups={groups} placeholder="Искать снаряжение…" />
            <div className="cw-inv-catalog">
              {shown.map((e) => (
                <div key={e.id} className="cw-inv-row">
                  <span className="cw-inv-row-face">
                    <ItemFace eq={e} />
                  </span>
                  <span className="cw-inv-row-body">
                    <b>{e.equipment_name}</b>
                    <i>{e.subcategory ?? e.category}</i>
                  </span>
                  <PriceMark cost={e.cost} costCopper={e.cost_copper} className="cw-gsel-price" />
                  <button type="button" className="cw-inv-add" onClick={() => add(e)} title="Добавить в инвентарь">
                    <Plus aria-hidden="true" />
                  </button>
                </div>
              ))}
              {picker.visible.length > shown.length && (
                <p className="cw-field-note">Показаны первые {shown.length} из {picker.visible.length} — уточните поиск.</p>
              )}
            </div>
          </div>
        </div>
        <footer className="cw-modal-foot cw-inv-foot">
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="cs-btn cw-next"
            onClick={() => {
              onSave(items)
              onClose()
            }}
          >
            Сохранить инвентарь
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
