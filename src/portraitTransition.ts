import { flushSync } from 'react-dom'

/** Сразу в начало, без плавной прокрутки html (scroll-behavior: smooth) */
export const jumpToTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
}

type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * Простой переход оболочки каталог ⇄ деталь (fade + лёгкий подъём).
 * Без shared-element морфа и разлёта карточек.
 */
export function runShellTransition(
  apply: () => void,
  opts: { scrollTop?: boolean } = {},
): void {
  const doc = document as VTDocument
  if (!doc.startViewTransition) {
    apply()
    if (opts.scrollTop) jumpToTop()
    return
  }
  document.documentElement.dataset.nav = '1'
  const t = doc.startViewTransition(() => {
    flushSync(apply)
    // старый кадр уже снят: прыгаем наверх до снимка нового — деталь сразу открыта с начала
    if (opts.scrollTop) jumpToTop()
  })
  const done = () => {
    delete document.documentElement.dataset.nav
  }
  t.finished.then(done, done)
}

/** Имена для кросс-роутового heroNav (расы) — пока отдельный путь. */
export const PORTRAIT_HERO = {
  img: 'class-hero-img',
  title: 'class-hero-title',
  die: 'class-hero-die',
} as const

export function markPortraitOpenNames(slot: HTMLElement): void {
  const grid = slot.closest('.card-grid')
  const cx = window.innerWidth / 2
  let li = 0
  let ri = 0
  grid?.querySelectorAll<HTMLElement>('.card-slot').forEach((s) => {
    if (s === slot) {
      const img = s.querySelector<HTMLElement>('.class-card-portrait img')
      const nm = s.querySelector<HTMLElement>('.class-card-name-plate')
      const die = s.querySelector<HTMLElement>('.class-card-die')
      if (img) img.style.viewTransitionName = PORTRAIT_HERO.img
      if (nm) nm.style.viewTransitionName = PORTRAIT_HERO.title
      if (die) die.style.viewTransitionName = PORTRAIT_HERO.die
    } else {
      const r = s.getBoundingClientRect()
      const left = r.left + r.width / 2 < cx
      const n = left ? li++ : ri++
      if (n < 16) s.style.viewTransitionName = `fly-${left ? 'l' : 'r'}-${n}`
    }
  })
}
