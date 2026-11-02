/**
 * Инвентарь копии героя в комнате. Владелец не может править его через PATCH
 * персонажа — только предметами: надеть, настроить, переложить в клетку,
 * заметка. Мастер, кроме того, может забрать предмет обратно на ширму.
 * Доска инвентаря отдаёт весь список целиком, поэтому здесь сравниваем его с
 * прежним и отправляем только изменённое.
 */
import type { InventoryItemInstance } from '../types/character'
import { patchInventoryItem, takeBackFromCharacter, type InventoryPatch } from './roomsApi'

const samePos = (a: InventoryItemInstance['position'], b: InventoryItemInstance['position']) =>
  (a?.col ?? -1) === (b?.col ?? -1) && (a?.row ?? -1) === (b?.row ?? -1)

export function diffInventoryItem(prev: InventoryItemInstance, next: InventoryItemInstance): InventoryPatch | null {
  const patch: InventoryPatch = {}
  if (prev.equipped !== next.equipped) patch.equipped = next.equipped
  if ((prev.equip_slot ?? null) !== (next.equip_slot ?? null)) patch.equip_slot = next.equip_slot ?? null
  if (prev.is_attuned !== next.is_attuned) patch.is_attuned = next.is_attuned
  if (!samePos(prev.position, next.position)) patch.position = { col: next.position.col, row: next.position.row }
  if ((prev.notes ?? '') !== (next.notes ?? '')) patch.notes = next.notes ?? ''
  return Object.keys(patch).length ? patch : null
}

export async function syncRoomInventory(
  roomId: string,
  characterId: string,
  before: InventoryItemInstance[],
  after: InventoryItemInstance[],
  opts: { canRemove: boolean },
): Promise<void> {
  const prev = new Map(before.map((it) => [it.instance_id, it]))
  const next = new Map(after.map((it) => [it.instance_id, it]))
  // по очереди: перемещения могут зависеть друг от друга (занятая клетка даёт 422)
  for (const [id, item] of next) {
    const old = prev.get(id)
    if (!old) continue
    const patch = diffInventoryItem(old, item)
    if (patch) await patchInventoryItem(roomId, characterId, id, patch)
  }
  if (opts.canRemove) {
    for (const [id] of prev) if (!next.has(id)) await takeBackFromCharacter(roomId, characterId, id)
  }
}
