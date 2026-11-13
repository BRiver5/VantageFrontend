import { useEffect, useState, type CSSProperties } from 'react'
import type { SheetResource } from '../../types/character'
import { FaceAvatar } from '../FacePortrait'
import { DEFAULT_FACE, type FaceCrop } from '../portrait'
import { Img } from '../../media'

/** Ресурс на дуге: кольцо заряда и число */
export function ResourceOrb({
  r,
  angle,
  active,
  onOpen,
}: {
  r: SheetResource
  angle: number
  active: boolean
  onOpen?: () => void
}) {
  const unlimited = r.max >= 99
  const ratio = unlimited ? 1 : r.max > 0 ? Math.max(0, Math.min(1, r.current / r.max)) : 0
  const len = 2 * Math.PI * 30
  const rad = (angle * Math.PI) / 180
  return (
    <button
      type="button"
      className={`ghud-orb${r.current <= 0 && !unlimited ? ' is-empty' : ''}${active ? ' is-active' : ''}`}
      style={{ '--x': Math.cos(rad).toFixed(3), '--y': Math.sin(rad).toFixed(3) } as CSSProperties}
      onClick={onOpen}
      aria-label={`${r.label}: ${unlimited ? 'без ограничений' : `${r.current} из ${r.max}`}`}
    >
      <span className="ghud-orb-dial">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle className="ghud-orb-track" cx="36" cy="36" r="30" />
          <circle className="ghud-orb-fill" cx="36" cy="36" r="30" style={{ strokeDasharray: len, strokeDashoffset: len * (1 - ratio) }} />
        </svg>
        <b>{unlimited ? '∞' : r.current}</b>
      </span>
      <i>{r.label}</i>
    </button>
  )
}

/** Фигура героя во весь рост; свой портрет с кадром — запасной вариант, если картинка битая */
export function HeroFigure({ src, face, onOpen }: { src: string | null; face: FaceCrop | null; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  return (
    <button type="button" className="ghud-figure" onClick={onOpen} aria-label="Открыть окно героя">
      {src && !broken ? (
        <Img src={src} alt="" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <FaceAvatar src={null} crop={face ?? DEFAULT_FACE} className="ghud-figure-face" />
      )}
    </button>
  )
}
