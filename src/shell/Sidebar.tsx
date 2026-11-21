import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LogIn,
  Search,
  Settings,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { VantageLogo } from '../ornaments'
import { useOpenSearch } from '../search/GlobalSearch'
import { CATEGORIES } from './categories'
import { openSettings } from '../settings/open'
import { openToursPanel } from '../tours/store'
import { GlobalEditionToggle } from '../editions/EditionControls'

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

        <nav className="sidebar-nav" aria-label="Разделы каталога" data-tour="sidebar-nav">
          {CATEGORIES.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              title={label}
              data-tour={`nav-${path.slice(1)}`}
              className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
            >
              <Icon aria-hidden="true" className="sidebar-link-icon" />
              <span className="sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-edition" data-tour="sidebar-edition">
            <span className="sidebar-edition-label">Редакция</span>
            <GlobalEditionToggle size={expanded ? 'normal' : 'compact'} labels={expanded ? 'both' : 'active'} />
          </div>
          <button type="button" className="sidebar-link sidebar-link--settings" title="Настройки" onClick={() => openSettings()}>
            <Settings aria-hidden="true" className="sidebar-link-icon" />
            <span className="sidebar-link-label">Настройки</span>
          </button>
          <button type="button" className="sidebar-link sidebar-link--tours" title="Обучение: туры по интерфейсу" onClick={openToursPanel} data-tour="sidebar-tours">
            <GraduationCap aria-hidden="true" className="sidebar-link-icon" />
            <span className="sidebar-link-label">Обучение</span>
          </button>
          {!ready ? null : user ? (
            <NavLink
              to="/me"
              title={user.nickname}
              data-tour="sidebar-account"
              className={({ isActive }) => `sidebar-link sidebar-link--auth${isActive ? ' is-active' : ''}`}
            >
              <UserRound aria-hidden="true" className="sidebar-link-icon" />
              <span className="sidebar-link-label">{user.nickname}</span>
            </NavLink>
          ) : (
            <Link to="/login" title="Войти" className="sidebar-link sidebar-link--auth" data-tour="sidebar-account">
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
    <button type="button" className="sidebar-search" onClick={() => openSearch()} title="Поиск по сайту (Ctrl+K)" data-tour="sidebar-search">
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
