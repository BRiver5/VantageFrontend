/**
 * Тёмное зрение вида с учётом подрас: у эльфа своего нет, но у всех линий есть
 * (60 у высших и лесных, 120 у дроу) — показываем «60–120 фт.», а не «нет».
 */
import { useEffect, useState } from 'react'
import { fetchAll } from './api'
import type { Subrace } from './api'
import { useEdition } from './editions/useEdition'

export function darkvisionLabel(own: number, subraces: Pick<Subrace, 'darkvision_override'>[]): string | null {
  if (own > 0) return `${own} фт.`
  const vals = [...new Set(subraces.map((s) => s.darkvision_override ?? 0).filter((v) => v > 0))].sort((a, b) => a - b)
  if (!vals.length) return null
  return vals.length === 1 ? `${vals[0]} фт.` : `${vals[0]}–${vals[vals.length - 1]} фт.`
}

/** Подрасы раздела одним запросом на редакцию: вид → его подрасы */
const cache = new Map<string, Promise<Map<string, Subrace[]>>>()

function subracesByRace(edition: string): Promise<Map<string, Subrace[]>> {
  let p = cache.get(edition)
  if (!p) {
    p = fetchAll<Subrace>('subraces', { edition: edition as '2014' | '2024' })
      .then((list) => {
        const out = new Map<string, Subrace[]>()
        for (const s of list) out.set(s.parent_race_id, [...(out.get(s.parent_race_id) ?? []), s])
        return out
      })
      .catch(() => new Map<string, Subrace[]>())
    cache.set(edition, p)
  }
  return p
}

/** Подрасы вида для карточек каталога (без отдельного запроса на каждую карточку) */
export function useRaceSubraces(raceId: string): Subrace[] {
  const { edition } = useEdition('races')
  const [list, setList] = useState<Subrace[]>([])
  useEffect(() => {
    let alive = true
    void subracesByRace(edition).then((m) => alive && setList(m.get(raceId) ?? []))
    return () => {
      alive = false
    }
  }, [raceId, edition])
  return list
}
