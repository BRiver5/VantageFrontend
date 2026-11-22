/**
 * Названия расы, класса, предыстории и черт по id. В документе v2 их больше
 * нет — только ссылки, поэтому лист подтягивает каталоги (они кэшируются
 * браузером и помещаются в память).
 *
 * Каталоги грузятся в обеих редакциях: герой может собрать расу 2014 и класс
 * 2024, и запись другой редакции не должна превращаться в «—». Запись не из
 * редакции героя подписывается редакцией в скобках: «Три-крин (2014)».
 */
import { useMemo } from 'react'
import type { Background, EditionFields, Feat, GameClass, Race, Subclass, Subrace } from '../api'
import { useCatalogList } from '../create/useCatalog'
import type { Character } from '../types/character'
import type { Names } from './sheetView'

/** Обе редакции одного каталога, без повторов общих записей */
export function useBothEditions<T extends { id: string }>(resource: string, enabled = true): T[] {
  const { items: a } = useCatalogList<T>(resource, enabled, '2014')
  const { items: b } = useCatalogList<T>(resource, enabled, '2024')
  return useMemo(() => {
    const seen = new Set<string>()
    return [...b, ...a].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
  }, [a, b])
}

/** Запись без поля editions — запись 2014 */
const editionsOf = (x: EditionFields | undefined) => (x?.editions?.length ? x.editions : ['2014'])

export function useNames(character: Character | null) {
  const races = useBothEditions<Race>('races')
  const subraces = useBothEditions<Subrace>('subraces', !!character?.subrace_id)
  const backgrounds = useBothEditions<Background>('backgrounds', !!character?.background_id)
  const classes = useBothEditions<GameClass>('classes')
  const subclasses = useBothEditions<Subclass>('subclasses', !!character?.classes.some((c) => c.subclass_id))
  const feats = useBothEditions<Feat>('feats', (character?.feat_ids.length ?? 0) > 0)
  const heroEdition = character?.edition ?? '2014'

  const names = useMemo<Names>(() => {
    const by = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
    const r = by(races)
    const sr = by(subraces)
    const bg = by(backgrounds)
    const cl = by(classes)
    const sc = by(subclasses)
    const ft = by(feats)
    /** «Название (2014)», если записи нет в редакции героя */
    const label = (rec: EditionFields | undefined, name: string | null | undefined) => {
      if (!name) return null
      const eds = editionsOf(rec)
      return eds.includes(heroEdition) ? name : `${name} (${eds.join('/')})`
    }
    return {
      race: (id) => label(r.get(id), r.get(id)?.race_name),
      subrace: (id) => label(sr.get(id), sr.get(id)?.subrace_name),
      background: (id) => label(bg.get(id), bg.get(id)?.background_name),
      cls: (id) => cl.get(id) ?? null,
      subclass: (id) => sc.get(id)?.subclass_name ?? null,
      feat: (id) => ft.get(id)?.feat_name ?? null,
    }
  }, [races, subraces, backgrounds, classes, subclasses, feats, heroEdition])

  return { names, races, classes }
}
