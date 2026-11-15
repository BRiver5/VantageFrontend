/**
 * Окно настроек для всего приложения: открывается openSettings() из бокового
 * меню, профиля и т. п. В комнате шапка открывает своё окно — с блоком комнаты.
 */
import { useEffect, useState } from 'react'
import { SettingsDialog } from './SettingsDialog'
import { SETTINGS_OPEN_EVENT, type SettingsTab } from './open'
import { SettingsSync } from './SettingsSync'

export function SettingsHost() {
  const [tab, setTab] = useState<SettingsTab | null>(null)
  useEffect(() => {
    const onOpen = (e: Event) => setTab((e as CustomEvent<SettingsTab>).detail ?? 'settings')
    window.addEventListener(SETTINGS_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(SETTINGS_OPEN_EVENT, onOpen)
  }, [])
  return (
    <>
      <SettingsSync />
      {tab && <SettingsDialog key={tab} initialTab={tab} onClose={() => setTab(null)} />}
    </>
  )
}
