/**
 * Шапка сцены — как на экране героя: слева шеврон с переходами, по центру
 * название комнаты, справа круглые кнопки. Всё организационное (участники,
 * приглашение, настройки, журнал) живёт за ними и не занимает стол.
 */
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronRight, DoorOpen, Expand, Home, Library, MessageCircle, ScrollText, Settings, SlidersHorizontal, UserRound, Users, WifiOff, X } from 'lucide-react'
import { ChatPanel, useChatUnread } from '../Chat'
import { InvitePanel, LeavePanel, PartyPanel, PartyRestPanel, RoomSettingsPanel } from '../Lobby'
import { RollingNow } from '../RoomDice'
import { RoomLog } from '../RoomLog'
import { useRoom } from '../RoomProvider'
import { statusRu } from '../applyEvent'
import { Round } from './parts'
import { PauseBadge, PauseButton } from './PauseControls'
import { PingSettingsPanel } from './PingSettings'
import { useKeybinding } from '../../input/useKeybinding'
import { SettingsDialog } from '../../settings/SettingsDialog'

type Pop = 'party' | 'log' | 'settings' | 'chat' | null

/** Боковая створка: кожаная для настроек */
function Drawer({ title, icon: Icon, onClose, children, className = '' }: { title: string; icon: typeof Users; onClose: () => void; children: ReactNode; className?: string }) {
  return createPortal(
    <div className="tb-drawer-layer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`tb-drawer${className ? ` ${className}` : ''}`} role="dialog" aria-label={title}>
        <header>
          <Icon aria-hidden="true" />
          <h2>{title}</h2>
          <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="tb-drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

/** Журнал — свиток: разворачивается сверху вниз, и его не видно, пока не позовёшь */
function LogScroll({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="tb-drawer-layer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="tb-scroll" role="dialog" aria-label="Журнал">
        <span className="tb-scroll-rod" aria-hidden="true" />
        <div className="tb-scroll-paper">
          <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
          <h2>Хроника партии</h2>
          <RoomLog bare limit={300} />
        </div>
        <span className="tb-scroll-rod" aria-hidden="true" />
      </aside>
    </div>,
    document.body,
  )
}

export function TopBar({ center, onSheet }: { center?: ReactNode; onSheet?: () => void }) {
  const { data, isDm, isOwner, link } = useRoom()
  const [menu, setMenu] = useState(false)
  const [pop, setPop] = useState<Pop>(null)
  // центр настроек: устройство, профиль и (для хозяина) эта комната
  const [prefs, setPrefs] = useState(false)
  const toggle = (p: Exclude<Pop, null>) => setPop((cur) => (cur === p ? null : p))
  const unread = useChatUnread(pop === 'chat')

  useKeybinding('dialog.close', () => {
    if (document.querySelector('.cw-modal-layer, .tb-layer')) return
    setMenu(false)
    setPop(null)
  })

  if (!data) return null
  const pending = isOwner ? data.members.filter((m) => m.status === 'pending').length : 0
  const offline = link !== 'open' && link !== 'syncing'
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  return (
    <>
      <header className="tb-top">
        <button type="button" className="tb-round tb-chevron" onClick={() => setMenu(true)} aria-label="Меню: переходы" aria-expanded={menu}>
          <ChevronRight aria-hidden="true" />
        </button>
        <div className="tb-title">
          {center ?? (
            <>
              <h1>{data.room.name}</h1>
              {data.room.status === 'closed' && <span>{statusRu(data.room.status)}</span>}
            </>
          )}
          <PauseBadge />
          {offline ? (
            <em className="tb-offline" role="status">
              <WifiOff aria-hidden="true" /> связь потеряна, переподключаемся…
            </em>
          ) : (
            <RollingNow />
          )}
        </div>
        <div className="tb-rounds">
          <PauseButton />
          {onSheet && <Round icon={UserRound} label="Лист героя" onClick={onSheet} />}
          <Round icon={MessageCircle} label="Чат" badge={unread || undefined} on={pop === 'chat'} onClick={() => toggle('chat')} />
          <Round icon={ScrollText} label="Журнал" on={pop === 'log'} onClick={() => toggle('log')} />
          <Round icon={Users} label="Участники" badge={pending || undefined} alert={pending > 0} on={pop === 'party'} onClick={() => toggle('party')} />
          <Round icon={Settings} label={isOwner ? 'Настройки комнаты' : 'Комната'} on={pop === 'settings'} onClick={() => toggle('settings')} />
        </div>
      </header>

      {pop === 'log' && <LogScroll onClose={() => setPop(null)} />}
      {pop === 'chat' && (
        <Drawer title="Чат" icon={MessageCircle} onClose={() => setPop(null)} className="is-chat">
          <ChatPanel />
        </Drawer>
      )}
      {pop === 'party' && (
        <Drawer title="Участники" icon={Users} onClose={() => setPop(null)}>
          {isOwner && <InvitePanel />}
          <PartyPanel />
          {isDm && <PartyRestPanel />}
        </Drawer>
      )}
      {pop === 'settings' && (
        <Drawer title={isOwner ? 'Настройки комнаты' : data.room.name} icon={Settings} onClose={() => setPop(null)}>
          {isOwner ? (
            <RoomSettingsPanel />
          ) : (
            <>
              {data.room.description && <p className="tb-drawer-text">{data.room.description}</p>}
              <p className="tb-drawer-text">Сейчас: {statusRu(data.room.status)}.</p>
              <LeavePanel />
            </>
          )}
          <PingSettingsPanel isDm={isDm} />
          <button
            type="button"
            className="tb-linkbtn"
            onClick={() => {
              setPop(null)
              setPrefs(true)
            }}
          >
            Все настройки и клавиши…
          </button>
        </Drawer>
      )}
      {prefs && <SettingsDialog onClose={() => setPrefs(false)} room={isOwner ? <RoomSettingsPanel /> : <p className="st-note">Настройки этой комнаты меняет мастер.</p>} />}

      {menu &&
        createPortal(
        <div className="tb-menu-layer" onPointerDown={(e) => e.target === e.currentTarget && setMenu(false)}>
          <nav className="tb-menu" aria-label="Меню">
            <header>
              <b>Vantage</b>
              <button type="button" className="tb-card-x" onClick={() => setMenu(false)} aria-label="Закрыть">
                <X aria-hidden="true" />
              </button>
            </header>
            <Link to="/rooms" className="tb-menu-item">
              <DoorOpen aria-hidden="true" /> Все комнаты
            </Link>
            <Link to="/characters" className="tb-menu-item">
              <UserRound aria-hidden="true" /> Мои персонажи
            </Link>
            <Link to="/classes" className="tb-menu-item">
              <Library aria-hidden="true" /> Кодекс
            </Link>
            <Link to="/" className="tb-menu-item">
              <Home aria-hidden="true" /> Главная
            </Link>
            <button
              type="button"
              className="tb-menu-item"
              onClick={() => {
                setMenu(false)
                setPrefs(true)
              }}
            >
              <SlidersHorizontal aria-hidden="true" /> Настройки
            </button>
            {canFullscreen && (
              <button
                type="button"
                className="tb-menu-item"
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen()
                  else void document.documentElement.requestFullscreen().catch(() => {})
                  setMenu(false)
                }}
              >
                <Expand aria-hidden="true" /> На весь экран
              </button>
            )}
          </nav>
        </div>,
        document.body,
      )}
    </>
  )
}
