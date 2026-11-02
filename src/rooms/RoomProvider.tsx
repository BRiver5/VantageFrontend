/**
 * Состояние одной комнаты: снимок REST + поток событий WebSocket.
 *
 * Порядок по контракту: GET /state → подключение → hello → sync{after_seq = seq
 * снимка} → события. Экран обновляют только события; ответ REST ничего не меняет.
 * Номер события может прийти дважды (при sync) — пропускаем всё, что не больше
 * последнего обработанного. Пропущенный номер (дыра) значит потерю: событие не
 * применяем и просим sync, он доставит всё заново по порядку.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../api'
import { getAccessToken } from '../auth/token'
import type { RoomEventMessage, RoomState } from '../types/rooms'
import { applyEvent, describeEvent, fromSnapshot, pushLog, type RoomData } from './applyEvent'
import { getRoomState } from './roomsApi'
import { RoomSocket, type FatalReason, type SocketStatus } from './roomSocket'

type Action =
  | { type: 'snapshot'; state: RoomState }
  | { type: 'event'; msg: RoomEventMessage }
  /** код приглашения приходит только в ответе REST: в room.updated его нет */
  | { type: 'invite'; code: string }

function reduce(state: RoomData | null, action: Action): RoomData | null {
  if (action.type === 'snapshot') return fromSnapshot(action.state, state?.log)
  if (!state) return state
  if (action.type === 'invite') return { ...state, room: { ...state.room, invite_code: action.code } }
  const next = applyEvent(state, action.msg)
  const entry = describeEvent(next, action.msg)
  return entry ? pushLog(next, entry) : next
}

export interface RoomLoadError {
  status: number
  message: string
}

export interface RoomContextValue {
  roomId: string
  /** null, пока не пришёл снимок */
  data: RoomData | null
  loadError: RoomLoadError | null
  link: SocketStatus
  /** причина, по которой соединение не восстановить: пора уйти с экрана */
  fatal: FatalReason | null
  isDm: boolean
  /** подписка на каждое применённое событие (броски, контент, бой): для анимаций */
  subscribe: (fn: (msg: RoomEventMessage) => void) => () => void
  /** анимация броска у других; лишнее чаще 5 раз в секунду не отправляется */
  sendRolling: (label: string) => void
  /** файлы контента загружены */
  sendClientReady: (contentId: string) => void
  /** перечитать снимок (после конфликта 409 и т.п.) и догнать события */
  refresh: () => Promise<void>
  /** запомнить новый код приглашения после его смены */
  setInviteCode: (code: string) => void
}

const RoomContext = createContext<RoomContextValue | null>(null)

export function RoomProvider({ roomId, children }: { roomId: string; children: ReactNode }) {
  const [data, dispatch] = useReducer(reduce, null)
  const [loadError, setLoadError] = useState<RoomLoadError | null>(null)
  const [link, setLink] = useState<SocketStatus>('connecting')
  const [fatal, setFatal] = useState<FatalReason | null>(null)

  const lastSeq = useRef(0)
  const syncPending = useRef(false)
  const socketRef = useRef<RoomSocket | null>(null)
  const listeners = useRef(new Set<(msg: RoomEventMessage) => void>())

  const emit = useCallback((msg: RoomEventMessage) => {
    for (const fn of listeners.current) {
      try {
        fn(msg)
      } catch (e) {
        console.error('room listener', e)
      }
    }
  }, [])

  const handleEvent = useCallback(
    (msg: RoomEventMessage) => {
      if (msg.seq != null) {
        if (msg.seq <= lastSeq.current) return
        if (msg.seq > lastSeq.current + 1) {
          // дыра: применять нельзя, иначе sync потом отбросит пропущенное как «старое»
          if (!syncPending.current) {
            syncPending.current = true
            socketRef.current?.requestSync()
          }
          return
        }
        lastSeq.current = msg.seq
      }
      dispatch({ type: 'event', msg })
      if (msg.type !== 'noop') emit(msg)
    },
    [emit],
  )

  useEffect(() => {
    let cancelled = false
    lastSeq.current = 0
    syncPending.current = false
    setLoadError(null)
    setFatal(null)

    getRoomState(roomId)
      .then((state) => {
        if (cancelled) return
        lastSeq.current = state.seq
        dispatch({ type: 'snapshot', state })
        const socket = new RoomSocket({
          roomId,
          getToken: getAccessToken,
          getAfterSeq: () => lastSeq.current,
          onEvent: handleEvent,
          onStatus: (s) => !cancelled && setLink(s),
          onFatal: (reason) => !cancelled && setFatal(reason),
          onHello: () => {
            syncPending.current = true
          },
          onSynced: () => {
            syncPending.current = false
          },
        })
        socketRef.current = socket
        socket.start()
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const status = e instanceof ApiError ? e.status : 0
        setLoadError({ status, message: e instanceof Error ? e.message : 'Не удалось открыть комнату' })
      })

    return () => {
      cancelled = true
      socketRef.current?.stop()
      socketRef.current = null
    }
  }, [roomId, handleEvent])

  const subscribe = useCallback((fn: (msg: RoomEventMessage) => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const refresh = useCallback(async () => {
    const state = await getRoomState(roomId)
    // события после снимка сервер пришлёт заново; применение идемпотентно
    lastSeq.current = state.seq
    dispatch({ type: 'snapshot', state })
    syncPending.current = true
    socketRef.current?.requestSync()
  }, [roomId])

  const value = useMemo<RoomContextValue>(
    () => ({
      roomId,
      data,
      loadError,
      link,
      fatal,
      isDm: data?.me.role === 'dm',
      subscribe,
      sendRolling: (label) => socketRef.current?.sendRolling(label),
      sendClientReady: (id) => socketRef.current?.sendClientReady(id),
      refresh,
      setInviteCode: (code) => dispatch({ type: 'invite', code }),
    }),
    [roomId, data, loadError, link, fatal, subscribe, refresh],
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom вне RoomProvider')
  return ctx
}

/** Для компонентов, которые работают и в комнате, и вне её (лоток костей, лист) */
export function useRoomOptional(): RoomContextValue | null {
  return useContext(RoomContext)
}

/** Подписка на события комнаты; обработчик может меняться без переподписки */
export function useRoomEvents(handler: (msg: RoomEventMessage) => void): void {
  const room = useRoomOptional()
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  const subscribe = room?.subscribe
  useEffect(() => {
    if (!subscribe) return
    return subscribe((msg) => ref.current(msg))
  }, [subscribe])
}
