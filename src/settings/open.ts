/** Открыть центр настроек из любого места (боковое меню, профиль) */
export type SettingsTab = 'settings' | 'controls'

export const SETTINGS_OPEN_EVENT = 'vantage-settings-open'

export function openSettings(tab: SettingsTab = 'settings'): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SettingsTab>(SETTINGS_OPEN_EVENT, { detail: tab }))
}
