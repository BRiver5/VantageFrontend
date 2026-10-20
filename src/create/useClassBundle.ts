/**
 * Загрузка данных класса для визарда: полный объект, его подклассы и умения по
 * уровням. Умения парсятся из той же разметки dnd.su, что на странице класса
 * (см. multiclass.tsx — там такой же набор запросов).
 */
import { useEffect, useMemo, useState } from 'react'
import { getOne, getSubList } from '../api'
import type { GameClass, Subclass } from '../api'
import {
  isHtmlDescription,
  parseFeatureEntries,
  resolveSubclassSectionHtml,
  type FeatureEntry,
} from '../classArticle'

export interface ClassBundle {
  cls: GameClass
  subs: Subclass[]
  features: FeatureEntry[]
}

/** Полные данные выбранного класса; null, пока класс не выбран или грузится */
export function useClassBundle(classId: string | null): {
  bundle: ClassBundle | null
  loading: boolean
} {
  const [bundle, setBundle] = useState<ClassBundle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!classId) {
      setBundle(null)
      return
    }
    let alive = true
    setLoading(true)
    Promise.all([
      getOne<GameClass>('classes', classId),
      getSubList<Subclass>('classes', classId, 'subclasses'),
    ])
      .then(([cls, subs]) => {
        if (!alive) return
        const features =
          cls.description && isHtmlDescription(cls.description)
            ? parseFeatureEntries(cls.description)
            : []
        setBundle({ cls, subs, features })
      })
      .catch(() => {
        if (alive) setBundle(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [classId])

  return { bundle, loading }
}

/**
 * Умения выбранного подкласса по уровням. Описание подкласса часто живёт
 * секцией внутри статьи класса, поэтому резолвим его так же, как детальная
 * страница подкласса.
 */
export function useSubclassFeatures(
  bundle: ClassBundle | null,
  subclassId: string | null,
): FeatureEntry[] {
  return useMemo(() => {
    if (!bundle || !subclassId) return []
    const sub = bundle.subs.find((s) => s.id === subclassId)
    if (!sub) return []
    const html = resolveSubclassSectionHtml(sub.description, sub.subclass_name, bundle.cls.description)
    return html ? parseFeatureEntries(html) : []
  }, [bundle, subclassId])
}

/** Умения, которые класс получает ровно на этом уровне */
export function featuresAtLevel(features: FeatureEntry[], level: number): FeatureEntry[] {
  return features.filter((f) => f.level === level)
}
