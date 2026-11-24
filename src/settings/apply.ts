/**
 * Применить настройки к документу: масштаб шрифта (--ui-font-scale) и
 * признаки на <html> для CSS — data-reduce-motion, data-performance, data-photosensitive.
 * Вызывается один раз при старте и дальше следит за изменениями.
 */
import { getDeviceSettings } from './settings'
import { isPerformanceMode, isPhotosensitive, prefersReducedMotion, subscribeMotion } from './motion'

function toggle(el: HTMLElement, name: string, on: boolean) {
  if (on) el.setAttribute(name, '')
  else el.removeAttribute(name)
}

export function applySettingsToDocument(root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (!root) return
  root.style.setProperty('--ui-font-scale', String(getDeviceSettings().fontScale))
  toggle(root, 'data-reduce-motion', prefersReducedMotion())
  toggle(root, 'data-performance', isPerformanceMode())
  // щадящий режим: без вспышек и мигания на всём сайте (CSS — components/settings.css)
  toggle(root, 'data-photosensitive', isPhotosensitive())
}

let installed = false

export function installSettings(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  applySettingsToDocument()
  subscribeMotion(() => applySettingsToDocument())
}
