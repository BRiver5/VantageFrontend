import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomEventMessage, RoomState } from '../types/rooms'
import { RESET_BACKOFF, StateReloader, catchUpViaRest } from './roomSync'

const state = (seq: number): RoomState => ({ seq }) as unknown as RoomState
const ev = (seq: number): RoomEventMessage => ({ v: 1, type: 'noop', seq, payload: {} }) as unknown as RoomEventMessage

/** Провайдер в миниатюре: seq, снимки и sync-запросы */
function setup(loadSeqs: number[] = [100]) {
  let seq = 5
  const applied: number[] = []
  const syncs: number[] = []
  let i = 0
  const load = vi.fn(async () => state(loadSeqs[Math.min(i++, loadSeqs.length - 1)]))
  const reloader = new StateReloader({
    load,
    apply: (s) => {
      seq = s.seq
      applied.push(s.seq)
    },
    resync: () => syncs.push(seq),
  })
  return { reloader, load, applied, syncs, getSeq: () => seq, setSeq: (n: number) => (seq = n) }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('StateReloader', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reset reloads state once and re-syncs from the fresh seq', async () => {
    const t = setup([100])
    t.reloader.onReset()
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
    expect(t.applied).toEqual([100])
    expect(t.syncs).toEqual([100])
  })

  it('keeps a single reload in flight', async () => {
    const t = setup([100])
    t.reloader.onReset()
    t.reloader.onReset()
    const p = t.reloader.reload()
    t.reloader.onReset()
    await p
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
    expect(t.syncs).toEqual([100])
  })

  it('backs off on repeated resets instead of spinning', async () => {
    const t = setup([100, 101, 102])
    t.reloader.onReset()
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
    // сразу после перезагрузки снова reset: новая — только после паузы
    t.reloader.onReset()
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
    // пока пауза идёт, новые reset ничего не добавляют
    t.reloader.onReset()
    t.reloader.onReset()
    await vi.advanceTimersByTimeAsync(RESET_BACKOFF[1])
    expect(t.load).toHaveBeenCalledTimes(2)
    t.reloader.onReset()
    await vi.advanceTimersByTimeAsync(RESET_BACKOFF[2] - 1)
    expect(t.load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.load).toHaveBeenCalledTimes(3)
    expect(t.syncs).toEqual([100, 101, 102])
  })

  it('a normal sync clears the backoff', async () => {
    const t = setup([100, 200])
    t.reloader.onReset()
    await flush()
    t.reloader.onSynced()
    t.reloader.onReset()
    await flush()
    expect(t.load).toHaveBeenCalledTimes(2)
  })

  it('retries a failed reload with a pause', async () => {
    const t = setup([100])
    const errors: unknown[] = []
    const load = vi.fn<() => Promise<RoomState>>().mockRejectedValueOnce(new Error('сеть')).mockResolvedValue(state(100))
    const reloader = new StateReloader({ load, apply: () => undefined, resync: () => t.syncs.push(1), onError: (e) => errors.push(e) })
    reloader.onReset()
    await flush()
    expect(errors).toHaveLength(1)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RESET_BACKOFF[1])
    expect(load).toHaveBeenCalledTimes(2)
    expect(t.syncs).toEqual([1])
  })

  it('does nothing after dispose', async () => {
    const t = setup([100])
    t.reloader.onReset()
    t.reloader.dispose()
    await flush()
    expect(t.applied).toEqual([])
    expect(t.syncs).toEqual([])
  })
})

describe('catchUpViaRest', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('applies pages until a short one', async () => {
    const t = setup()
    const seen: number[] = []
    const fetchPage = vi.fn(async (after: number) => ({ items: after < 7 ? [ev(after + 1), ev(after + 2)] : [ev(after + 1)], reset: false }))
    const res = await catchUpViaRest({
      fetchPage,
      getSeq: t.getSeq,
      onEvent: (m) => {
        seen.push(m.seq!)
        t.setSeq(m.seq!)
      },
      reloader: t.reloader,
      limit: 2,
    })
    expect(res).toBe('done')
    expect(seen).toEqual([6, 7, 8])
    expect(t.load).not.toHaveBeenCalled()
  })

  it('REST reset reloads state once and does not apply items', async () => {
    const t = setup([100])
    const onEvent = vi.fn()
    const fetchPage = vi.fn(async () => ({ items: [], reset: true }))
    const res = await catchUpViaRest({ fetchPage, getSeq: t.getSeq, onEvent, reloader: t.reloader, limit: 200 })
    await flush()
    expect(res).toBe('reset')
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(onEvent).not.toHaveBeenCalled()
    expect(t.load).toHaveBeenCalledTimes(1)
    expect(t.syncs).toEqual([100])
    // повторный reset сразу после перезагрузки — не крутимся
    await catchUpViaRest({ fetchPage, getSeq: t.getSeq, onEvent, reloader: t.reloader, limit: 200 })
    await flush()
    expect(t.load).toHaveBeenCalledTimes(1)
  })
})
