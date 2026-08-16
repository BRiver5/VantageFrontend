import { useEffect, useState, type FormEvent } from 'react'
import {
  DEFAULT_DICE_PREFERENCES,
  type CharacterVisibility,
  type Locale,
} from '../api'
import { useAuth } from '../auth/AuthContext'

export default function ProfilePage() {
  const { user, updateMe, logout } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [locale, setLocale] = useState<Locale>('ru')
  const [visibility, setVisibility] = useState<CharacterVisibility>('private')
  const [bodyColor, setBodyColor] = useState(DEFAULT_DICE_PREFERENCES.body_color)
  const [accentColor, setAccentColor] = useState(DEFAULT_DICE_PREFERENCES.accent_color)
  const [numberColor, setNumberColor] = useState(DEFAULT_DICE_PREFERENCES.number_color)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    setDisplayName(user.display_name ?? '')
    setBio(user.bio ?? '')
    setAvatarUrl(user.avatar_url ?? '')
    setLocale(user.preferences?.locale ?? 'ru')
    setVisibility(user.preferences?.default_character_visibility ?? 'private')
    setBodyColor(user.preferences?.dice?.body_color ?? DEFAULT_DICE_PREFERENCES.body_color)
    setAccentColor(user.preferences?.dice?.accent_color ?? DEFAULT_DICE_PREFERENCES.accent_color)
    setNumberColor(user.preferences?.dice?.number_color ?? DEFAULT_DICE_PREFERENCES.number_color)
  }, [user])

  if (!user) return null

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await updateMe({
        display_name: displayName.trim(),
        bio,
        avatar_url: avatarUrl.trim() || null,
        preferences: {
          locale,
          default_character_visibility: visibility,
          dice: {
            body_color: bodyColor,
            accent_color: accentColor,
            number_color: numberColor,
          },
        },
      })
      setStatus('Сохранено')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-page auth-page--wide">
      <div className="auth-card">
        <div className="auth-card-head">
          <div>
            <h1 className="section-title gold-text">Профиль</h1>
            <p className="auth-lead">
              @{user.nickname} · {user.email}
            </p>
          </div>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={logout}>
            Выйти
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>Отображаемое имя</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label className="auth-field">
            <span>Аватар (URL)</span>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="auth-field">
            <span>О себе</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
          </label>

          <fieldset className="auth-fieldset">
            <legend>Настройки</legend>
            <label className="auth-field">
              <span>Язык</span>
              <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="auth-field">
              <span>Видимость новых персонажей</span>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as CharacterVisibility)}
              >
                <option value="private">private</option>
                <option value="unlisted">unlisted</option>
                <option value="public">public</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="auth-fieldset">
            <legend>Кубики</legend>
            <div className="auth-colors">
              <label className="auth-field auth-field--color">
                <span>Корпус</span>
                <input type="color" value={bodyColor} onChange={(e) => setBodyColor(e.target.value)} />
              </label>
              <label className="auth-field auth-field--color">
                <span>Акцент</span>
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
              </label>
              <label className="auth-field auth-field--color">
                <span>Цифры</span>
                <input type="color" value={numberColor} onChange={(e) => setNumberColor(e.target.value)} />
              </label>
            </div>
          </fieldset>

          {error && <p className="auth-error">{error}</p>}
          {status && <p className="auth-ok">{status}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </div>
    </section>
  )
}
