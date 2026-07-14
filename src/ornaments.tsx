/**
 * Декоративные орнаменты в духе ар-деко / дорогих книжных окладов.
 * Corners/Divider — серебряные (используются в основном контенте);
 * D20Logo в шапке — к20 из ассетов.
 */
import logoUrl from './assets/Logo_vantage.svg'

import { useId, useState, type ReactNode } from 'react'
import { BookOpen } from 'lucide-react'
import { D20LogoImage } from './dice/diceAssets'

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

const SILVER_STOPS = (
  <>
    <stop offset="0%" stopColor="#7c828b" />
    <stop offset="45%" stopColor="#cdd3db" />
    <stop offset="55%" stopColor="#f1f4f8" />
    <stop offset="100%" stopColor="#8b919a" />
  </>
)

const GOLD_STOPS = (
  <>
    <stop offset="0%" stopColor="#8a6a2f" />
    <stop offset="45%" stopColor="#e3c46e" />
    <stop offset="55%" stopColor="#f6e7b6" />
    <stop offset="100%" stopColor="#c49a3c" />
  </>
)

/** Угловой орнамент. Кладётся в углы рамок через .corner--tl/tr/bl/br */
export function Corner({ size = 44, gold = false }: { size?: number; gold?: boolean }) {
  const gradId = useId().replace(/:/g, '')
  const stops = gold ? GOLD_STOPS : SILVER_STOPS

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
        <linearGradient id={gradId} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          {stops}
        </linearGradient>
      </defs>
      <path d="M43 1.5 H10 M1.5 43 V10" stroke={`url(#${gradId})`} strokeWidth="1.6" />
      <path d="M43 8 H16 Q8 8 8 16 V43" stroke={`url(#${gradId})`} strokeWidth="1" />
      <path d="M43 13 H26 M13 43 V26" stroke={`url(#${gradId})`} strokeWidth="0.8" opacity="0.7" />
      <rect x="4.6" y="4.6" width="6" height="6" transform="rotate(45 7.6 7.6)" stroke={`url(#${gradId})`} strokeWidth="1" />
      <circle cx="20" cy="10.5" r="1.4" fill={`url(#${gradId})`} />
      <circle cx="10.5" cy="20" r="1.4" fill={`url(#${gradId})`} />
    </svg>
  )
}

/** Четыре угла сразу — для карточек и рамок */
export function Corners({ size = 44, gold = false }: { size?: number; gold?: boolean }) {
  return (
    <>
      <i className="corner corner--tl"><Corner size={size} gold={gold} /></i>
      <i className="corner corner--tr"><Corner size={size} gold={gold} /></i>
      <i className="corner corner--bl"><Corner size={size} gold={gold} /></i>
      <i className="corner corner--br"><Corner size={size} gold={gold} /></i>
    </>
  )
}

/**
 * Сворачиваемый блок в виде пергаментного свитка:
 * верхний/нижний валик, золотые наконечники, раскрытие по клику.
 */
export function ParchmentScroll({
  children,
  className = '',
  openLabel = 'Читать полностью',
  closeLabel = 'Свернуть свиток',
}: {
  children: ReactNode
  className?: string
  openLabel?: string
  closeLabel?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`parchment-scroll${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <div className="parchment-scroll-assembly">
        <span className="parchment-scroll-rod parchment-scroll-rod--top" aria-hidden="true" />
        <div className="parchment-scroll-paper">
          <div className="parchment-scroll-paper-inner">
            <Corners size={26} />
            <div className="parchment-scroll-text">{children}</div>
          </div>
        </div>
        <span className="parchment-scroll-rod parchment-scroll-rod--bottom" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="parchment-scroll-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? closeLabel : openLabel}
      </button>
    </div>
  )
}

/** Горизонтальный разделитель ар-деко с ромбом по центру */
export function Divider() {
  return (
    <div className="divider" role="presentation">
      <svg viewBox="0 0 600 28" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="dg" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7c828b" stopOpacity="0" />
            <stop offset="20%" stopColor="#a8afba" />
            <stop offset="50%" stopColor="#f1f4f8" />
            <stop offset="80%" stopColor="#a8afba" />
            <stop offset="100%" stopColor="#7c828b" stopOpacity="0" />
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

/** Логотип Vantage в шапке */
export function VantageLogo({ size = 42 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      alt=""
      className="brand-logo"
      width={size}
      height={Math.round(size * (220 / 199))}
      aria-hidden="true"
    />
  )
}

/** @deprecated Используйте VantageLogo */
export function D20Logo({ size = 40 }: { size?: number }) {
  return <D20LogoImage size={size} />
}
