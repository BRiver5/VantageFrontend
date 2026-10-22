/** Состояние листа «до отдыха»: потраченные ячейки и расовая магия */
import type { CharacterCreate } from '../types/character'

export type SheetPatch = (fn: (c: CharacterCreate) => CharacterCreate) => void

/** Потраченные ячейки по кругам и расовые заклинания, использованные до отдыха */
export interface SheetPlay {
  slotsUsed: Record<string, number>
  setSlotsUsed: (fn: (prev: Record<string, number>) => Record<string, number>) => void
  racialUsed: Set<string>
  setRacialUsed: (fn: (prev: Set<string>) => Set<string>) => void
}

/** Состояние «до отдыха» внутри самого листа: ячейки — в spell_slots.used, расовые — в snapshot.spent */
export function sheetPlayFromCharacter(sheet: CharacterCreate, patch: SheetPatch): SheetPlay {
  const slotsUsed = Object.fromEntries(
    Object.entries(sheet.spellcasting.spell_slots).map(([c, s]) => [c, s.used ?? 0]),
  )
  const racialUsed = new Set(
    sheet.spellcasting.spells_known
      .filter((sp) => (sp.snapshot as { spent?: boolean } | null)?.spent)
      .map((sp) => sp.name),
  )
  return {
    slotsUsed,
    racialUsed,
    setSlotsUsed: (fn) =>
      patch((c) => {
        const used = fn(
          Object.fromEntries(Object.entries(c.spellcasting.spell_slots).map(([k, s]) => [k, s.used ?? 0])),
        )
        const spell_slots = Object.fromEntries(
          Object.entries(c.spellcasting.spell_slots).map(([k, s]) => [k, { ...s, used: used[k] ?? 0 }]),
        )
        return { ...c, spellcasting: { ...c.spellcasting, spell_slots } }
      }),
    setRacialUsed: (fn) =>
      patch((c) => {
        const prev = new Set(
          c.spellcasting.spells_known
            .filter((sp) => (sp.snapshot as { spent?: boolean } | null)?.spent)
            .map((sp) => sp.name),
        )
        const next = fn(prev)
        const spells_known = c.spellcasting.spells_known.map((sp) => {
          const spent = next.has(sp.name)
          const snap = (sp.snapshot ?? {}) as Record<string, unknown>
          if (!!snap.spent === spent) return sp
          return { ...sp, snapshot: { ...snap, spent } }
        })
        return { ...c, spellcasting: { ...c.spellcasting, spells_known } }
      }),
  }
}


/** Броски листа: одна история и один «крит на следующий урон» на все карточки */
export interface SheetRoller {
  rolling: boolean
  /** атака, у которой выпала натуральная 20: её следующий урон — критический */
  critFor: string | null
  rollD20: (label: string, bonus: number, attackKey?: string) => Promise<number | null>
  rollDamage: (label: string, formula: string, attackKey: string) => Promise<void>
  rollDice: (label: string, n: number, sides: number, bonus: number) => Promise<number[] | null>
  /** запись в историю без броска (сотворено заклинание, отдых) */
  note: (total: string, label: string) => void
}
