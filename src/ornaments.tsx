/**
 * Декоративные золотые орнаменты в духе ар-деко / дорогих книжных окладов.
 * Все элементы — чистый SVG со штриховым золотым градиентом.
 */

import { useState } from 'react'
import { BookOpen } from 'lucide-react'

/**
 * Обложка книги с фолбэком: если картинки нет или она не загрузилась (битая
 * ссылка на внешний сервис), вместо сломанной иконки браузера показывает
 * книжную иконку на том же пергаментном фоне. Используется в BookPage и
 * SettingPage — единое поведение для всех обложек и будущих тоже.
 */
export function CoverImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <BookOpen className="cover-fallback" aria-hidden="true" />
  )
}

const GOLD_STOPS = (
  <>
    <stop offset="0%" stopColor="#8a6a2f" />
    <stop offset="45%" stopColor="#e3c46e" />
    <stop offset="55%" stopColor="#f6e7b6" />
    <stop offset="100%" stopColor="#9c7a35" />
  </>
)

/** Угловой орнамент. Кладётся в углы рамок через .corner--tl/tr/bl/br */
export function Corner({ size = 44 }: { size?: number }) {
  return (
    <svg
      className="corner-svg"
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="og" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          {GOLD_STOPS}
        </linearGradient>
      </defs>
      {/* внешняя линия угла */}
      <path d="M43 1.5 H10 M1.5 43 V10" stroke="url(#og)" strokeWidth="1.6" />
      {/* внутренняя линия со ступенькой */}
      <path d="M43 8 H16 Q8 8 8 16 V43" stroke="url(#og)" strokeWidth="1" />
      {/* акцентные штрихи */}
      <path d="M43 13 H26 M13 43 V26" stroke="url(#og)" strokeWidth="0.8" opacity="0.7" />
      {/* ромб на сгибе */}
      <rect x="4.6" y="4.6" width="6" height="6" transform="rotate(45 7.6 7.6)" stroke="url(#og)" strokeWidth="1" />
      <circle cx="20" cy="10.5" r="1.4" fill="url(#og)" />
      <circle cx="10.5" cy="20" r="1.4" fill="url(#og)" />
    </svg>
  )
}

/** Четыре угла сразу — для карточек и рамок */
export function Corners({ size = 44 }: { size?: number }) {
  return (
    <>
      <i className="corner corner--tl"><Corner size={size} /></i>
      <i className="corner corner--tr"><Corner size={size} /></i>
      <i className="corner corner--bl"><Corner size={size} /></i>
      <i className="corner corner--br"><Corner size={size} /></i>
    </>
  )
}

/** Горизонтальный разделитель ар-деко с ромбом по центру */
export function Divider() {
  return (
    <div className="divider" role="presentation">
      <svg viewBox="0 0 600 28" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="dg" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8a6a2f" stopOpacity="0" />
            <stop offset="20%" stopColor="#c49a3c" />
            <stop offset="50%" stopColor="#f6e7b6" />
            <stop offset="80%" stopColor="#c49a3c" />
            <stop offset="100%" stopColor="#8a6a2f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M20 14 H262 M338 14 H580" stroke="url(#dg)" strokeWidth="1.4" />
        <path d="M60 18.5 H240 M360 18.5 H540" stroke="url(#dg)" strokeWidth="0.8" opacity="0.65" />
        <path d="M60 9.5 H240 M360 9.5 H540" stroke="url(#dg)" strokeWidth="0.8" opacity="0.65" />
        {/* центральный ромб-медальон */}
        <rect x="291" y="5" width="18" height="18" transform="rotate(45 300 14)" stroke="url(#dg)" strokeWidth="1.4" fill="none" />
        <rect x="295.5" y="9.5" width="9" height="9" transform="rotate(45 300 14)" fill="url(#dg)" opacity="0.85" />
        <path d="M262 14 l10 -4.5 v9 z M338 14 l-10 -4.5 v9 z" fill="url(#dg)" />
        <circle cx="20" cy="14" r="2" fill="url(#dg)" />
        <circle cx="580" cy="14" r="2" fill="url(#dg)" />
      </svg>
    </div>
  )
}

/** Малый гексагональный медальон-эмблема (логотип) */
export function HexEmblem({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          {GOLD_STOPS}
        </linearGradient>
      </defs>
      <path d="M24 2 L43 13 V35 L24 46 L5 35 V13 Z" stroke="url(#eg)" strokeWidth="2" />
      <path d="M24 8 L38 16 V32 L24 40 L10 32 V16 Z" stroke="url(#eg)" strokeWidth="1" opacity="0.8" />
      <path d="M24 15 L31.5 19.5 V28.5 L24 33 L16.5 28.5 V19.5 Z" fill="url(#eg)" />
      <circle cx="24" cy="24" r="2.2" fill="#1a1626" />
    </svg>
  )
}
