/**
 * Портрет героя, кадр лица, фон листа и счётчики, которым на сервере нет
 * поля (вдохновение — там только «есть/нет»), — всё в одной строке `avatar_url`.
 *
 * Сервер хранит у персонажа только ссылку на аватар, поэтому остальное едет
 * во фрагменте этой ссылки: `https://…/art.png#vantage=face:0.5,0.3,0.4,hex;bg:<url>;insp:2`.
 * Фрагмент не уходит на сервер картинки и не мешает её загрузке (и у data:-ссылок
 * тоже), а старые листы без фрагмента читаются как раньше.
 */

/** Рамка портрета в шапке: шестиугольник, круг или картинка целиком без рамки */
export type FaceShape = 'circle' | 'hex' | 'full'

/** Кадр лица: центр (доли ширины и высоты картинки) и ширина кадра (доля ширины) */
export interface FaceCrop {
  cx: number
  cy: number
  r: number
  shape: FaceShape
}

export interface PortraitInfo {
  src: string | null
  face: FaceCrop | null
  background: string | null
  /** сколько вдохновений накоплено (null — фрагмент о нём молчит) */
  inspiration: number | null
}

const MARK = '#vantage='

export const DEFAULT_FACE: FaceCrop = { cx: 0.5, cy: 0.3, r: 0.5, shape: 'hex' }
/** Арт расы — фигура в полный рост: показываем целиком, как в бестиарии */
export const FALLBACK_FACE: FaceCrop = { cx: 0.5, cy: 0.16, r: 0.42, shape: 'full' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function clampFace(f: FaceCrop): FaceCrop {
  return { cx: clamp(f.cx, 0, 1), cy: clamp(f.cy, 0, 1), r: clamp(f.r, 0.06, 1), shape: f.shape }
}

export function parsePortrait(raw: string | null | undefined): PortraitInfo {
  const text = raw?.trim() ?? ''
  const at = text.lastIndexOf(MARK)
  if (at < 0) return { src: text || null, face: null, background: null, inspiration: null }
  const src = text.slice(0, at).trim() || null
  let face: FaceCrop | null = null
  let background: string | null = null
  let inspiration: number | null = null
  for (const part of text.slice(at + MARK.length).split(';')) {
    const sep = part.indexOf(':')
    if (sep < 0) continue
    const key = part.slice(0, sep)
    const value = part.slice(sep + 1)
    if (key === 'face') {
      const [cx, cy, r, shape] = value.split(',')
      const nums = [cx, cy, r].map(Number)
      if (nums.every(Number.isFinite)) {
        face = clampFace({ cx: nums[0], cy: nums[1], r: nums[2], shape: shape === 'circle' || shape === 'full' ? shape : 'hex' })
      }
    } else if (key === 'bg') {
      try {
        background = decodeURIComponent(value) || null
      } catch {
        background = null
      }
    } else if (key === 'insp') {
      const n = parseInt(value, 10)
      inspiration = Number.isNaN(n) ? null : clamp(n, 0, 99)
    }
  }
  return { src, face, background, inspiration }
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function formatPortrait({ src, face, background, inspiration }: PortraitInfo): string | null {
  const parts: string[] = []
  if (src && face) parts.push(`face:${round(face.cx)},${round(face.cy)},${round(face.r)},${face.shape}`)
  if (background) parts.push(`bg:${encodeURIComponent(background)}`)
  if (inspiration) parts.push(`insp:${inspiration}`)
  const base = src?.trim() ?? ''
  if (!parts.length) return base || null
  return `${base}${MARK}${parts.join(';')}`
}
