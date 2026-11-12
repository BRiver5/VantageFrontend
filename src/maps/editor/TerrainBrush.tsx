/** Кисть рельефа */
import type { Brush } from './types'

export function TerrainBrush({ brush, setBrush }: { brush: Brush; setBrush: (b: Brush) => void }) {
  return (
    <div className="me-brush" role="radiogroup" aria-label="Кисть рельефа">
      {(
        [
          ['up', '+5 фт'],
          ['down', '−5 фт'],
          ['difficult', 'сложная'],
          ['water', 'вода'],
          ['climbable', 'можно лезть'],
        ] as [Brush, string][]
      ).map(([b, l]) => (
        <button key={b} type="button" role="radio" aria-checked={brush === b} className={brush === b ? 'is-on' : ''} onClick={() => setBrush(b)}>
          {l}
        </button>
      ))}
    </div>
  )
}
