/**
 * Названия расы, класса, предыстории и черт по id. В документе v2 их больше
 * нет — только ссылки, поэтому лист подтягивает каталоги (они кэшируются
 * браузером и помещаются в память).
 */
import { useMemo } from 'react'
import type { Background, Feat, GameClass, Race, Subclass, Subrace } from '../api'
import { useCatalogList } from '../create/useCatalog'
import type { Character } from '../types/character'
import type { Names } from './sheetView'

export function useNames(character: Character | null) {
  const { items: races } = useCatalogList<Race>('races')
  const { items: subraces } = useCatalogList<Subrace>('subraces', !!character?.subrace_id)
  const { items: backgrounds } = useCatalogList<Background>('backgrounds', !!character?.background_id)
  const { items: classes } = useCatalogList<GameClass>('classes')
  const { items: subclasses } = useCatalogList<Subclass>('subclasses', !!character?.classes.some((c) => c.subclass_id))
  const { items: feats } = useCatalogList<Feat>('feats', (character?.feat_ids.length ?? 0) > 0)

  const names = useMemo<Names>(() => {
    const by = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
    const r = by(races)
    const sr = by(subraces)
    const bg = by(backgrounds)
    const cl = by(classes)
    const sc = by(subclasses)
    const ft = by(feats)
    return {
      race: (id) => r.get(id)?.race_name ?? null,
      subrace: (id) => sr.get(id)?.subrace_name ?? null,
      background: (id) => bg.get(id)?.background_name ?? null,
      cls: (id) => cl.get(id) ?? null,
      subclass: (id) => sc.get(id)?.subclass_name ?? null,
      feat: (id) => ft.get(id)?.feat_name ?? null,
    }
  }, [races, subraces, backgrounds, classes, subclasses, feats])

  return { names, races, classes }
}
