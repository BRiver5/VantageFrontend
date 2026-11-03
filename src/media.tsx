/**
 * Картинки нужного размера. У каждой картинки нашего хранилища (`/media/…`) есть
 * три копии: исходник, `.medium.webp` (600 px) и `.low.webp` (200 px). `<Img>`
 * меряет, сколько места картинка реально занимает на экране (с учётом плотности
 * пикселей), и до первой отрисовки ставит самую лёгкую подходящую копию: иконка
 * в 30 px не тянет исходник 1000×1000.
 *
 * Выросла картинка (окно растянули, карточку раскрыли) — подменяется копией
 * побольше; уменьшилась — остаётся прежняя, второй раз качать незачем. Не
 * загрузилась уменьшенная копия — берётся исходник. Чужие ссылки, data:/blob: и
 * файлы из бандла не трогаются.
 */
import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type Ref } from 'react'

export type Quality = 'low' | 'medium' | 'high'

const RANK: Record<Quality, number> = { low: 0, medium: 1, high: 2 }
/** Ширина копий в пикселях; запас 10 %, чтобы не брать соседнюю копию из-за пары пикселей */
const LOW_PX = 220
const MEDIUM_PX = 660

const OWN = /\/media\/[^?#]+\.(png|jpe?g|gif|webp)$/i
const VARIANT = /\.(medium|low)\.webp$/i

/** Есть ли у ссылки уменьшенные копии */
export const hasVariants = (url: string | null | undefined): url is string => !!url && OWN.test(url) && !VARIANT.test(url)

/** Ссылка на копию нужного качества; без копий — ссылка как есть */
export function mediaUrl(url: string, quality: Quality): string {
  return quality === 'high' || !hasVariants(url) ? url : `${url}.${quality}.webp`
}

/** Какая копия нужна под столько CSS-пикселей */
export function qualityFor(cssPx: number): Quality {
  const px = cssPx * (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
  return px <= LOW_PX ? 'low' : px <= MEDIUM_PX ? 'medium' : 'high'
}

/**
 * Для фоновых картинок (`background-image`), где измерить нечего: примерная
 * ширина в CSS-пикселях. По умолчанию — во всю ширину окна.
 */
export function bgUrl(url: string | null | undefined, cssPx?: number): string | null {
  if (!url) return null
  const width = cssPx ?? (typeof window === 'undefined' ? 1200 : window.innerWidth)
  return mediaUrl(url, qualityFor(width))
}

type ImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  ref?: Ref<HTMLImageElement>
  /** если размер заранее известен (CSS-пиксели по большей стороне), измерять не нужно */
  sizeHint?: number
}

/** Замена `<img>`: сама выбирает копию по размеру на экране */
export function Img({ src, sizeHint, onError, ref, ...rest }: ImgProps) {
  const own = typeof src === 'string' && hasVariants(src)
  const el = useRef<HTMLImageElement | null>(null)
  const [quality, setQuality] = useState<Quality | null>(() => (own && sizeHint ? qualityFor(sizeHint) : null))
  const [failed, setFailed] = useState(false)

  useLayoutEffect(() => {
    const node = el.current
    if (!own || !node || failed) return
    const pick = () => {
      // размер по раскладке, без трансформаций: карточка, вылетающая с масштаба 0.3,
      // иначе получила бы крошечную копию и так с ней и осталась
      const side = Math.max(node.offsetWidth, node.offsetHeight)
      // размер задаёт сама картинка (нет CSS-размеров) — средняя копия как разумная середина
      const next = side > 2 ? qualityFor(side) : 'medium'
      setQuality((cur) => (cur && RANK[cur] >= RANK[next] ? cur : next))
    }
    pick()
    const ro = new ResizeObserver(pick)
    ro.observe(node)
    return () => ro.disconnect()
  }, [own, src, failed])

  // новая картинка — заново решаем, какую копию брать
  const [seen, setSeen] = useState(src)
  if (seen !== src) {
    setSeen(src)
    setFailed(false)
    setQuality(own && sizeHint ? qualityFor(sizeHint) : null)
  }

  const setRef = (node: HTMLImageElement | null) => {
    el.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as { current: HTMLImageElement | null }).current = node
  }

  // пока не измерили, src не ставим: иначе браузер успеет начать качать исходник
  const shown = !own || failed ? src : quality ? mediaUrl(src as string, quality) : undefined

  return (
    <img
      {...rest}
      ref={setRef}
      src={shown}
      onError={(e) => {
        if (own && !failed && quality !== 'high') {
          setFailed(true)
          return
        }
        onError?.(e)
      }}
    />
  )
}
