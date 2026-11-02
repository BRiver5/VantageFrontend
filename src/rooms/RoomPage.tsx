/**
 * Экран комнаты (/rooms/:id). Оболочка: загрузка, ошибки, шапка с состоянием
 * соединения и потерей связи. Содержимое зависит от роли:
 *  - игрок: свой лист («Герой»), партия, журнал; на телефоне — экран героя во
 *    весь экран с окнами комнаты на боковой панели;
 *  - мастер: партия и листы героев (ширма и дашборд — отдельными вкладками).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Backpack, ChevronLeft, DoorOpen, LayoutGrid, Map as MapIcon, NotebookPen, Package, Presentation, ScrollText, Skull, Swords, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppShell } from '../shell'
import { InvitePanel, LeavePanel, PartyPanel, RoomSettingsPanel, HeroCardLine } from './Lobby'
import { RoomDiceBridge, RollingNow } from './RoomDice'
import { RoomHero } from './RoomCharacter'
import { TablePanel } from './Items'
import { CombatStage, StartCombatButton } from './Combat'
import { CreaturesPanel } from './Creatures'
import { ContentOverlay, ContentPanel } from './Content'
import { DashboardGrid } from './Dashboard'
import { MapsPanel, NotesPanel, TemplatesPanel } from './Screen'
import { RoomLog } from './RoomLog'
import { RoomProvider, useRoom } from './RoomProvider'
import { LinkBadge, RoomAvatar, StatusChip } from './ui'

const FATAL_TEXT: Record<string, string> = {
  not_member: 'Вы не участник этой комнаты.',
  kicked: 'Вас исключили из комнаты, либо комнату удалили.',
  unreachable: 'Не удаётся подключиться к серверу. Проверьте соединение и откройте комнату заново.',
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <section className="rm-page rm-notice-page">
      <DoorOpen aria-hidden="true" />
      <h1 className="section-title gold-text">{title}</h1>
      <p>{text}</p>
      <Link to="/rooms" className="cs-btn">
        К комнатам
      </Link>
    </section>
  )
}

function RoomHeader() {
  const { data, link } = useRoom()
  if (!data) return null
  const room = data.room
  return (
    <>
      <header className="rm-room-head">
        <Link to="/rooms" className="back-link back-link--btn">
          <ChevronLeft aria-hidden="true" /> к комнатам
        </Link>
        <div className="rm-room-title">
          <h1 className="section-title gold-text">{room.name}</h1>
          {room.description && <p className="rm-sub">{room.description}</p>}
        </div>
        <div className="rm-room-state">
          <StatusChip status={room.status} />
          <span className="rm-online" title="Сейчас в комнате">
            {data.online.length} в сети
          </span>
          <LinkBadge status={link} />
          <RollingNow />
        </div>
      </header>
      {link !== 'open' && link !== 'syncing' && (
        <p className="rm-offline" role="status">
          Связь с комнатой потеряна. Переподключаемся — изменения пока не приходят.
        </p>
      )}
    </>
  )
}

interface TabDef {
  id: string
  label: string
  icon: LucideIcon
  badge?: number
}

function RoomTabs({ tabs, value, onChange }: { tabs: TabDef[]; value: string; onChange: (id: string) => void }) {
  return (
    <nav className="rm-tabs" role="tablist" aria-label="Разделы комнаты">
      {tabs.map(({ id, label, icon: Icon, badge }) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>
          <Icon aria-hidden="true" /> {label}
          {badge ? <em>{badge}</em> : null}
        </button>
      ))}
    </nav>
  )
}

/** Партия и журнал: общий для игрока и мастера блок */
function PartyView({ side }: { side: ReactNode }) {
  return (
    <div className="rm-lobby">
      <div className="rm-main">
        <PartyPanel />
        <RoomLog />
      </div>
      <div className="rm-side">{side}</div>
    </div>
  )
}

/** Мастер выбирает героя партии и видит его лист: действовать можно за любого */
function DmHeroes() {
  const { data } = useRoom()
  const [picked, setPicked] = useState<string | null>(null)
  if (!data) return null
  const cards = data.characters
  const current = picked && cards.some((c) => c.id === picked) ? picked : (cards[0]?.id ?? null)
  if (cards.length === 0) return <p className="rm-hint">В партии пока нет героев: примите заявки на вкладке «Партия».</p>
  return (
    <div className="rm-heroes">
      <ul className="rm-hero-picker" aria-label="Герои партии">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" className={current === c.id ? 'is-on' : ''} aria-pressed={current === c.id} onClick={() => setPicked(c.id)}>
              <RoomAvatar src={c.avatar_url} name={c.name} size={34} />
              <HeroCardLine card={c} />
            </button>
          </li>
        ))}
      </ul>
      {current && <RoomHero characterId={current} />}
    </div>
  )
}

function PlayerRoom({ characterId }: { characterId: string }) {
  const { app } = useAppShell()
  const [tab, setTab] = useState('hero')
  const { data } = useRoom()
  const onTable = data?.items.filter((i) => i.holder === 'table').length ?? 0
  const creatures = data?.creatures.length ?? 0
  // на телефоне лист занимает весь экран, остальное — окна на его панели
  if (app) return <RoomHero characterId={characterId} />
  return (
    <section className="rm-page rm-room">
      <RoomHeader />
      <CombatStage />
      <RoomTabs
        tabs={[
          { id: 'hero', label: 'Герой', icon: UserRound },
          { id: 'table', label: 'Стол', icon: Backpack, badge: onTable || undefined },
          ...(creatures > 0 ? [{ id: 'creatures', label: 'Существа', icon: Skull, badge: creatures }] : []),
          { id: 'party', label: 'Партия', icon: Users },
          { id: 'log', label: 'Журнал', icon: ScrollText },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'hero' && <RoomHero characterId={characterId} />}
      {tab === 'table' && <TablePanel characterId={characterId} />}
      {tab === 'creatures' && <CreaturesPanel />}
      {tab === 'party' && <PartyView side={<LeavePanel />} />}
      {tab === 'log' && <RoomLog limit={300} />}
    </section>
  )
}

const DESK_TABS: TabDef[] = [
  { id: 'dash', label: 'Дашборд', icon: LayoutGrid },
  { id: 'notes', label: 'Заметки', icon: NotebookPen },
  { id: 'templates', label: 'Свои предметы', icon: Package },
  { id: 'maps', label: 'Карты', icon: MapIcon },
  { id: 'content', label: 'Показать всем', icon: Presentation },
]

/** Ширма мастера: только компьютер */
function DmDesk() {
  const [sub, setSub] = useState('dash')
  return (
    <div className="rm-desk">
      <RoomTabs tabs={DESK_TABS} value={sub} onChange={setSub} />
      {sub === 'dash' && <DashboardGrid />}
      {sub === 'notes' && <NotesPanel />}
      {sub === 'templates' && <TemplatesPanel />}
      {sub === 'maps' && <MapsPanel />}
      {sub === 'content' && <ContentPanel />}
    </div>
  )
}

function DmRoom() {
  const [tab, setTab] = useState('party')
  const [picked, setPicked] = useState<string[]>([])
  const { data } = useRoom()
  const pending = data?.members.filter((m) => m.status === 'pending').length ?? 0
  return (
    <section className="rm-page rm-room">
      <RoomHeader />
      <CombatStage />
      <RoomTabs
        tabs={[
          { id: 'party', label: 'Партия', icon: Users, badge: pending || undefined },
          { id: 'screen', label: 'Ширма', icon: LayoutGrid },
          { id: 'heroes', label: 'Герои', icon: Swords },
          { id: 'creatures', label: 'Существа', icon: Skull, badge: data?.creatures.length || undefined },
          { id: 'items', label: 'Предметы', icon: Backpack },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'party' && (
        <PartyView
          side={
            <>
              <InvitePanel />
              <RoomSettingsPanel />
            </>
          }
        />
      )}
      {tab === 'screen' && <DmDesk />}
      {tab === 'heroes' && <DmHeroes />}
      {tab === 'creatures' && (
        <>
          <StartCombatButton selected={picked} />
          <CreaturesPanel selected={picked} onSelect={setPicked} />
        </>
      )}
      {tab === 'items' && <TablePanel characterId={null} />}
    </section>
  )
}

function RoomScreen() {
  const { data, loadError, fatal, isDm } = useRoom()
  const navigate = useNavigate()
  const location = useLocation()

  // токен не принят — на вход, вернёмся сюда же
  useEffect(() => {
    if (fatal === 'auth') navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true })
  }, [fatal, navigate, location.pathname])

  if (loadError) {
    return (
      <Notice
        title={loadError.status === 404 ? 'Комната не найдена' : 'Не удалось открыть комнату'}
        text={
          loadError.status === 404
            ? 'Либо её нет, либо заявка ещё не принята мастером: пока заявка в ожидании, комната закрыта для вас.'
            : loadError.message
        }
      />
    )
  }
  if (fatal && fatal !== 'auth') return <Notice title="Связь с комнатой потеряна" text={FATAL_TEXT[fatal] ?? 'Соединение закрыто.'} />
  if (!data) {
    return (
      <section className="rm-page">
        <p className="muted">Открываем комнату…</p>
      </section>
    )
  }

  if (isDm) return <DmRoom />
  const mine = data.me.room_character_id
  if (mine) return <PlayerRoom characterId={mine} />
  // игрок без героя (редкий случай): только партия и выход
  return (
    <section className="rm-page rm-room">
      <RoomHeader />
      <PartyView side={<LeavePanel />} />
    </section>
  )
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  // key: при смене комнаты состояние и сокет создаются заново
  return (
    <RoomProvider key={id} roomId={id}>
      <RoomDiceBridge>
        <RoomScreen />
        <ContentOverlay />
      </RoomDiceBridge>
    </RoomProvider>
  )
}
