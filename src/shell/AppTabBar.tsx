import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  DoorOpen,
  Home,
  Library,
  LogIn,
  ScrollText,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { CODEX } from './categories'

/* ---------- Нижняя панель телефона ---------- */

export function AppTabBar() {
  const { user, ready } = useAuth()
  const { pathname } = useLocation()
  const [codexOpen, setCodexOpen] = useState(false)
  const inCodex = CODEX.some((c) => pathname === c.path || pathname.startsWith(`${c.path}/`))

  useEffect(() => {
    setCodexOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!codexOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCodexOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [codexOpen])

  return (
    <>
      <nav className="app-tabbar" aria-label="Навигация приложения">
        <NavLink to="/" end className={({ isActive }) => `app-tab${isActive && !codexOpen ? ' is-on' : ''}`}>
          <Home aria-hidden="true" />
          <span>Главная</span>
        </NavLink>
        <button
          type="button"
          className={`app-tab${inCodex || codexOpen ? ' is-on' : ''}`}
          aria-expanded={codexOpen}
          aria-controls="app-codex"
          onClick={() => setCodexOpen((v) => !v)}
        >
          <Library aria-hidden="true" />
          <span>Кодекс</span>
        </button>
        <NavLink to="/characters" className={({ isActive }) => `app-tab${isActive ? ' is-on' : ''}`}>
          <ScrollText aria-hidden="true" />
          <span>Герои</span>
        </NavLink>
        <NavLink to="/rooms" className={({ isActive }) => `app-tab${isActive ? ' is-on' : ''}`}>
          <DoorOpen aria-hidden="true" />
          <span>Комнаты</span>
        </NavLink>
        {!ready ? (
          <span className="app-tab is-wait" aria-hidden="true">
            <UserRound />
            <span>Профиль</span>
          </span>
        ) : user ? (
          <NavLink to="/me" className={({ isActive }) => `app-tab${isActive ? ' is-on' : ''}`}>
            <UserRound aria-hidden="true" />
            <span>Профиль</span>
          </NavLink>
        ) : (
          <Link to="/login" className="app-tab">
            <LogIn aria-hidden="true" />
            <span>Войти</span>
          </Link>
        )}
      </nav>
      {codexOpen && (
        <div className="app-codex-layer">
          <button type="button" className="app-codex-scrim" aria-label="Закрыть кодекс" onClick={() => setCodexOpen(false)} />
          <div id="app-codex" className="app-codex" role="dialog" aria-label="Разделы кодекса">
            <p className="app-codex-title gold-text">Кодекс</p>
            <nav className="app-codex-grid" aria-label="Разделы каталога">
              {CODEX.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `app-codex-link${isActive ? ' is-on' : ''}`}
                  onClick={() => setCodexOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
