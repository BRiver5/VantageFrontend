import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Ruler,
  Skull,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import knightUrl from '../assets/silhouette.webp'
import { Img } from '../media'
import { KNIGHT_M, SIZES, fmtM, raceHeight } from './height'
import { BoardCard } from './BoardParts'

/**
 * График роста: фигура рядом с рыцарем в 1,75 м, шкала в метрах.
 * `scaleMax` фиксирует масштаб — тогда при смене роста растёт только фигура.
 */
export function HeightChart({
  height,
  image,
  name,
  fallback: Fallback = Skull,
  scaleMax,
}: {
  height: number
  image: string | null
  name: string
  fallback?: LucideIcon
  scaleMax?: number
}) {
  const [broken, setBroken] = useState<string | null>(null)
  const top = Math.max(scaleMax ?? height, height, KNIGHT_M) * 1.15
  const step = [0.25, 0.5, 1, 2, 5].find((s) => top / s <= 6) ?? 5
  const ticks = Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step)
  const pct = (m: number) => `${(m / top) * 100}%`

  return (
    <div className="beast-size-chart">
      {ticks.map((t) => (
        <span key={t} className="beast-size-tick" style={{ bottom: pct(t) }}>
          <i>{fmtM(t)}</i>
        </span>
      ))}
      {/* масштаб задаёт только высота: широкий арт может уйти за край графика */}
      <div className="beast-size-stage">
        <div className="beast-size-figure beast-size-figure--monster" style={{ height: pct(height) }}>
          <span className="beast-size-mark">≈ {fmtM(height)}</span>
          {image && broken !== image ? (
            <Img src={image} alt={name} onError={() => setBroken(image)} />
          ) : (
            <Fallback className="beast-size-fallback" aria-hidden="true" />
          )}
        </div>
        <div className="beast-size-figure beast-size-figure--knight" style={{ height: pct(KNIGHT_M) }}>
          <span className="beast-size-mark beast-size-mark--knight">{fmtM(KNIGHT_M)}</span>
          <span className="beast-size-knight" style={{ '--knight': `url("${knightUrl}")` } as CSSProperties} />
        </div>
      </div>
      <span className="beast-size-ground" />
    </div>
  )
}

export function SizeCard({
  size,
  creatureType,
  image,
  name,
}: {
  size: string | null
  creatureType: string | null
  image: string | null
  name: string
}) {
  const info = SIZES.find((s) => s.key === size?.trim().toLowerCase())
  if (!info) return null

  // рост расы уточняет точку внутри категории, но не выводит из неё:
  // «Средний гном» не ниже 1,2 м, «Маленький человек» (ребёнок) не выше 1,2 м
  const race = raceHeight(creatureType)
  const height = race ? Math.min(info.max, Math.max(info.min, race.m)) : info.m

  return (
    <BoardCard title="Размер" icon={Ruler} className="beast-card--size">
      <HeightChart height={height} image={image} name={name} />
      <p className="beast-size-caption">
        <b>{info.ru}</b>
        <span>
          {race ? `${race.race} — в среднем ${fmtM(race.m)}` : `обычно ${info.range}`} · занимает {info.space}
        </span>
      </p>
    </BoardCard>
  )
}
