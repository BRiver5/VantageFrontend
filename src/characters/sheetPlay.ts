/** Состояние листа «до отдыха»: потраченные ячейки и расовая магия */
import type { SheetView } from '../types/character'
import type { RollContext } from './rollBonuses'

/** Правка полей листа, которые хранит документ: записи, кошелёк, инвентарь */
export type SheetPatch = (fn: (c: SheetView) => SheetView) => void

/** Потраченные ячейки по кругам и расовые заклинания, использованные до отдыха */
export interface SheetPlay {
  slotsUsed: Record<string, number>
  setSlotsUsed: (fn: (prev: Record<string, number>) => Record<string, number>) => void
  racialUsed: Set<string>
  setRacialUsed: (fn: (prev: Set<string>) => Set<string>) => void
  /**
   * Ячейки хранит сервер: игрок тратит их только действиями способностей,
   * напрямую — лишь мастер. true — звёзды и сотворение ячейкой недоступны.
   */
  slotsLocked?: boolean
}

/** Расовые заклинания, отмеченные потраченными до отдыха (snapshot.spent в документе) */
export function spentRacial(spells: SheetView['spellcasting']['spells_known']): Set<string> {
  return new Set(spells.filter((sp) => (sp.snapshot as { spent?: boolean } | null)?.spent).map((sp) => sp.name))
}

/**
 * Состояние «до отдыха» у сохранённого героя: ячейки — из листа сервера
 * (меняет их только мастер через `master`), расовая магия — в документе.
 */
export function sheetPlayFromServer(
  view: SheetView,
  opts: {
    master?: (set: Record<string, unknown>) => void
    setSpent?: (next: Set<string>) => void
  },
): SheetPlay {
  const slotsUsed = Object.fromEntries(Object.entries(view.spellcasting.spell_slots).map(([c, s]) => [c, s.used]))
  const racialUsed = spentRacial(view.spellcasting.spells_known)
  return {
    slotsUsed,
    racialUsed,
    slotsLocked: !opts.master,
    setSlotsUsed: (fn) => {
      if (!opts.master) return
      const next = fn(slotsUsed)
      const set: Record<string, unknown> = {}
      for (const [c, used] of Object.entries(next)) {
        if (used === slotsUsed[c]) continue
        const pact = view.spellcasting.spell_slots[c]?.pact
        set[pact ? 'slots.pact.used' : `slots.spell.${c}.used`] = Math.max(0, used)
      }
      if (Object.keys(set).length) opts.master(set)
    },
    setRacialUsed: (fn) => opts.setSpent?.(fn(racialUsed)),
  }
}

/** Броски листа: одна история и один «крит на следующий урон» на все карточки */
export interface SheetRoller {
  rolling: boolean
  /** атака, у которой выпала натуральная 20: её следующий урон — критический */
  critFor: string | null
  /** ctx — что за бросок: по нему выбираются преимущество и карточки бонусов */
  rollD20: (label: string, bonus: number, attackKey?: string, ctx?: RollContext) => Promise<number | null>
  rollDamage: (label: string, formula: string, attackKey: string, ctx?: RollContext) => Promise<void>
  rollDice: (label: string, n: number, sides: number, bonus: number) => Promise<number[] | null>
  /** запись в историю без броска (сотворено заклинание, отдых) */
  note: (total: string, label: string) => void
}
