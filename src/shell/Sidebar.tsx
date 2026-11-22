import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  GraduationCap,
  Home,
  LogIn,
  Menu,
  ScrollText,
  Search,
  Settings,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { VantageLogo } from '../ornaments'
import { useOpenSearch } from '../search/GlobalSearch'
import { CODEX } from './categories'
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
        <SidebarMenu expanded={expanded} />

        <SidebarSearch expanded={expanded} />

        {/* главное — крупно: играть и герои; остальные разделы — в меню под логотипом */}
        <nav className="sidebar-main" aria-label="Главное">
          <NavLink to="/rooms" title="Играть" className={({ isActive }) => `sidebar-link sidebar-link--play${isActive ? ' is-active' : ''}`}>
            <DoorOpen aria-hidden="true" className="sidebar-link-icon" />
            <span className="sidebar-link-label">Играть</span>
          </NavLink>
          <NavLink
            to="/characters"
            title="Персонажи"
            data-tour="nav-characters"
            className={({ isActive }) => `sidebar-link sidebar-link--big${isActive ? ' is-active' : ''}`}
          >
            <ScrollText aria-hidden="true" className="sidebar-link-icon" />
            <span className="sidebar-link-label">Персонажи</span>
          </NavLink>
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

const MENU_CLOSE_DELAY = 220

/**
 * Логотип — бургер-меню: наведение (или клик, или фокус с клавиатуры) открывает панель
 * со всеми разделами сайта — «Играть» и весь справочник. Панель живёт рядом с сайдбаром,
 * закрывается, когда курсор ушёл, по Esc и после перехода.
 */
function SidebarMenu({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const show = useCallback(() => {
    cancel()
    setOpen(true)
  }, [])
  const hideSoon = useCallback(() => {
    cancel()
    timer.current = setTimeout(() => setOpen(false), MENU_CLOSE_DELAY)
  }, [])

  // переход по ссылке — меню закрывается
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => cancel, [])

  const item = (path: string, label: string, Icon: typeof Home, end = false) => (
    <NavLink key={path} to={path} end={end} data-tour={`nav-${path.slice(1) || 'home'}`} className={({ isActive }) => `sidebar-menu-link${isActive ? ' is-active' : ''}`}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  )

  return (
    <div className={`sidebar-top${open ? ' is-menu-open' : ''}`} onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        type="button"
        className="sidebar-brand"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="sidebar-menu"
        title="Все разделы"
        data-tour="sidebar-nav"
        onClick={() => setOpen((v) => !v)}
        onFocus={show}
      >
        <span className="sidebar-brand-logo">
          <VantageLogo size={expanded ? 40 : 38} />
          <span className="sidebar-burger" aria-hidden="true">
            <Menu />
          </span>
        </span>
        <span className="sidebar-brand-name gold-text">Vantage</span>
      </button>

      {open && (
        <div id="sidebar-menu" className="sidebar-menu" role="menu" aria-label="Все разделы" onMouseEnter={show} onMouseLeave={hideSoon} onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideSoon()
        }}>
          <div className="sidebar-menu-group">
            <span className="sidebar-menu-title">Играть</span>
            <div className="sidebar-menu-grid">
              {item('/', 'Главная', Home, true)}
              {item('/rooms', 'Комнаты', DoorOpen)}
              {item('/characters', 'Персонажи', ScrollText)}
            </div>
          </div>
          <div className="sidebar-menu-group">
            <span className="sidebar-menu-title">Справочник</span>
            <div className="sidebar-menu-grid">{CODEX.map(({ path, label, icon }) => item(path, label, icon))}</div>
          </div>
        </div>
      )}
    </div>
  )
}
