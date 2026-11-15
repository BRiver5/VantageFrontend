/**
 * Точка подключения туров: связывает прогресс с пользователем, предлагает
 * «Первый вход» новичку и тур мастера или игрока при первом входе в комнату,
 * показывает список туров и идущий тур. Монтируется один раз в App.
 */
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { UserMe } from '../types/auth'
import { serverProgress } from './api'
import { at, tourById } from './content'
import { isRoomPath, query } from './dom'
import type { ProgressMap } from './types'
import { TourOverlay } from './TourOverlay'
import { TourPanel } from './TourPanel'
import { clearTourNotice, dismissOffer, getTourUi, offerTour, progressStore, setTourNavigator, startTour, useTourUi } from './store'
import { countLabel } from '../lib/plural'

/** «Первый вход» предлагаем только недавно зарегистрированным (и гостям) */
const NEW_USER_DAYS = 30
const NO_OFFER_PATHS = /^\/(login|register|__cw-preview)/

const isNewcomer = (user: UserMe | null) => !user || Date.now() - Date.parse(user.created_at) < NEW_USER_DAYS * 864e5

export function TourHost() {
  const { user, ready } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const ui = useTourUi()
  const userId = user?.id ?? null

  useEffect(() => {
    setTourNavigator((to) => navigate(to))
  }, [navigate])

  // прогресс: локальная копия + настройки пользователя на сервере
  useEffect(() => {
    if (!ready) return
    const tours = (user?.preferences as { tours?: ProgressMap } | undefined)?.tours
    progressStore.attach(userId, tours, serverProgress)
    // user целиком не в зависимостях: после PATCH /auth/me сливать заново не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId])

  // ненавязчивое предложение тура
  useEffect(() => {
    if (!ready || NO_OFFER_PATHS.test(pathname)) return
    const room = isRoomPath(pathname)
    if (!room && !isNewcomer(user)) return
    let tries = 0
    let timer = 0
    const check = () => {
      const ui = getTourUi()
      if (ui.run || ui.panel || ui.offer) return
      if (!room) return offerTour('first-visit')
      // стол грузится не сразу: ждём шапку комнаты до ~15 секунд
      if (!query(at('room-topbar'))) {
        if (++tries < 12) timer = window.setTimeout(check, 1200)
        return
      }
      offerTour(query(at('gm-screen')) ? 'gm-room' : 'player-table')
    }
    timer = window.setTimeout(check, room ? 2500 : 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, pathname])

  // сообщение после тура гаснет само
  useEffect(() => {
    if (!ui.notice) return
    const t = window.setTimeout(clearTourNotice, 4500)
    return () => clearTimeout(t)
  }, [ui.notice])

  return (
    <>
      {ui.run && <TourOverlay key={ui.run.tourId} run={ui.run} />}
      {ui.panel && <TourPanel />}
      {ui.offer && <TourOffer id={ui.offer} />}
      {ui.notice && (
        <p className="tour-toast tour-notice" role="status">
          {ui.notice}
        </p>
      )}
    </>
  )
}

function TourOffer({ id }: { id: string }) {
  const tour = tourById(id)
  if (!tour) return null
  return (
    <aside className="tour-toast" role="complementary" aria-label="Предложение тура">
      <Compass aria-hidden="true" className="tour-toast-ico" />
      <div className="tour-toast-body">
        <b>Показать, как тут всё устроено?</b>
        <span>
          Тур «{tour.title}» — {countLabel(tour.steps.length, ['короткий шаг', 'коротких шага', 'коротких шагов'])}
        </span>
        <div className="tour-toast-acts">
          <button type="button" className="tour-btn" onClick={() => startTour(id)}>
            Показать
          </button>
          <button type="button" className="tour-btn is-ghost" onClick={dismissOffer}>
            Не сейчас
          </button>
        </div>
      </div>
      <button type="button" className="tour-x" onClick={dismissOffer} aria-label="Скрыть предложение">
        <X aria-hidden="true" />
      </button>
    </aside>
  )
}
