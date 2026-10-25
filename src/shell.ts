/**
 * Мобильная оболочка: узкий экран или низкий ландшафт телефона.
 * Ширина ландшафта часто 800–930px — одного max-width мало.
 */
import { useLayoutEffect, useState } from 'react'

export const APP_SHELL_QUERY = '(max-width: 900px), (orientation: landscape) and (max-height: 520px)'
export const HUD_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 520px)'

export type HudLayout = 'desk' | 'portrait' | 'landscape'

function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

function writeShell(app: boolean) {
  document.documentElement.dataset.shell = app ? 'app' : 'desk'
}

export function useAppShell(): { app: boolean; landscape: boolean; hud: HudLayout } {
  const [app, setApp] = useState(() => matches(APP_SHELL_QUERY))
  const [landscape, setLandscape] = useState(() => matches(HUD_LANDSCAPE_QUERY))

  useLayoutEffect(() => {
    const shellMq = window.matchMedia(APP_SHELL_QUERY)
    const landMq = window.matchMedia(HUD_LANDSCAPE_QUERY)
    const sync = () => {
      const nextApp = shellMq.matches
      const nextLand = landMq.matches
      setApp(nextApp)
      setLandscape(nextLand)
      writeShell(nextApp)
    }
    sync()
    shellMq.addEventListener('change', sync)
    landMq.addEventListener('change', sync)
    return () => {
      shellMq.removeEventListener('change', sync)
      landMq.removeEventListener('change', sync)
    }
  }, [])

  return { app, landscape, hud: app ? (landscape ? 'landscape' : 'portrait') : 'desk' }
}
