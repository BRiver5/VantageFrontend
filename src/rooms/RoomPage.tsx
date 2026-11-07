/**
 * Экран комнаты (/rooms/:id) — полноэкранная игровая сцена без обвязки сайта.
 * Главная страница — стол; когда мастер начинает бой, стол сменяется отдельной
 * сценой боя. Лист героя выезжает поверх (?hero=me или ?hero=<id> у мастера).
 * Мастер играет только с компьютера, игрок — с компьютера или телефона.
 */
import { RoomAudioPlayer } from './RoomAudio'
import { RoomClocks } from './Clocks'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, DoorOpen, Monitor } from 'lucide-react'
import { RotateGate } from '../characters/GameHud'
import { useAppShell } from '../shell'
import { ContentOverlay } from './Content'
import { RoomHero } from './RoomCharacter'
import { RoomDiceBridge } from './RoomDice'
import { RoomProvider, useRoom } from './RoomProvider'
import { BattleIntro, BattleOutro, BattleScene } from './table/BattleScene'
import { DmScreen } from './table/DmScreen'
import { TableScene } from './table/TableScene'

const FATAL_TEXT: Record<string, string> = {
  not_member: 'Вы не участник этой комнаты.',
  kicked: 'Вас исключили из комнаты, либо комнату удалили.',
  unreachable: 'Не удаётся подключиться к серверу. Проверьте соединение и откройте комнату заново.',
}

function Notice({ title, text, icon: Icon = DoorOpen }: { title: string; text: string; icon?: typeof DoorOpen }) {
  return (
    <section className="rm-page rm-notice-page">
      <Icon aria-hidden="true" />
      <h1 className="section-title gold-text">{title}</h1>
      <p>{text}</p>
      <Link to="/rooms" className="cs-btn">
        К комнатам
      </Link>
    </section>
  )
}

/** Пока открыта сцена, сайт вокруг неё прячется */
function useSceneChrome(view: 'table' | 'battle' | 'sheet') {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.room = '1'
    return () => {
      delete root.dataset.room
      delete root.dataset.roomView
    }
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.roomView = view
  }, [view])
}

/** Лист поверх сцены: на компьютере — выезжающая страница, на телефоне — экран героя */
function SheetOver({ characterId, backTo }: { characterId: string; backTo: string }) {
  const { app } = useAppShell()
  if (app) return <RoomHero characterId={characterId} />
  return (
    <div className="tb-sheetview" role="dialog" aria-label="Лист героя">
      <Link to={backTo} className="tb-sheetview-back">
        <ChevronDown aria-hidden="true" /> К столу
      </Link>
      <div className="tb-sheetview-in">
        <RoomHero characterId={characterId} />
      </div>
    </div>
  )
}

function Stage() {
  const { data, roomId, isDm } = useRoom()
  const { app, rotate, coarse } = useAppShell()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const heroParam = params.get('hero')
  const mine = data?.me.room_character_id ?? null
  const heroId = heroParam === 'me' ? mine : heroParam
  const validHero = heroId && (data?.characters.some((c) => c.id === heroId) ?? false) ? heroId : null
  const inCombat = !!data?.combat && data.combat.status !== 'ended'

  useSceneChrome(validHero ? 'sheet' : inCombat ? 'battle' : 'table')

  // смена сцены сопровождается заставкой; при первом открытии её нет
  const prev = useRef(inCombat)
  const [fx, setFx] = useState<'intro' | 'outro' | null>(null)
  useEffect(() => {
    if (prev.current === inCombat) return
    prev.current = inCombat
    setFx(inCombat ? 'intro' : 'outro')
  }, [inCombat])
  const clearFx = useCallback(() => setFx(null), [])

  const openSheet = mine ? () => navigate(`/rooms/${roomId}?hero=me`) : undefined

  if (app && isDm) {
    return <Notice icon={Monitor} title="Ширма ждёт за компьютером" text="Мастер ведёт игру только с компьютера: на телефоне ширме и столу не хватит места. Откройте эту комнату на большом экране." />
  }
  if (rotate) return <RotateGate coarse={coarse} text="Стол и лист героя созданы для горизонтального экрана: так всё важное видно сразу, без прокрутки." backTo="/rooms" backLabel="К комнатам" />
  if (!data) return null

  return (
    <>
      {inCombat ? <BattleScene onSheet={openSheet} /> : <TableScene onSheet={openSheet} />}
      <RoomClocks />
      <RoomAudioPlayer />
      {isDm && <DmScreen />}
      {validHero && <SheetOver characterId={validHero} backTo={`/rooms/${roomId}`} />}
      {fx === 'intro' && <BattleIntro onDone={clearFx} />}
      {fx === 'outro' && <BattleOutro onDone={clearFx} />}
    </>
  )
}

function RoomScreen() {
  const { data, loadError, fatal } = useRoom()
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
  return <Stage />
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
