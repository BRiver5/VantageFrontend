/** Дорога уровней: золото заливает линию до последнего принятого */
import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import type { LevelChoice } from '../../draft'

type Props = {
  levels: LevelChoice[]
  level: number
  doneCount: number
  nextPending: number
  setCursor: (i: number) => void
}

export function LevelRoad({ levels, level, doneCount, nextPending, setCursor }: Props) {
  return (
    <nav
      className="cw-climb"
      aria-label="Уровни"
      style={
        {
          '--n': levels.length,
          '--fill': `${levels.length > 1 ? (Math.min(doneCount, levels.length - 1) / (levels.length - 1)) * 100 : 0}%`,
        } as CSSProperties
      }
    >
      {levels.length > 1 && <span className="cw-climb-line" aria-hidden="true" />}
      {levels.map((l, i) => (
        <button
          key={l.level}
          type="button"
          className={`cw-climb-node${l.level === level ? ' is-active' : ''}${l.done ? ' is-done' : ''}`}
          onClick={() => setCursor(i)}
          // вперёд через непройденные уровни не прыгаем — иначе порядок наград рассыплется
          disabled={!l.done && nextPending !== -1 && i > nextPending}
          title={`${l.level} уровень`}
        >
          <span className="cw-climb-hex">{l.done ? <Check aria-hidden="true" /> : l.level}</span>
        </button>
      ))}
    </nav>
  )
}
