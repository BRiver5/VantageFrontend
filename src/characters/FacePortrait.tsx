/**
 * Портрет героя в рамке — шестиугольник, круг или картинка целиком — и выбор
 * кадра лица: по картинке целиком водят рамкой, колесом или ползунком меняют размер.
 *
 * Кадр задан долями картинки, поэтому одинаково ложится в рамку любого размера:
 * картинка растягивается так, чтобы диаметр кадра стал шириной рамки, и
 * сдвигается собственными процентами (translate) — пропорции знать не нужно.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Circle, Hexagon, RectangleVertical, UserRound } from 'lucide-react'
import { clampFace, type FaceCrop, type FaceShape } from './portrait'

export function FaceImage({ src, crop }: { src: string | null; crop: FaceCrop }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (!src || broken) return <UserRound className="cw-face-fallback" aria-hidden="true" />
  if (crop.shape === 'full') {
    return <img className="cw-face-full" src={src} alt="" draggable={false} onError={() => setBroken(true)} />
  }
  return (
    <img
      className="cw-face-img"
      src={src}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
      style={{
        width: `${100 / crop.r}%`,
        transform: `translate(${-crop.cx * 100}%, ${-crop.cy * 100}%)`,
      }}
    />
  )
}

/** Рамка с лицом: золотой обод по форме кадра; «целиком» — картинка без обода */
export function FaceAvatar({
  src,
  crop,
  size,
  className = '',
}: {
  src: string | null
  crop: FaceCrop
  size?: number
  className?: string
}) {
  return (
    <span className={`cw-face cw-face--${crop.shape} ${className}`} style={size ? { width: size } : undefined}>
      <span className="cw-face-in">
        <FaceImage src={src} crop={crop} />
      </span>
    </span>
  )
}

/** Правильный шестиугольник с вершиной вверх: высота = ширина × 2/√3 */
const HEX_ASPECT = 2 / Math.sqrt(3)

/** Контур кадра в единицах SVG поверх картинки (ширина = 100) */
function shapePath(c: FaceCrop, aspect: number): string {
  const x = c.cx * 100
  const y = c.cy * 100 * aspect
  const d = c.r * 100
  const h = d / 2
  if (c.shape === 'circle') return `M${x - h},${y} a${h},${h} 0 1,0 ${d},0 a${h},${h} 0 1,0 ${-d},0 Z`
  const half = (d * HEX_ASPECT) / 2
  const q = half / 2
  return `M${x},${y - half} L${x + h},${y - q} L${x + h},${y + q} L${x},${y + half} L${x - h},${y + q} L${x - h},${y - q} Z`
}

const SHAPES: [FaceShape, string, typeof Hexagon][] = [
  ['hex', 'Шестиугольник', Hexagon],
  ['circle', 'Круг', Circle],
  ['full', 'Целиком', RectangleVertical],
]

export function FaceCropper({
  src,
  crop,
  onChange,
}: {
  src: string
  crop: FaceCrop
  onChange: (next: FaceCrop) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [aspect, setAspect] = useState(1)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const full = crop.shape === 'full'
  // колесо — размер кадра; слушатель не пассивный, чтобы страница не прокручивалась
  const latest = useRef(crop)
  latest.current = crop
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const c = latest.current
      if (c.shape === 'full') return
      e.preventDefault()
      onChange(clampFace({ ...c, r: c.r * (e.deltaY > 0 ? 1.07 : 1 / 1.07) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onChange])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    const box = boxRef.current?.getBoundingClientRect()
    if (!start || !box) return
    onChange(
      clampFace({
        ...crop,
        cx: start.cx + (e.clientX - start.x) / box.width,
        cy: start.cy + (e.clientY - start.y) / box.height,
      }),
    )
  }
  const onUp = () => {
    drag.current = null
  }

  const h = 100 * aspect
  const ring = shapePath(crop, aspect)

  return (
    <div className="cw-crop">
      <div className="cw-crop-stage">
        <div className={`cw-crop-box${full ? ' is-full' : ''}`} ref={boxRef}>
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth) setAspect(img.naturalHeight / img.naturalWidth)
            }}
          />
          {!full && (
            <>
              <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
                <path className="cw-crop-dim" fillRule="evenodd" d={`M0,0 H100 V${h} H0 Z ${ring}`} />
                <path className="cw-crop-ring" d={ring} />
              </svg>
              <div
                className="cw-crop-handle"
                style={{
                  left: `${crop.cx * 100}%`,
                  top: `${crop.cy * 100}%`,
                  width: `${crop.r * 100}%`,
                  aspectRatio: crop.shape === 'hex' ? `1 / ${HEX_ASPECT}` : '1',
                }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                title="Перетащите рамку на лицо; колесо мыши — размер"
              />
            </>
          )}
        </div>
      </div>
      <div className="cw-crop-side">
        <FaceAvatar src={src} crop={crop} size={112} />
        <div className="cw-crop-shapes" role="radiogroup" aria-label="Рамка портрета">
          {SHAPES.map(([shape, label, Icon]) => (
            <button
              key={shape}
              type="button"
              role="radio"
              aria-checked={crop.shape === shape}
              className={`cw-mini-btn${crop.shape === shape ? ' is-on' : ''}`}
              onClick={() => onChange({ ...crop, shape })}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {!full && (
          <label className="cw-field">
            <span>Размер кадра</span>
            <input
              type="range"
              min={0.06}
              max={1}
              step={0.01}
              value={crop.r}
              onChange={(e) => onChange(clampFace({ ...crop, r: Number(e.target.value) }))}
            />
          </label>
        )}
        <p className="cw-field-note">
          {full
            ? 'В шапке листа будет вся картинка, без рамки — как существо в бестиарии.'
            : 'Наведите рамку на лицо — так герой будет выглядеть в шапке листа.'}
        </p>
      </div>
    </div>
  )
}
