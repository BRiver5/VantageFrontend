/**
 * Слоты настройки под портретом героя: магические предметы, на которые герой настроен.
 * Положить предмет в слот — надеть и настроиться; его бонусы (свои у предмета) сервер
 * сразу учитывает в листе. Слотов 3 (у артефактора больше — по его умениям).
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Gem, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { realImage } from '../../api'
import { Img } from '../../media'
import type { CustomModifier, InventoryItemInstance } from '../../types/character'
import { itemPreset } from '../itemPresets'
import { BONUS_TARGETS } from './editor/BonusesSection'

const TARGETS = BONUS_TARGETS.flatMap((g) => g.items)
const targetLabel = (path: string) => TARGETS.find((t) => t.value === path)?.label ?? path

const nameOf = (it: InventoryItemInstance) => it.magic_item?.item_name ?? it.equipment?.equipment_name ?? 'Предмет'
const imageOf = (it: InventoryItemInstance) =>
  realImage(it.magic_item?.item_image_gallery) ?? realImage(it.equipment?.equipment_image_gallery)
/** нужна ли предмету настройка */
const needsAttunement = (it: InventoryItemInstance) => !!it.magic_item?.attunement_required

export function bonusText(m: CustomModifier): string {
  if (m.label?.trim()) return m.label.trim()
  const v = Array.isArray(m.value) ? m.value.join(', ') : String(m.value)
  return m.op === 'max' ? `${targetLabel(m.target)} ${v}` : `${targetLabel(m.target)} ${Number(m.value) >= 0 ? '+' : ''}${v}`
}

export function AttunementSlots({
  items,
  max,
  onChange,
}: {
  items: InventoryItemInstance[]
  max: number
  /** null — только просмотр */
  onChange: ((items: InventoryItemInstance[]) => void) | null
}) {
  const attuned = items.filter((i) => i.is_attuned)
  const [open, setOpen] = useState<{ slot: number; anchor: DOMRect } | null>(null)
  const slots = Math.max(max, attuned.length)

  const patch = (id: string, change: Partial<InventoryItemInstance>) =>
    onChange?.(items.map((i) => (i.instance_id === id ? { ...i, ...change } : i)))

  // настроенный до появления готовых бонусов (Амулет здоровья без бонусов) — подставить их один раз
  const filled = useRef(new Set<string>())
  useEffect(() => {
    if (!onChange) return
    const missing = items.filter(
      (i) => i.is_attuned && !(i.bonuses?.length) && !filled.current.has(i.instance_id) && itemPreset(nameOf(i)).length > 0,
    )
    if (!missing.length) return
    missing.forEach((i) => filled.current.add(i.instance_id))
    const ids = new Set(missing.map((i) => i.instance_id))
    onChange(items.map((i) => (ids.has(i.instance_id) ? { ...i, bonuses: itemPreset(nameOf(i)) } : i)))
  }, [items, onChange])

  const attune = (it: InventoryItemInstance) => {
    const bonuses = it.bonuses?.length ? it.bonuses : itemPreset(nameOf(it))
    patch(it.instance_id, { is_attuned: true, equipped: true, bonuses })
    setOpen(null)
  }

  const current = open ? (attuned[open.slot] ?? null) : null
  // кандидаты: магические предметы с настройкой (и любые другие предметы — по желанию игрока)
  const candidates = items
    .filter((i) => !i.is_attuned && (i.kind === 'magic_item' || (i.bonuses?.length ?? 0) > 0))
    .sort((a, b) => Number(needsAttunement(b)) - Number(needsAttunement(a)) || nameOf(a).localeCompare(nameOf(b), 'ru'))

  return (
    <div className="att-slots" role="group" aria-label="Настройка на магические предметы">
      <span className="att-caption">
        <Sparkles aria-hidden="true" /> Настройка {attuned.length}/{max}
      </span>
      <div className="att-row">
        {Array.from({ length: slots }, (_, n) => {
          const it = attuned[n]
          const src = it ? imageOf(it) : null
          return (
            <button
              key={n}
              type="button"
              className={`att-slot${it ? ' is-filled' : ''}${n >= max ? ' is-over' : ''}`}
              title={it ? `${nameOf(it)}${it.bonuses?.length ? ` — ${it.bonuses.map(bonusText).join(', ')}` : ''}` : 'Пустой слот настройки'}
              onClick={(e) => onChange && setOpen({ slot: n, anchor: e.currentTarget.getBoundingClientRect() })}
              disabled={!onChange && !it}
            >
              <span className="att-gem">
                {it ? src ? <Img src={src} alt="" draggable={false} /> : <Gem aria-hidden="true" /> : <Plus aria-hidden="true" />}
              </span>
              {it && <span className="att-name">{nameOf(it)}</span>}
            </button>
          )
        })}
      </div>
      {open && onChange && (
        <SlotPopover anchor={open.anchor} onClose={() => setOpen(null)}>
          {current ? (
            <AttunedItem
              it={current}
              onBonuses={(bonuses) => patch(current.instance_id, { bonuses })}
              onRelease={() => {
                patch(current.instance_id, { is_attuned: false })
                setOpen(null)
              }}
            />
          ) : (
            <>
              <h5 className="att-pop-title">Настроиться на предмет</h5>
              {attuned.length >= max && <p className="att-pop-note">Все слоты заняты — сначала снимите настройку с другого предмета.</p>}
              {candidates.length === 0 && (
                <p className="att-pop-note">В инвентаре нет магических предметов. Добавьте их во вкладке «Инвентарь».</p>
              )}
              <div className="att-pop-list">
                {candidates.map((it) => {
                  const preset = it.bonuses?.length ? it.bonuses : itemPreset(nameOf(it))
                  return (
                    <button key={it.instance_id} type="button" className="att-pop-item" onClick={() => attune(it)} disabled={attuned.length >= max}>
                      <span className="att-gem att-gem--sm">
                        {imageOf(it) ? <Img src={imageOf(it)!} alt="" /> : <Gem aria-hidden="true" />}
                      </span>
                      <span className="att-pop-text">
                        <b>{nameOf(it)}</b>
                        <i>
                          {[needsAttunement(it) ? 'требует настройки' : 'без обязательной настройки', ...preset.map(bonusText)].join(' · ')}
                        </i>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </SlotPopover>
      )}
    </div>
  )
}

function AttunedItem({
  it,
  onBonuses,
  onRelease,
}: {
  it: InventoryItemInstance
  onBonuses: (b: CustomModifier[]) => void
  onRelease: () => void
}) {
  return (
    <>
      <h5 className="att-pop-title">{nameOf(it)}</h5>
      <p className="att-pop-note">Бонусы предмета действуют, пока вы на него настроены. Нет нужного — добавьте свой.</p>
      <ItemBonuses bonuses={it.bonuses ?? []} onChange={onBonuses} />
      <button type="button" className="cw-mini-btn cw-mini-btn--danger" onClick={onRelease}>
        <X aria-hidden="true" /> снять настройку
      </button>
    </>
  )
}

/** Редактор бонусов предмета: что усиливает и насколько */
export function ItemBonuses({ bonuses, onChange }: { bonuses: CustomModifier[]; onChange: (b: CustomModifier[]) => void }) {
  const set = (i: number, patch: Partial<CustomModifier>) => onChange(bonuses.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  return (
    <div className="att-bonuses">
      {bonuses.map((m, i) => {
        const t = TARGETS.find((x) => x.value === m.target)
        const isList = (t?.op ?? m.op) === 'union'
        return (
          <div key={i} className="att-bonus">
            <select
              className="ed-input"
              value={m.target}
              onChange={(e) => {
                const next = TARGETS.find((x) => x.value === e.target.value)
                set(i, { target: e.target.value, op: next?.op ?? 'add', label: '', value: next?.op === 'union' ? [] : 1 })
              }}
              aria-label="Что усиливает"
            >
              {!t && <option value={m.target}>{m.target}</option>}
              {BONUS_TARGETS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {isList ? (
              <input
                className="ed-input"
                value={Array.isArray(m.value) ? m.value.join(', ') : String(m.value ?? '')}
                placeholder="через запятую"
                onChange={(e) => set(i, { label: '', value: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                aria-label="Значения"
              />
            ) : (
              <input
                className="ed-input att-bonus-num"
                type="number"
                value={Number(m.value) || 0}
                onChange={(e) => set(i, { label: '', value: Number(e.target.value) })}
                aria-label="Величина"
              />
            )}
            <button type="button" className="ed-btn ed-btn--icon is-danger" onClick={() => onChange(bonuses.filter((_, j) => j !== i))} aria-label="Убрать бонус">
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="cw-mini-btn"
        onClick={() => onChange([...bonuses, { label: '', target: 'char.ac', op: 'add', value: 1, enabled: true }])}
      >
        <Plus aria-hidden="true" /> бонус
      </button>
    </div>
  )
}

function SlotPopover({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const t = setTimeout(() => document.addEventListener('mousedown', down))
    document.addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])
  const width = Math.min(360, window.innerWidth - 24)
  const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 12))
  return createPortal(
    <div ref={ref} className="att-pop" style={{ top: anchor.bottom + 8, left, width }} role="dialog" aria-label="Слот настройки">
      {children}
    </div>,
    document.body,
  )
}
