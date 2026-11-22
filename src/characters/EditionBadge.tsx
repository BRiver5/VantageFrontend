/** Маленький значок редакции правил персонажа: «2014» / «2024» */
import type { CharacterEdition } from '../types/character'

/** У старых документов поля нет — это 2014 */
export function EditionBadge({ edition, className = '' }: { edition: CharacterEdition | undefined; className?: string }) {
  const ed: CharacterEdition = edition === '2024' ? '2024' : '2014'
  return (
    <span className={`ed-badge ed-badge--${ed}${className ? ` ${className}` : ''}`} title={`Правила ${ed} года`}>
      {ed}
    </span>
  )
}
