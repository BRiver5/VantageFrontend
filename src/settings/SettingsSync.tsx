/**
 * Мост настроек профиля к серверу: пришёл профиль — взять его
 * preferences.interface; вошёл человек — отправлять изменения через PATCH /auth/me.
 */
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { hydrateUserSettings, setUserSettingsSyncer } from './settings'

export function SettingsSync() {
  const { user, updateMe } = useAuth()
  const userId = user?.id ?? null
  const iface = user?.preferences?.interface
  const reduce = iface?.reduce_motion
  const photo = iface?.photosensitive
  const edition = iface?.edition
  // объект приходит новым на каждый ответ — сравниваем по содержимому
  const sections = iface?.edition_sections ? JSON.stringify(iface.edition_sections) : undefined

  useEffect(() => {
    if (!userId) return
    hydrateUserSettings(
      reduce === undefined && photo === undefined && edition === undefined && sections === undefined
        ? null
        : { reduce_motion: reduce, photosensitive: photo, edition, edition_sections: sections ? JSON.parse(sections) : undefined },
    )
  }, [userId, reduce, photo, edition, sections])

  useEffect(() => {
    if (!userId) return
    setUserSettingsSyncer((patch) => updateMe({ preferences: { interface: patch } }))
    return () => setUserSettingsSyncer(null)
  }, [userId, updateMe])

  return null
}
