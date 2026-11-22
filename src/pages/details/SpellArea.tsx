/** Виджет «Область»: сетка 5 фт с клетками, которые накрывает заклинание */
import { useMemo } from 'react'
import type { Spell } from '../../api'
import { MAX_GRID, areaCaption, areaGrid, spellAreaSpec } from './spellAreaGeometry'

/** ширина рисунка, px: клетка не крупнее 26 px */
const MAX_PX = 300
const MAX_CELL = 26

export function SpellArea({ spell }: { spell: Pick<Spell, 'range' | 'description' | 'mechanics'> }) {
  const spec = useMemo(() => spellAreaSpec(spell), [spell])
  const grid = useMemo(() => areaGrid(spec), [spec])
  const caption = areaCaption(spec)
  const tooBig = Math.max(grid.cols, grid.rows) > MAX_GRID

  const cell = Math.min(MAX_CELL, MAX_PX / Math.max(grid.cols, grid.rows))
  const w = grid.cols * cell
  const h = grid.rows * cell

  return (
    <figure className="spell-area">
      {tooBig ? (
        <p className="spell-area-big">Область больше, чем помещается на сетку.</p>
      ) : (
        <svg className="spell-area-grid" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={caption}>
          {Array.from({ length: grid.rows }, (_, y) =>
            Array.from({ length: grid.cols }, (_, x) => {
              const on = grid.cells.has(`${x},${y}`)
              const caster = grid.caster && grid.caster[0] === x && grid.caster[1] === y
              return (
                <rect
                  key={`${x},${y}`}
                  className={caster ? 'is-caster' : on ? 'is-on' : undefined}
                  x={x * cell + 0.5}
                  y={y * cell + 0.5}
                  width={cell - 1}
                  height={cell - 1}
                />
              )
            }),
          )}
          {grid.caster && (
            <circle className="spell-area-caster" cx={(grid.caster[0] + 0.5) * cell} cy={(grid.caster[1] + 0.5) * cell} r={cell * 0.28} />
          )}
          {grid.point && <circle className="spell-area-point" cx={grid.point[0] * cell} cy={grid.point[1] * cell} r={Math.max(2.5, cell * 0.16)} />}
        </svg>
      )}
      <figcaption>
        <b>{caption}</b>
        <span className="spell-area-legend">
          <i className="is-on" /> область
          {grid.caster && (
            <>
              <i className="is-caster" /> заклинатель
            </>
          )}
          {grid.point && (
            <>
              <i className="is-point" /> точка
            </>
          )}
          <em>клетка — 5 фт</em>
        </span>
      </figcaption>
    </figure>
  )
}
