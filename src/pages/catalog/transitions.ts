import { markPortraitOpenNames } from '../../portraitTransition'

export type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * Ждёт, пока навигация React Router РЕАЛЬНО закоммитит новый маршрут.
 * Нужно для кросс-роутовых переходов (подклассы, heroNav у рас): RR коммитит
 * асинхронно, и без ожидания «новый» кадр VT снимается слишком рано.
 * Для path-inline (классы в одной оболочке) не используется — там flushSync(setState).
 */
export function whenRouteCommitted(committed: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    // ВАЖНО: setTimeout, а не requestAnimationFrame — пока колбэк
    // startViewTransition ждёт промис, rAF заморожен, а таймеры и коммит
    // React-перехода продолжают работать. На rAF тут был бы дедлок.
    const tick = () => {
      if (committed() || performance.now() - t0 > 600) resolve()
      else setTimeout(tick, 16)
    }
    setTimeout(tick, 0)
  })
}

/** Кросс-роутовый морф портрета (расы и т.п., пока не переведены на path-inline). */
export function runHeroMorph(slot: HTMLElement, navigate: () => void): void {
  const doc = document as VTDocument
  if (!doc.startViewTransition) {
    navigate()
    return
  }
  markPortraitOpenNames(slot)
  document.documentElement.dataset.nav = '1'
  const t = doc.startViewTransition(() => {
    navigate()
    return whenRouteCommitted(() => !slot.isConnected)
  })
  const done = () => delete document.documentElement.dataset.nav
  t.finished.then(done, done)
}
