/**
 * Подключить кнопку действия к панели быстрых действий: её можно перетащить на
 * панель, а панель вызывает её обработчик. Работает только внутри источника —
 * листа героя в комнате (`HotbarSourceContext`); вне комнаты хук ничего не делает.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type DragEvent } from 'react'
import { encodeDrag, HOTBAR_MIME, slotKey, type HotbarSlot, type SlotKind } from './model'
import { PRIORITY, registerRunner } from './registry'

export interface HotbarSource {
  /** id копии героя в комнате */
  characterId: string
}

export const HotbarSourceContext = createContext<HotbarSource | null>(null)

export const useHotbarSource = () => useContext(HotbarSourceContext)

export interface HotbarSpec {
  kind: SlotKind
  ref: string
  label: string
  icon?: string | null
}

export interface HotbarBinding {
  /** готовая ячейка; null — вне комнаты */
  slot: HotbarSlot | null
  /** записать ячейку в перетаскивание (для кнопок со своим onDragStart) */
  writeDrag: (dt: DataTransfer) => void
  /** draggable и onDragStart для кнопки без своего перетаскивания */
  dragProps: { draggable?: boolean; onDragStart?: (e: DragEvent) => void }
}

export function writeSlotDrag(dt: DataTransfer, slot: HotbarSlot): void {
  dt.setData(HOTBAR_MIME, encodeDrag({ slot }))
  // браузеры прячут данные до drop: тип в списке говорит панели, что это наше
  if (!dt.getData('text/plain')) dt.setData('text/plain', slot.label)
  dt.effectAllowed = dt.effectAllowed === 'move' ? 'copyMove' : 'copy'
}

/**
 * spec — что это за действие, run — тот же обработчик, что у клика по кнопке.
 * priority: лоток боя выше листа.
 */
export function useHotbarAction(spec: HotbarSpec | null, run: () => void, priority: number = PRIORITY.sheet, characterId?: string | null): HotbarBinding {
  const source = useHotbarSource()
  const cid = characterId ?? source?.characterId ?? null
  const ref = useRef(run)
  useLayoutEffect(() => {
    ref.current = run
  })
  const kind = spec?.kind
  const sref = spec?.ref
  const label = spec?.label
  const icon = spec?.icon ?? null
  const slot = useMemo<HotbarSlot | null>(
    () => (cid && kind && sref && label ? { kind, ref: sref, label, character_id: cid, ...(icon ? { icon } : {}) } : null),
    [cid, kind, sref, label, icon],
  )
  const key = slot ? slotKey(slot) : null
  useEffect(() => {
    if (!key) return
    return registerRunner(key, () => ref.current(), priority)
  }, [key, priority])
  return useMemo<HotbarBinding>(() => {
    if (!slot) return { slot, writeDrag: () => undefined, dragProps: {} }
    const writeDrag = (dt: DataTransfer) => writeSlotDrag(dt, slot)
    return { slot, writeDrag, dragProps: { draggable: true, onDragStart: (e: DragEvent) => writeDrag(e.dataTransfer) } }
  }, [slot])
}
