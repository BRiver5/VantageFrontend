import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth/AuthContext'

const NICK_RE = /^[a-z0-9_]{3,24}$/

export default function RegisterPage() {
  const { register, user, ready } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') || '/characters'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (ready && user) return <Navigate to={next} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const nick = nickname.trim().toLowerCase()
    if (!NICK_RE.test(nick)) {
      setError('Ник: 3–24 символа, только a-z, 0-9 и _.')
      return
    }
    setBusy(true)
    try {
      await register({
        email: email.trim(),
        password,
        nickname: nick,
        display_name: displayName.trim() || nick,
      })
      navigate(next, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Email или ник уже заняты.')
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось зарегистрироваться.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1 className="section-title gold-text">Регистрация</h1>
        <p className="auth-lead">Создайте аккаунт, чтобы хранить листы в облаке.</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Ник</span>
            <input
              type="text"
              autoComplete="username"
              required
              pattern="[a-z0-9_]{3,24}"
              title="3–24 символа: a-z, 0-9, _"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.toLowerCase())}
            />
          </label>
          <label className="auth-field">
            <span>Отображаемое имя</span>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Как вас зовут за столом"
            />
          </label>
          <label className="auth-field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Создаём…' : 'Создать аккаунт'}
          </button>
        </form>
        <p className="auth-switch">
          Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(next)}`}>Войти</Link>
        </p>
      </div>
    </section>
  )
}
