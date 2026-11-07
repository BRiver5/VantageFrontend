/**
 * Клиент WebSocket комнаты. Порядок по контракту:
 *   auth (токен, в течение 5 с) → hello → sync{after_seq} → события → sync.done
 * Если в sync.done has_more, повторяем sync с новым seq. При обрыве
 * переподключаемся с растущей паузой и снова делаем sync с последним
 * обработанным seq — его хранит вызывающий (RoomProvider), сокет только спрашивает.
 *
 * Через /api на проде сокет не заработает (rewrite Vercel не проксирует
 * WebSocket), поэтому адрес берётся из VITE_WS_BASE — прямой адрес сервера.
 */
import type { RoomEventMessage } from '../types/rooms'

export type SocketStatus = 'connecting' | 'syncing' | 'open' | 'reconnecting' | 'closed'
/** Причина, по которой переподключаться бессмысленно */
export type FatalReason = 'auth' | 'not_member' | 'kicked' | 'unreachable'

export interface RoomSocketOptions {
  roomId: string
  getToken: () => string | null
  /** последний обработанный номер события */
  getAfterSeq: () => number
  onEvent: (msg: RoomEventMessage) => void
  onStatus?: (status: SocketStatus) => void
  onFatal?: (reason: FatalReason) => void
  /** после каждого завершённого sync (в том числе первого) */
  onSynced?: (serverSeq: number) => void
  /** hello пришёл: сервер подтвердил роль */
  onHello?: (info: { seq: number; role: string; user_id: string }) => void
}

/** Служебные сообщения, которые не относятся к событиям комнаты */
type ControlMessage =
  | { type: 'hello'; seq: number; role: string; user_id: string }
  | { type: 'sync.done'; seq: number; has_more: boolean }
  | { type: 'pong' }
  | { type: 'ping' }

const HELLO_TIMEOUT_MS = 8000
const HEARTBEAT_MS = 20000
const PONG_TIMEOUT_MS = 10000
const BACKOFF = [1000, 2000, 4000, 8000, 15000]
/** Подряд столько неудач без единого hello — считаем сервер недоступным */
const MAX_FAILS_BEFORE_FATAL = 12

const PROD_WS_BASE = 'wss://vantage-api-production-0324.up.railway.app/api'

export function wsBase(): string {
  const env = (import.meta.env.VITE_WS_BASE as string | undefined)?.replace(/\/+$/, '')
  if (env) return env
  // На проде rewrite Vercel не проксирует WebSocket: без адреса сервера сокет не откроется
  // и страница будет обновляться только перезагрузкой.
  if (import.meta.env.PROD) return PROD_WS_BASE
  return `${location.origin.replace(/^http/, 'ws')}/api`
}

export class RoomSocket {
  private ws: WebSocket | null = null
  private status: SocketStatus = 'closed'
  private stopped = false
  private fails = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private helloTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private lastRolling = 0
  private onVisible = () => {
    if (document.visibilityState === 'visible' && this.status !== 'open' && this.status !== 'syncing') this.reconnectNow()
  }
  private onOnline = () => this.reconnectNow()

  private readonly opts: RoomSocketOptions

  constructor(opts: RoomSocketOptions) {
    this.opts = opts
  }

  start() {
    this.stopped = false
    document.addEventListener('visibilitychange', this.onVisible)
    window.addEventListener('online', this.onOnline)
    this.connect()
  }

  stop() {
    this.stopped = true
    document.removeEventListener('visibilitychange', this.onVisible)
    window.removeEventListener('online', this.onOnline)
    this.clearTimers()
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close(1000)
      } catch {
        /* уже закрыт */
      }
    }
    this.setStatus('closed')
  }

  /** Догнать пропущенное: например, после дыры в нумерации */
  requestSync() {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.send({ type: 'sync', after_seq: this.opts.getAfterSeq() })
  }

  /** Начало анимации броска у других; лишнее чаще 5 раз в секунду сервер отбросит, не шлём сами */
  sendRolling(label: string) {
    const now = Date.now()
    if (now - this.lastRolling < 200) return
    this.lastRolling = now
    this.send({ type: 'dice.rolling', label })
  }

  /** Файлы контента загружены */
  /** Эфемерное сообщение (map.drag, map.aim, map.ping): без seq, лишнее сервер отбрасывает */
  sendEphemeral(obj: { type: string } & Record<string, unknown>) {
    this.send(obj)
  }

  sendClientReady(contentId: string) {
    this.send({ type: 'client.ready', content_id: contentId })
  }

  getStatus(): SocketStatus {
    return this.status
  }

  /* ---------- внутреннее ---------- */

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  private setStatus(s: SocketStatus) {
    if (this.status === s) return
    this.status = s
    this.opts.onStatus?.(s)
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.helloTimer) clearTimeout(this.helloTimer)
    if (this.pongTimer) clearTimeout(this.pongTimer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.reconnectTimer = this.helloTimer = this.pongTimer = this.heartbeat = null
  }

  private connect() {
    if (this.stopped) return
    const token = this.opts.getToken()
    if (!token) {
      this.opts.onFatal?.('auth')
      return
    }
    this.setStatus(this.fails === 0 && this.status !== 'reconnecting' ? 'connecting' : 'reconnecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(`${wsBase()}/rooms/${this.opts.roomId}/ws`)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      // первое сообщение — токен; сервер ждёт его 5 секунд
      ws.send(JSON.stringify({ type: 'auth', token }))
      this.helloTimer = setTimeout(() => ws.close(4000), HELLO_TIMEOUT_MS)
    }
    ws.onmessage = (e) => this.handle(e.data)
    ws.onerror = () => {
      /* подробностей браузер не даёт; следом придёт close */
    }
    ws.onclose = (e) => {
      if (this.ws !== ws) return
      this.ws = null
      this.clearTimers()
      this.onClosed(e.code)
    }
  }

  private handle(raw: unknown) {
    if (typeof raw !== 'string') return
    let msg: { type?: string }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    switch (msg.type) {
      case 'hello': {
        const m = msg as Extract<ControlMessage, { type: 'hello' }>
        if (this.helloTimer) clearTimeout(this.helloTimer)
        this.helloTimer = null
        this.fails = 0
        this.setStatus('syncing')
        this.opts.onHello?.({ seq: m.seq, role: m.role, user_id: m.user_id })
        this.startHeartbeat()
        this.send({ type: 'sync', after_seq: this.opts.getAfterSeq() })
        return
      }
      case 'sync.done': {
        const m = msg as Extract<ControlMessage, { type: 'sync.done' }>
        if (m.has_more) {
          this.send({ type: 'sync', after_seq: this.opts.getAfterSeq() })
          return
        }
        this.setStatus('open')
        this.opts.onSynced?.(m.seq)
        return
      }
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer)
        this.pongTimer = null
        return
      case 'ping':
        // сервер сам пингует при тишине; отвечать не нужно
        return
      default:
        this.opts.onEvent(msg as RoomEventMessage)
    }
  }

  /** Своя проверка живости: тихо оборванное соединение иначе висит «открытым» */
  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      this.send({ type: 'ping' })
      if (this.pongTimer) clearTimeout(this.pongTimer)
      this.pongTimer = setTimeout(() => this.ws?.close(4000), PONG_TIMEOUT_MS)
    }, HEARTBEAT_MS)
  }

  private onClosed(code: number) {
    if (this.stopped) return
    if (code === 4401) return this.opts.onFatal?.('auth')
    if (code === 4404) return this.opts.onFatal?.('not_member')
    if (code === 4403) return this.opts.onFatal?.('kicked')
    // 4409 — клиент не успевал читать: сразу назад и sync; остальное — обрыв
    if (code === 4409) return this.reconnectNow()
    this.fails += 1
    if (this.fails > MAX_FAILS_BEFORE_FATAL) return this.opts.onFatal?.('unreachable')
    this.scheduleReconnect()
  }

  private scheduleReconnect() {
    this.setStatus('reconnecting')
    const base = BACKOFF[Math.min(this.fails - 1, BACKOFF.length - 1)] ?? BACKOFF[0]
    const delay = base + Math.random() * 400
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private reconnectNow() {
    if (this.stopped) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      const ws = this.ws
      this.ws = null
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close(1000)
      } catch {
        /* уже закрыт */
      }
    }
    this.clearTimers()
    this.connect()
  }
}
