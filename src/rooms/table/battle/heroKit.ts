import { useEffect, useState } from 'react'
import { getCharacter, getSheet, roomCharacterRef, type Character } from '../../../api'
import type { AttackEntry, GrantedSpell, NaturalAttack, SheetSlot, SpellKnown } from '../../../types/character'
import type { StatKey } from '../../../types/rooms'
import { useRoomEvents } from '../../RoomProvider'
import { type CasterHints } from '../actionPresets'

/* ---------- панель команды ---------- */

export type Cmd = 'attack' | 'spell' | 'other'

export const ABILITIES: { key: StatKey; label: string }[] = [
  { key: 'str', label: 'Сила' },
  { key: 'dex', label: 'Ловкость' },
  { key: 'con', label: 'Телосл.' },
  { key: 'int', label: 'Интеллект' },
  { key: 'wis', label: 'Мудрость' },
  { key: 'cha', label: 'Харизма' },
]

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

/** Метка своего приёма в листе: по ней его можно убрать прямо из боя */
export const CUSTOM_TAG = 'свой приём'

export type SlotPick = { level: number; pool: 'spell' | 'pact' }

/** Лист героя для боя: оружие, заклинания, ячейки и магические числа */
export interface HeroKit {
  doc: Character | null
  slots: SheetSlot[]
  /** природные атаки и дарованные заклинания: их выдаёт вычисленный лист, как и в листе героя */
  natural: AttackEntry[]
  granted: SpellKnown[]
  hints: CasterHints & { dc?: number }
  setDoc: (c: Character) => void
}

export function useHeroKit(roomId: string, heroId: string | null | undefined, level: number): HeroKit {
  const [doc, setDoc] = useState<Character | null>(null)
  const [slots, setSlots] = useState<SheetSlot[]>([])
  const [natural, setNatural] = useState<AttackEntry[]>([])
  const [granted, setGranted] = useState<SpellKnown[]>([])
  const [hints, setHints] = useState<CasterHints & { dc?: number }>({ level })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setDoc(null)
    setSlots([])
  }, [heroId])
  useEffect(() => {
    if (!heroId) return
    let alive = true
    const ref = roomCharacterRef(roomId, heroId)
    Promise.all([getSheet(ref), getCharacter(ref)])
      .then(([s, d]) => {
        if (!alive) return
        const val = (re: RegExp) => Object.entries(s.values).find(([k, v]) => re.test(k) && typeof v === 'number')?.[1] as number | undefined
        const attack = val(/^char\.class\.[^.]+\.spell_attack$/)
        const pb = val(/^char\.pb$/) ?? 2
        setHints({ dc: val(/^char\.class\.[^.]+\.spell_dc$/), attack, mod: attack != null ? attack - pb : undefined, level })
        setSlots(s.slots ?? [])
        const mod = (ab?: string) => Number(s.values[`char.abilities.${ab ?? 'str'}.mod`] ?? 0) || 0
        const nat = ((s.values['char.attacks.natural'] as NaturalAttack[] | undefined) ?? []).filter((a) => a?.name)
        setNatural(
          nat.map((a) => {
            const m = mod(a.ability)
            return { name: a.name, type: 'melee', attack_bonus: m + pb, damage: a.dice ? `${a.dice}${m ? (m > 0 ? `+${m}` : `${m}`) : ''}` : String(Math.max(1, 1 + m)), damage_type: a.type ?? '', range: '', properties: [] }
          }),
        )
        const own = new Set((d.spells ?? []).map((sp) => sp.name.toLocaleLowerCase('ru')))
        const gr = ((s.values['char.spells.granted'] as GrantedSpell[] | undefined) ?? []).filter((g) => g?.name && !own.has(g.name.toLocaleLowerCase('ru')))
        setGranted(gr.map((g) => ({ name: g.name, level: typeof g.level === 'number' ? g.level : -1, prepared: true, spell_source: null, snapshot: { granted: 'engine', uses: g.uses ?? null } })))
        setDoc(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId, heroId, level, tick])
  // ячейки тратит сервер: после действия и правки листа перечитываем
  useRoomEvents((msg) => {
    if (!heroId) return
    const p = msg.payload as { character_id?: string; card?: { id?: string } }
    if (msg.type === 'combat.action' || ((msg.type === 'character.sheet_changed' || msg.type === 'character.updated') && (p.character_id ?? p.card?.id) === heroId)) {
      setTick((t) => t + 1)
    }
  })
  return { doc, slots, natural, granted, hints, setDoc }
}

/** Подходящая ячейка для круга заклинания: наименьшая свободная не ниже него */
export function slotFor(level: number, slots: SheetSlot[]): SlotPick | null {
  const free = slots.filter((s) => s.current > 0 && s.level >= level).sort((a, b) => a.level - b.level || Number(a.pool === 'spell') - Number(b.pool === 'spell'))
  return free[0] ? { level: free[0].level, pool: free[0].pool } : null
}
