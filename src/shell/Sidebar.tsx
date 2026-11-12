import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  Search,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { VantageLogo } from '../ornaments'
import { useOpenSearch } from '../search/GlobalSearch'
import { CATEGORIES } from './categories'

const SIDEBAR_KEY = 'vantage-sidebar-expanded'

function readSidebarExpanded(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY)
    const expanded = raw === null ? true : raw === '1'
    document.documentElement.dataset.sidebar = expanded ? 'expanded' : 'collapsed'
    return expanded
  } catch {
    document.documentElement.dataset.sidebar = 'expanded'
    return true
  }
}

export function Sidebar() {
  const { user, ready } = useAuth()
  const [expanded, setExpanded] = useState(readSidebarExpanded)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, expanded ? '1' : '0')
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.sidebar = expanded ? 'expanded' : 'collapsed'
  }, [expanded])

  useEffect(() => {
    document.documentElement.dataset.sidebar = expanded ? 'expanded' : 'collapsed'
  }, [])

  return (
    <aside
      className={`sidebar-wrap${expanded ? ' is-expanded' : ' is-collapsed'}`}
      aria-label="Навигация"
    >
      <div className="sidebar">
        <div className="sidebar-top">
          <Link to="/" className="sidebar-brand" title="Vantage">
            <VantageLogo size={expanded ? 38 : 34} />
            <span className="sidebar-brand-name gold-text">Vantage</span>
          </Link>
        </div>

        <SidebarSearch expanded={expanded} />

        <nav className="sidebar-nav" aria-label="Разделы каталога">
          {CATEGORIES.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              title={label}
              className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
            >
              <Icon aria-hidden="true" className="sidebar-link-icon" />
              <span className="sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          {!ready ? null : user ? (
            <NavLink
              to="/me"
              title={user.nickname}
              className={({ isActive }) => `sidebar-link sidebar-link--auth${isActive ? ' is-active' : ''}`}
            >
              <UserRound aria-hidden="true" className="sidebar-link-icon" />
              <span className="sidebar-link-label">{user.nickname}</span>
            </NavLink>
          ) : (
            <Link to="/login" title="Войти" className="sidebar-link sidebar-link--auth">
              <LogIn aria-hidden="true" className="sidebar-link-icon" />
              <span className="sidebar-link-label">Войти</span>
            </Link>
          )}
        </div>
      </div>

      <button
        type="button"
        className="sidebar-toggle"
        aria-label={expanded ? 'Свернуть меню' : 'Развернуть меню'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="sidebar-toggle-face">
          {expanded ? (
            <ChevronLeft aria-hidden="true" size={16} />
          ) : (
            <ChevronRight aria-hidden="true" size={16} />
          )}
        </span>
      </button>
    </aside>
  )
}

/** Кнопка поиска в боковом меню: открывает поиск по всему сайту */
function SidebarSearch({ expanded }: { expanded: boolean }) {
  const openSearch = useOpenSearch()
  return (
    <button type="button" className="sidebar-search" onClick={() => openSearch()} title="Поиск по сайту (Ctrl+K)">
      <Search aria-hidden="true" className="sidebar-link-icon" />
      {expanded && (
        <>
          <span className="sidebar-link-label">Поиск</span>
          <kbd>Ctrl K</kbd>
        </>
      )}
    </button>
  )
}
