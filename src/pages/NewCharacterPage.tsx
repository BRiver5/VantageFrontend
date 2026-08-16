import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createCharacter, emptyCharacter, type CharacterVisibility } from '../api'
import { useAuth } from '../auth/AuthContext'

export default function NewCharacterPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [raceName, setRaceName] = useState('')
  const [className, setClassName] = useState('')
  const [level, setLevel] = useState(1)
  const [visibility, setVisibility] = useState<CharacterVisibility>(
    user?.preferences?.default_character_visibility ?? 'private',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = emptyCharacter({
        name: name.trim() || 'Новый герой',
        raceName: raceName.trim() || 'Человек',
        className: className.trim() || 'Воин',
        level: Math.min(20, Math.max(1, level)),
        visibility,
      })
      if (user?.display_name) {
        body.basic_info.player_display_name = user.display_name
      }
      const created = await createCharacter(body)
      if (!created.id) throw new Error('Сервер не вернул id персонажа')
      navigate(`/characters/${created.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1 className="section-title gold-text">Новый персонаж</h1>
        <p className="auth-lead">Минимальные данные — остальное допишете в листе.</p>
        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="auth-field">
            <span>Имя</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Тарин" required />
          </label>
          <label className="auth-field">
            <span>Раса</span>
            <input value={raceName} onChange={(e) => setRaceName(e.target.value)} placeholder="Полуэльф" />
          </label>
          <label className="auth-field">
            <span>Класс</span>
            <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Следопыт" />
          </label>
          <label className="auth-field">
            <span>Уровень</span>
            <input
              type="number"
              min={1}
              max={20}
              value={level}
              onChange={(e) => setLevel(parseInt(e.target.value, 10) || 1)}
            />
          </label>
          <label className="auth-field">
            <span>Видимость</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CharacterVisibility)}
            >
              <option value="private">private</option>
              <option value="unlisted">unlisted</option>
              <option value="public">public</option>
            </select>
          </label>
          {error && <p className="auth-error">{error}</p>}
          <div className="auth-actions-row">
            <Link to="/characters" className="cs-btn cs-btn--ghost">
              Отмена
            </Link>
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? 'Создаём…' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
