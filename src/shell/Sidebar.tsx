/**
 * Боковое меню.
 *
 * Сверху — логотип (ссылка на главную) и отдельная кнопка «Все разделы»: она открывает
 * бургер-меню со всеми разделами сайта («Играть» и справочник). Под ней — поиск.
 * Внизу — «док»: редакция правил, настройки, обучение и карточка профиля.
 * Стрелка у края сворачивает меню до иконок (выбор запоминается).
 */
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
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { VantageLogo } from '../ornaments'
import { Img } from '../media'
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
  const [expanded, setExpanded] = useState(readSidebarExpanded)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, expanded ? '1' : '0')
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.sidebar = expanded ? 'expanded' : 'collapsed'
  }, [expanded])

  return (
    <aside className={`sidebar-wrap${expanded ? ' is-expanded' : ' is-collapsed'}`} aria-label="Навигация">
      <div className="sidebar">
        <div className="sidebar-top">
          <Link to="/" className="sidebar-brand" title="На главную">
            <VantageLogo size={expanded ? 40 : 36} />
            <span className="sidebar-brand-name gold-text">Vantage</span>
          </Link>
        </div>

        <SidebarMenu expanded={expanded} />
        <SidebarSearch expanded={expanded} />

        <SidebarDock expanded={expanded} />
      </div>

      <button
        type="button"
        className="sidebar-toggle"
        aria-label={expanded ? 'Свернуть меню' : 'Развернуть меню'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="sidebar-toggle-face">
          {expanded ? <ChevronLeft aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
        </span>
      </button>
    </aside>
  )
}

/** Кнопка поиска: открывает поиск по всему сайту */
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
 * «Все разделы» — бургер-меню. Открывается кликом и наведением, закрывается, когда курсор
 * ушёл, по Esc, крестиком и после перехода. Панель стоит справа от сайдбара.
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

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => cancel, [])

  const item = (path: string, label: string, Icon: LucideIcon, end = false) => (
    <NavLink
      key={path}
      to={path}
      end={end}
      role="menuitem"
      data-tour={`nav-${path.slice(1) || 'home'}`}
      className={({ isActive }) => `sidebar-menu-link${isActive ? ' is-active' : ''}`}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  )

  return (
    <div className="sidebar-burger-wrap" onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        type="button"
        className={`sidebar-burger-btn${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="sidebar-menu"
        title="Все разделы"
        data-tour="sidebar-nav"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sidebar-burger-ico" aria-hidden="true">
          {open ? <X /> : <Menu />}
        </span>
        {expanded && <span className="sidebar-burger-label">Все разделы</span>}
        {expanded && <ChevronRight className="sidebar-burger-caret" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id="sidebar-menu"
          className="sidebar-menu"
          role="menu"
          aria-label="Все разделы"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideSoon()
          }}
        >
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

/** Низ меню: редакция, настройки и обучение одной полкой, под ними — карточка профиля */
function SidebarDock({ expanded }: { expanded: boolean }) {
  const { user, ready } = useAuth()
  return (
    <div className="sidebar-dock">
      <div className="sidebar-edition" data-tour="sidebar-edition">
        <span className="sidebar-edition-label">Редакция</span>
        <GlobalEditionToggle size={expanded ? 'normal' : 'compact'} labels={expanded ? 'both' : 'active'} />
      </div>

      <div className="sidebar-tools">
        <button type="button" className="sidebar-tool" title="Настройки" onClick={() => openSettings()}>
          <Settings aria-hidden="true" />
          {expanded && <span>Настройки</span>}
        </button>
        <button type="button" className="sidebar-tool" title="Обучение: туры по интерфейсу" onClick={openToursPanel} data-tour="sidebar-tours">
          <GraduationCap aria-hidden="true" />
          {expanded && <span>Обучение</span>}
        </button>
      </div>

      {!ready ? null : user ? (
        <NavLink
          to="/me"
          title={user.nickname}
          data-tour="sidebar-account"
          className={({ isActive }) => `sidebar-account${isActive ? ' is-active' : ''}`}
        >
          <span className="sidebar-account-face" aria-hidden="true">
            {user.avatar_url ? <Img src={user.avatar_url} alt="" /> : (user.nickname || '?').slice(0, 1).toUpperCase()}
          </span>
          {expanded && (
            <span className="sidebar-account-text">
              <b>{user.nickname}</b>
              <i>профиль</i>
            </span>
          )}
        </NavLink>
      ) : (
        <Link to="/login" title="Войти" className="sidebar-account" data-tour="sidebar-account">
          <span className="sidebar-account-face" aria-hidden="true">
            <LogIn />
          </span>
          {expanded && (
            <span className="sidebar-account-text">
              <b>Войти</b>
              <i>чтобы хранить героев</i>
            </span>
          )}
        </Link>
      )}
    </div>
  )
}
