/**
 * Журнал хитов: урон, лечение, временные хиты, кости хитов, отдых — с тем,
 * сколько было и сколько стало. Серверу журнал не нужен, поэтому он живёт в
 * браузере (localStorage) по id персонажа; без id (итог визарда) — только в памяти.
 */
import { useCallback, useEffect, useState } from 'react'

export type HpLogKind = 'dmg' | 'heal' | 'temp' | 'hd' | 'rest' | 'death'

export interface HpLogEntry {
  id: number
  /** время записи, мс */
  at: number
  kind: HpLogKind
  amount: number
  from: number
  to: number
  /** уточнение: «врем. поглотили 5», «к10 +2» */
  note?: string
}

export interface HpLog {
  entries: HpLogEntry[]
  push: (entry: Omit<HpLogEntry, 'id' | 'at'>) => void
  clear: () => void
}

const LIMIT = 60
const storageKey = (key: string) => `vantage-hp-log:${key}`

function read(key: string | null): HpLogEntry[] {
  if (!key) return []
  try {
    const raw = localStorage.getItem(storageKey(key))
    const list = raw ? (JSON.parse(raw) as HpLogEntry[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function useHpLog(key: string | null): HpLog {
  const [log, setLog] = useState(() => ({ key, entries: read(key) }))
  // другой персонаж — свой журнал
  const entries = log.key === key ? log.entries : read(key)

  useEffect(() => {
    if (!key || log.key !== key) return
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(log.entries))
    } catch {
      /* переполненное или закрытое хранилище — журнал останется в памяти */
    }
  }, [key, log])

  const push = useCallback(
    (entry: Omit<HpLogEntry, 'id' | 'at'>) =>
      setLog((prev) => {
        const base = prev.key === key ? prev.entries : read(key)
        const next = [{ ...entry, id: (base[0]?.id ?? 0) + 1, at: Date.now() }, ...base].slice(0, LIMIT)
        return { key, entries: next }
      }),
    [key],
  )
  const clear = useCallback(() => setLog({ key, entries: [] }), [key])

  return { entries, push, clear }
}
