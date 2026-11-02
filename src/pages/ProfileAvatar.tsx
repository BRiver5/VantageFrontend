/**
 * Аватар в профиле: свой файл, картинка одного из ваших героев или внешняя
 * ссылка. Применяется сразу, отдельно от формы профиля: поле `avatar_url` в
 * ответе всегда содержит показываемую картинку (в том числе героя), и отправка
 * его обратно вместе с формой сбросила бы выбор героя.
 */
import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { listMyCharacters, uploadAvatar, type Character } from '../api'
import { useAuth } from '../auth/AuthContext'
import { RoomAvatar } from '../rooms/ui'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не удалось сохранить')

export default function ProfileAvatar() {
  const { user, updateMe, refreshMe } = useAuth()
  const [characters, setCharacters] = useState<Character[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listMyCharacters()
      .then((list) => alive && setCharacters(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!user) return null
  const fromCharacter = user.avatar_character_id ?? ''

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pf-avatar">
      <RoomAvatar src={user.avatar_url} name={user.display_name || user.nickname} size={76} />
      <div className="pf-avatar-body">
        <div className="pf-avatar-acts">
          <button type="button" className="cw-mini-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Camera aria-hidden="true" /> Загрузить файл
          </button>
          {user.avatar_url && (
            <button type="button" className="cw-mini-btn" disabled={busy} onClick={() => void run(() => updateMe({ avatar_url: null }))}>
              <Trash2 aria-hidden="true" /> Убрать
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void run(async () => (await uploadAvatar(file), await refreshMe()))
            }}
          />
        </div>
        {characters.length > 0 && (
          <label className="auth-field">
            <span>Картинка героя</span>
            <select
              value={fromCharacter}
              disabled={busy}
              onChange={(e) => void run(() => updateMe({ avatar_character_id: e.target.value || null }))}
            >
              <option value="">Своя картинка</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.character_name || 'Без имени'}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="auth-field">
          <span>Или ссылка на картинку</span>
          <span className="pf-avatar-url">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <button type="button" className="cw-mini-btn" disabled={busy || !url.trim()} onClick={() => void run(async () => (await updateMe({ avatar_url: url.trim() }), setUrl('')))}>
              Применить
            </button>
          </span>
        </label>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  )
}
