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
import type { Edition } from './editions/edition'
import { resourceEdition } from './editions/store'
import { useEdition } from './editions/useEdition'

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

/** по редакции: в 2014 и 2024 одно название ведёт на разные записи */
const cache = new Map<Edition, Promise<Map<string, string>>>()

export function loadSpellIndex(edition: Edition = resourceEdition('spells')): Promise<Map<string, string>> {
  let entry = cache.get(edition)
  if (!entry) {
    entry = fetchAll<Spell>('spells', { edition })
      .then((spells) => {
        const byName = new Map<string, string>()
        for (const s of spells) {
          const key = normSpellName(s.spell_name)
          if (key && !byName.has(key)) byName.set(key, s.id)
        }
        return byName
      })
      .catch(() => {
        cache.delete(edition)
        return new Map<string, string>()
      })
    cache.set(edition, entry)
  }
  return entry
}

export function useSpellIndex(): Map<string, string> {
  const [index, setIndex] = useState<Map<string, string>>(() => new Map())
  const { edition } = useEdition('spells')
  useEffect(() => {
    let alive = true
    loadSpellIndex(edition).then((m) => {
      if (alive) setIndex(m)
    })
    return () => {
      alive = false
    }
  }, [edition])
  return index
}
