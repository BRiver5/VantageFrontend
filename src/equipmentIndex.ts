import { useEffect, useState } from 'react'
import { getEquipmentIndex } from './api'
import type { EquipmentIndex } from './api'

/**
 * Каталог снаряжения с индексом по slug. Гранты ссылаются на предметы только по
 * slug, а деталь открывается по uuid — без индекса не построить ни имя, ни
 * ссылку. Запрос синглтонный, так что второй и последующие вызовы бесплатны.
 */
export function useEquipmentIndex(): EquipmentIndex | null {
  const [index, setIndex] = useState<EquipmentIndex | null>(null)
  useEffect(() => {
    let alive = true
    getEquipmentIndex()
      .then((i) => {
        if (alive) setIndex(i)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return index
}
