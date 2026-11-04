/**
 * Шапка сцены — как на экране героя: слева шеврон с переходами, по центру
 * название комнаты, справа круглые кнопки. Всё организационное (участники,
 * приглашение, настройки, журнал) живёт за ними и не занимает стол.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronRight, DoorOpen, Expand, Home, Library, MessageCircle, ScrollText, Settings, UserRound, Users, WifiOff, X } from 'lucide-react'
import { ChatPanel, useChatUnread } from '../Chat'
import { InvitePanel, LeavePanel, PartyPanel, PartyRestPanel, RoomSettingsPanel } from '../Lobby'
import { RollingNow } from '../RoomDice'
import { RoomLog } from '../RoomLog'
import { useRoom } from '../RoomProvider'
import { statusRu } from '../applyEvent'
import { Round } from './parts'

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
  const { data, isDm, link } = useRoom()
  const [menu, setMenu] = useState(false)
  const [pop, setPop] = useState<Pop>(null)
  const toggle = (p: Exclude<Pop, null>) => setPop((cur) => (cur === p ? null : p))
  const unread = useChatUnread(pop === 'chat')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.cw-modal-layer, .tb-layer')) return
      setMenu(false)
      setPop(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!data) return null
  const pending = data.members.filter((m) => m.status === 'pending').length
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
              {(data.room.status === 'paused' || data.room.status === 'closed') && <span>{statusRu(data.room.status)}</span>}
            </>
          )}
          {offline ? (
            <em className="tb-offline" role="status">
              <WifiOff aria-hidden="true" /> связь потеряна, переподключаемся…
            </em>
          ) : (
            <RollingNow />
          )}
        </div>
        <div className="tb-rounds">
          {onSheet && <Round icon={UserRound} label="Лист героя" onClick={onSheet} />}
          <Round icon={MessageCircle} label="Чат" badge={unread || undefined} on={pop === 'chat'} onClick={() => toggle('chat')} />
          <Round icon={ScrollText} label="Журнал" on={pop === 'log'} onClick={() => toggle('log')} />
          <Round icon={Users} label="Участники" badge={pending || undefined} alert={pending > 0} on={pop === 'party'} onClick={() => toggle('party')} />
          <Round icon={Settings} label={isDm ? 'Настройки комнаты' : 'Комната'} on={pop === 'settings'} onClick={() => toggle('settings')} />
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
          {isDm && <InvitePanel />}
          <PartyPanel />
          {isDm && <PartyRestPanel />}
        </Drawer>
      )}
      {pop === 'settings' && (
        <Drawer title={isDm ? 'Настройки комнаты' : data.room.name} icon={Settings} onClose={() => setPop(null)}>
          {isDm ? (
            <RoomSettingsPanel />
          ) : (
            <>
              {data.room.description && <p className="tb-drawer-text">{data.room.description}</p>}
              <p className="tb-drawer-text">Сейчас: {statusRu(data.room.status)}.</p>
              <LeavePanel />
            </>
          )}
        </Drawer>
      )}

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
