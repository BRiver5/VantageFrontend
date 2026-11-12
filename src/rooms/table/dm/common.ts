import { useCallback, useEffect, useState } from 'react'
import type { ItemKind } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { errText } from '../parts'

/* ---------- общее ---------- */

export function useList<T>(load: (roomId: string) => Promise<T[]>) {
  const { roomId } = useRoom()
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setItems(await load(roomId))
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [load, roomId])
  useEffect(() => {
    // загрузка при открытии створки: setState идёт после await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])
  return { items, setItems, error, setError, reload }
}

/* ---------- существа ---------- */

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const

export const STAT_KEYS = [
  ['strenght', 'Сил'],
  ['dexterity', 'Лов'],
  ['constitution', 'Тел'],
  ['intelligence', 'Инт'],
  ['wisdom', 'Мдр'],
  ['charisma', 'Хар'],
] as const

/** «Укус. +4 к попаданию…» → { name: «Укус», description: «+4 к попаданию…» }; по строке на приём */
export const traitsOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([^.:]{1,60})[.:]\s*(.*)$/.exec(l)
      return m ? { name: m[1].trim(), description: m[2].trim() } : { name: l, description: '' }
    })

export const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `hb-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/* ---------- добыча ---------- */

export interface Pick {
  source: 'catalog' | 'template'
  kind: ItemKind
  id: string
  name: string
  sub: string
  art: string | null
}
