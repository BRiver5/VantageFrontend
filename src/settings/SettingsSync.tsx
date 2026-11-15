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

  useEffect(() => {
    if (!userId) return
    hydrateUserSettings(reduce === undefined && photo === undefined ? null : { reduce_motion: reduce, photosensitive: photo })
  }, [userId, reduce, photo])

  useEffect(() => {
    if (!userId) return
    setUserSettingsSyncer((patch) => updateMe({ preferences: { interface: patch } }))
    return () => setUserSettingsSyncer(null)
  }, [userId, updateMe])

  return null
}
