/**
 * Боковая панель — всегда узкая, без разворачивания.
 *
 * Сверху вниз: логотип (на главную), кнопка «Все разделы», поиск; внизу — вертикальный
 * переключатель редакции (2024 сверху, 2014 снизу). «Все разделы» открывает большое меню
 * сеткой групп: всё, что есть на сайте, плюс профиль, настройки и обучение.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Award,
  Backpack,
  BookMarked,
  DoorOpen,
  Gem,
  GraduationCap,
  Home,
  Landmark,
  LogIn,
  Menu,
  PlusCircle,
  ScrollText,
  Search,
  Settings,
  Skull,
  Sparkles,
  Swords,
  UserRound,
  VenetianMask,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { VantageLogo } from '../ornaments'
import { Img } from '../media'
import { useOpenSearch } from '../search/GlobalSearch'
import { openSettings } from '../settings/open'
import { openToursPanel } from '../tours/store'
import { useGlobalEdition } from '../editions/useEdition'

type MenuItem = { label: string; icon: LucideIcon } & ({ to: string; end?: boolean } | { onClick: () => void })

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const openSearch = useOpenSearch()
  const location = useLocation()

  // панель всегда узкая: ширина контента считается от свёрнутого вида (ставим до первой отрисовки)
  useState(() => {
    document.documentElement.dataset.sidebar = 'collapsed'
    return null
  })
  useEffect(() => setOpen(false), [location.pathname])
  const close = useCallback(() => setOpen(false), [])

  return (
    <aside className="sidebar-wrap is-collapsed" aria-label="Навигация">
      <div className="sidebar">
        <Link to="/" className="sidebar-logo" title="На главную" aria-label="На главную">
          <VantageLogo size={38} />
        </Link>

        <button
          type="button"
          className={`sidebar-rail-btn sidebar-rail-btn--menu${open ? ' is-on' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="site-menu"
          title="Все разделы"
          data-tour="sidebar-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <button type="button" className="sidebar-rail-btn" onClick={() => openSearch()} title="Поиск по сайту (Ctrl+K)" aria-label="Поиск" data-tour="sidebar-search">
          <Search aria-hidden="true" />
        </button>

        <RailEdition />
      </div>

      {open && createPortal(<SiteMenu onClose={close} />, document.body)}
    </aside>
  )
}

/** Редакция правил вертикально: 2024 сверху, ползунок, 2014 снизу */
function RailEdition() {
  const [edition, setEdition] = useGlobalEdition()
  const is2024 = edition === '2024'
  return (
    <div className="rail-edition" data-tour="sidebar-edition">
      <button type="button" className={`rail-edition-year${is2024 ? ' is-on' : ''}`} onClick={() => setEdition('2024')} aria-pressed={is2024}>
        2024
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={is2024}
        className={`rail-edition-track${is2024 ? ' is-2024' : ''}`}
        onClick={() => setEdition(is2024 ? '2014' : '2024')}
        title={`Редакция правил: ${edition} — для всего сайта`}
        aria-label={`Редакция правил: ${edition}`}
      >
        <span className="rail-edition-knob" />
      </button>
      <button type="button" className={`rail-edition-year${!is2024 ? ' is-on' : ''}`} onClick={() => setEdition('2014')} aria-pressed={!is2024}>
        2014
      </button>
    </div>
  )
}

/** Большое меню: группы разделов сайта, аккаунт и настройки */
function SiteMenu({ onClose }: { onClose: () => void }) {
  const { user, ready } = useAuth()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Игра',
      items: [
        { to: '/', end: true, label: 'Главная', icon: Home },
        { to: '/rooms', label: 'Комнаты', icon: DoorOpen },
        { to: '/characters', label: 'Персонажи', icon: ScrollText },
        { to: '/characters/new', label: 'Новый герой', icon: PlusCircle },
      ],
    },
    {
      title: 'Персонаж',
      items: [
        { to: '/classes', label: 'Классы', icon: Swords },
        { to: '/races', label: 'Расы', icon: VenetianMask },
        { to: '/backgrounds', label: 'Предыстории', icon: Landmark },
        { to: '/feats', label: 'Черты', icon: Award },
        { to: '/spells', label: 'Заклинания', icon: Sparkles },
      ],
    },
    {
      title: 'Предметы',
      items: [
        { to: '/equipment', label: 'Снаряжение', icon: Backpack },
        { to: '/items', label: 'Магические предметы', icon: Gem },
      ],
    },
    {
      title: 'Мастерская',
      items: [
        { to: '/bestiary', label: 'Бестиарий', icon: Skull },
        { to: '/terms', label: 'Термины', icon: BookMarked },
      ],
    },
    {
      title: 'Аккаунт',
      items: [
        ...(!ready
          ? []
          : user
            ? [{ to: '/me', label: 'Профиль', icon: UserRound } as MenuItem]
            : [{ to: '/login', label: 'Войти', icon: LogIn } as MenuItem]),
        { onClick: () => (onClose(), openSettings()), label: 'Настройки', icon: Settings },
        { onClick: () => (onClose(), openToursPanel()), label: 'Обучение', icon: GraduationCap },
      ],
    },
  ]

  return (
    <>
      <button type="button" className="site-menu-scrim" aria-label="Закрыть меню" onClick={onClose} />
      <div id="site-menu" className="site-menu" role="dialog" aria-label="Все разделы" ref={panel}>
        <header className="site-menu-head">
          <VantageLogo size={46} />
          <span className="site-menu-brand">
            <b className="gold-text">Vantage</b>
            <i>Справочник и стол для D&amp;D 5e — 2014 и 2024</i>
          </span>
          {ready && user && (
            <Link to="/me" className="site-menu-user" title="Профиль">
              <span className="site-menu-avatar" aria-hidden="true">
                {user.avatar_url ? <Img src={user.avatar_url} alt="" /> : (user.nickname || '?').slice(0, 1).toUpperCase()}
              </span>
              <span>{user.nickname}</span>
            </Link>
          )}
        </header>
        <nav className="site-menu-grid" aria-label="Разделы сайта">
          {groups.map((g) => (
            <section key={g.title} className="site-menu-group">
              <h3>{g.title}</h3>
              <ul>
                {g.items.map((it) => {
                  const Icon = it.icon
                  return (
                    <li key={it.label}>
                      {'to' in it ? (
                        <NavLink
                          to={it.to}
                          end={it.end}
                          data-tour={`nav-${it.to.slice(1).replace(/\//g, '-') || 'home'}`}
                          className={({ isActive }) => `site-menu-link${isActive ? ' is-active' : ''}`}
                        >
                          <Icon aria-hidden="true" />
                          <span>{it.label}</span>
                        </NavLink>
                      ) : (
                        <button type="button" className="site-menu-link" onClick={it.onClick} data-tour={it.label === 'Обучение' ? 'sidebar-tours' : undefined}>
                          <Icon aria-hidden="true" />
                          <span>{it.label}</span>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </>
  )
}
