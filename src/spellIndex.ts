/**
 * Индекс заклинаний: нормализованное русское название → id заклинания в нашей
 * базе. Нужен, чтобы ссылки на заклинания из HTML dnd.su (в описаниях классов,
 * подклассов и таблицах «какое заклинание на каком уровне») вели на страницу
 * конкретного заклинания у нас.
 *
 * Грузится один раз и кэшируется на уровне модуля (как термины).
 */
import { useEffect, useState } from 'react'
import { fetchAll } from './api'
import type { Spell } from './api'

/** Название к общему виду: строчные, без [english], без пунктуации, ё→е. */
export function normSpellName(name: string): string {
  return name
    .toLocaleLowerCase('ru')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

let cache: Promise<Map<string, string>> | null = null

export function loadSpellIndex(): Promise<Map<string, string>> {
  if (!cache) {
    cache = fetchAll<Spell>('spells')
      .then((spells) => {
        const byName = new Map<string, string>()
        for (const s of spells) {
          const key = normSpellName(s.spell_name)
          if (key && !byName.has(key)) byName.set(key, s.id)
        }
        return byName
      })
      .catch(() => new Map<string, string>())
  }
  return cache
}

export function useSpellIndex(): Map<string, string> {
  const [index, setIndex] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    let alive = true
    loadSpellIndex().then((m) => {
      if (alive) setIndex(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return index
}
