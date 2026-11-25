/**
 * Свой предмет инвентаря и правка любого предмета: название, категория, вес, описание
 * и картинка (загрузка в хранилище). Предмет хранится снимком в инвентаре героя —
 * каталог не меняется: «гребень», которого нет в базе, — просто снимок со своим названием.
 */
import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { uploadMedia } from '../../api'
import type { Equipment, Item } from '../../api'
import { Img } from '../../media'
import type { InventoryItemInstance } from '../../types/character'

export const CUSTOM_CATEGORIES = [
  'Прочее',
  'Снаряжение',
  'Оружие',
  'Доспехи',
  'Инструменты',
  'Музыкальные инструменты',
  'Игровые наборы',
  'Зелья и яды',
  'Торговые товары',
  'Боеприпасы',
] as const

export type CustomItemValues = {
  name: string
  category: string
  weight: number | null
  description: string
  image: string | null
}

/** Значения формы из предмета инвентаря */
export function valuesOf(it: InventoryItemInstance): CustomItemValues {
  const eq = it.equipment
  const mag = it.magic_item
  return {
    name: eq?.equipment_name ?? mag?.item_name ?? '',
    category: eq?.category ?? 'Прочее',
    weight: eq?.weight ?? null,
    description: (eq?.description ?? mag?.description ?? '') || '',
    image: eq?.equipment_image_gallery?.[0] ?? mag?.item_image_gallery?.[0] ?? null,
  }
}

/** Изменения снимка предмета по значениям формы (каталог не трогается) */
export function applyValues(it: InventoryItemInstance, v: CustomItemValues): Partial<InventoryItemInstance> {
  const gallery = v.image ? [v.image] : []
  if (it.magic_item) {
    return { magic_item: { ...it.magic_item, item_name: v.name, description: v.description, item_image_gallery: gallery } as Item }
  }
  const eq = it.equipment as Equipment
  return {
    equipment: {
      ...eq,
      equipment_name: v.name,
      category: v.category,
      weight: v.weight,
      description: v.description,
      equipment_image_gallery: gallery,
    } as Equipment,
  }
}

/** Новый свой предмет (без ссылки на каталог) */
export function customInventoryItem(v: CustomItemValues, position: { col: number; row: number }): InventoryItemInstance {
  const equipment = {
    id: '',
    slug: `custom-${crypto.randomUUID().slice(0, 8)}`,
    equipment_name: v.name,
    equipment_name_en: null,
    category: v.category,
    subcategory: null,
    tags: ['custom'],
    weight: v.weight,
    cost: null,
    cost_copper: null,
    stackable: false,
    description: v.description,
    equipment_image_gallery: v.image ? [v.image] : [],
    abilities: [],
  } as unknown as Equipment
  return {
    instance_id: crypto.randomUUID(),
    kind: 'equipment',
    equipment,
    magic_item: null,
    catalog_ref: null,
    quantity: 1,
    notes: '',
    position,
    equipped: false,
    equip_slot: null,
    is_attuned: false,
  }
}

export function CustomItemEditor({
  initial,
  title,
  submitLabel,
  showCategory = true,
  onSubmit,
  onCancel,
}: {
  initial: CustomItemValues
  title: string
  submitLabel: string
  /** у магических предметов категория — не своя */
  showCategory?: boolean
  onSubmit: (v: CustomItemValues) => void
  onCancel?: () => void
}) {
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<CustomItemValues>) => setV((cur) => ({ ...cur, ...patch }))

  const upload = async (f: File) => {
    setBusy(true)
    setError(null)
    try {
      set({ image: (await uploadMedia(f)).url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить картинку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="cw-custom-item"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.name.trim()) onSubmit({ ...v, name: v.name.trim() })
      }}
    >
      <h5 className="cw-custom-title">{title}</h5>
      <div className="cw-custom-row">
        <button
          type="button"
          className="cw-custom-image"
          onClick={() => file.current?.click()}
          title={v.image ? 'Сменить картинку' : 'Загрузить картинку'}
          aria-label={v.image ? 'Сменить картинку' : 'Загрузить картинку'}
          disabled={busy}
        >
          {busy ? <Loader2 className="spin" aria-hidden="true" /> : v.image ? <Img src={v.image} alt="" /> : <ImagePlus aria-hidden="true" />}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <div className="cw-custom-fields">
          <input
            className="ed-input"
            value={v.name}
            maxLength={120}
            placeholder="Название: «Гребень из слоновой кости»"
            onChange={(e) => set({ name: e.target.value })}
            aria-label="Название предмета"
            autoFocus
          />
          <div className="cw-custom-pair">
            {showCategory && (
              <select className="ed-input" value={v.category} onChange={(e) => set({ category: e.target.value })} aria-label="Категория">
                {CUSTOM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {showCategory && (
              <input
                className="ed-input"
                type="number"
                min={0}
                step={0.1}
                value={v.weight ?? ''}
                placeholder="Вес, фунты"
                onChange={(e) => set({ weight: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                aria-label="Вес в фунтах"
              />
            )}
          </div>
        </div>
      </div>
      {v.image && (
        <button type="button" className="cw-mini-btn" onClick={() => set({ image: null })}>
          <Trash2 aria-hidden="true" /> убрать картинку
        </button>
      )}
      <textarea
        className="ed-input ed-area"
        rows={3}
        maxLength={2000}
        value={v.description}
        placeholder="Описание (необязательно)"
        onChange={(e) => set({ description: e.target.value })}
        aria-label="Описание предмета"
      />
      {error && <p className="ed-error">{error}</p>}
      <div className="cw-custom-actions">
        {onCancel && (
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button type="submit" className="cs-btn cw-next" disabled={!v.name.trim() || busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
