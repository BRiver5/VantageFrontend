/** Пометка записи другой редакции в списках выбора: «2014» */
import { otherEditionOf } from '../editions/edition'

export function OtherEditionTag({ item, className = '' }: { item: unknown; className?: string }) {
  const e = otherEditionOf(item)
  if (!e) return null
  return (
    <span className={`other-ed-tag${className ? ` ${className}` : ''}`} title={`Из редакции ${e}`}>
      {e}
    </span>
  )
}
