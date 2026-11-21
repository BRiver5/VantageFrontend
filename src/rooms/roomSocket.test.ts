import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomSocket, type SocketStatus } from './roomSocket'
import { StateReloader } from './roomSync'
import type { RoomState } from '../types/rooms'

/** Поддельный WebSocket: тесты сами отвечают за сервер */
class FakeWs {
  static OPEN = 1
  static last: FakeWs | null = null
  readyState = 0
  sent: { type: string; after_seq?: number }[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeWs.last = this
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw))
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  recv(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
  syncs() {
    return this.sent.filter((m) => m.type === 'sync').map((m) => m.after_seq)
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeWs)
  vi.stubGlobal('document', { addEventListener: () => undefined, removeEventListener: () => undefined, visibilityState: 'visible' })
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined })
  vi.stubGlobal('location', { origin: 'http://localhost' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Сокет и перезагрузка, связанные так же, как в RoomProvider */
function setup(loadSeqs: number[]) {
  let seq = 5
  let i = 0
  const statuses: SocketStatus[] = []
  const synced: number[] = []
  const load = vi.fn(async () => ({ seq: loadSeqs[Math.min(i++, loadSeqs.length - 1)] }) as unknown as RoomState)
  let socket: RoomSocket | null = null
  const reloader = new StateReloader({ load, apply: (s) => (seq = s.seq), resync: () => socket?.requestSync() })
  socket = new RoomSocket({
    roomId: 'r1',
    getToken: () => 'tok',
    getAfterSeq: () => seq,
    onEvent: () => undefined,
    onStatus: (s) => statuses.push(s),
    onReset: () => reloader.onReset(),
    onSynced: (s) => {
      reloader.onSynced()
      synced.push(s)
    },
  })
  socket.start()
  const ws = FakeWs.last!
  ws.open()
  ws.recv({ v: 1, type: 'hello', seq: 500, role: 'player', user_id: 'u' })
  return { socket, ws, load, statuses, synced, getSeq: () => seq }
}

describe('RoomSocket sync.reset', () => {
  it('reloads state once and re-syncs from the fresh seq', async () => {
    const t = setup([500])
    expect(t.ws.syncs()).toEqual([5])
    t.ws.recv({ v: 1, type: 'sync.reset', seq: 500 })
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
    expect(t.getSeq()).toBe(500)
    expect(t.ws.syncs()).toEqual([5, 500])
    // пока снимок перечитывается и sync не закончен — статус «syncing»
    expect(t.statuses.at(-1)).toBe('syncing')
    t.ws.recv({ v: 1, type: 'sync.done', seq: 500, has_more: false })
    expect(t.statuses.at(-1)).toBe('open')
    t.socket.stop()
  })

  it('a reset at our own seq ends the sync without another reload', async () => {
    const t = setup([500])
    t.ws.recv({ v: 1, type: 'sync.reset', seq: 500 })
    await flush()
    // сервер повторил reset на sync{after_seq: 500}: мы уже не отстаём
    t.ws.recv({ v: 1, type: 'sync.reset', seq: 500 })
    await flush()
    await vi.advanceTimersByTimeAsync(60000)
    expect(t.load).toHaveBeenCalledTimes(1)
    expect(t.ws.syncs()).toEqual([5, 500])
    expect(t.statuses.at(-1)).toBe('open')
    expect(t.synced).toEqual([500])
    t.socket.stop()
  })

  it('repeated resets with a growing seq back off instead of looping', async () => {
    const t = setup([500, 510, 520])
    t.ws.recv({ v: 1, type: 'sync.reset', seq: 500 })
    await flush()
    t.ws.recv({ v: 1, type: 'sync.reset', seq: 510 })
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.load).toHaveBeenCalledTimes(2)
    expect(t.ws.syncs()).toEqual([5, 500, 510])
    t.socket.stop()
  })

  it('reset is not passed on as a room event', async () => {
    const onEvent = vi.fn()
    const socket = new RoomSocket({ roomId: 'r1', getToken: () => 'tok', getAfterSeq: () => 1, onEvent })
    socket.start()
    const ws = FakeWs.last!
    ws.open()
    ws.recv({ v: 1, type: 'hello', seq: 9, role: 'player', user_id: 'u' })
    ws.recv({ v: 1, type: 'sync.reset', seq: 9 })
    expect(onEvent).not.toHaveBeenCalled()
    socket.stop()
  })
})
