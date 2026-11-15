import { describe, expect, it, vi } from 'vitest'
import { localKey, mergeProgress, parseProgress, ProgressStore, type KeyValueStorage, type ProgressBackend } from './progress'

function memory(init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    },
  }
}

function backend(): ProgressBackend & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    save: async (id, p) => calls.push(`save ${id} ${p.status} ${p.step}`),
    reset: async (id) => calls.push(`reset ${id}`),
    resetAll: async () => calls.push('resetAll'),
  }
}

let clock = 0
const tick = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString()

describe('прогресс туров', () => {
  it('битые записи отбрасываются', () => {
    expect(parseProgress({ a: { status: 'completed', step: 2 }, b: { status: 'nope' }, c: null, d: { status: 'offered', step: -3 } })).toEqual({
      a: { status: 'completed', step: 2, updated_at: null },
      d: { status: 'offered', step: 0, updated_at: null },
    })
    expect(parseProgress('мусор')).toEqual({})
  })

  it('слияние: свежее побеждает, при равенстве — продвинутее', () => {
    const old = { status: 'completed' as const, step: 3, updated_at: '2026-01-01T00:00:00Z' }
    const fresh = { status: 'in_progress' as const, step: 1, updated_at: '2026-02-01T00:00:00Z' }
    expect(mergeProgress({ a: old }, { a: fresh }).a).toBe(fresh)
    expect(mergeProgress({ a: fresh }, { a: old }).a).toBe(fresh)
    const offered = { status: 'offered' as const, step: 0 }
    const done = { status: 'completed' as const, step: 2 }
    expect(mergeProgress({ a: offered }, { a: done }).a).toBe(done)
  })

  it('без входа: только localStorage', () => {
    const storage = memory()
    const store = new ProgressStore(storage, tick)
    store.set('first-visit', { status: 'in_progress', step: 2 })
    expect(JSON.parse(storage.data[localKey(null)])['first-visit']).toMatchObject({ status: 'in_progress', step: 2 })
    expect(new ProgressStore(storage).get('first-visit')?.step).toBe(2)
  })

  it('вход: данные сервера, пройденное до входа досылается', () => {
    const storage = memory({ [localKey(null)]: JSON.stringify({ local: { status: 'completed', step: 4, updated_at: '2026-03-01T00:00:00Z' } }) })
    const api = backend()
    const store = new ProgressStore(storage, tick)
    store.attach('u1', { remote: { status: 'in_progress', step: 1, updated_at: '2026-03-01T00:00:00Z' } }, api)
    expect(store.get('remote')?.step).toBe(1)
    expect(store.get('local')?.status).toBe('completed')
    expect(api.calls).toEqual(['save local completed 4'])
    expect(storage.data[localKey(null)]).toBeUndefined()
    expect(storage.data[localKey('u1')]).toContain('remote')
  })

  it('свежая серверная запись не перезаписывается старой локальной', () => {
    const storage = memory({ [localKey('u1')]: JSON.stringify({ a: { status: 'in_progress', step: 1, updated_at: '2026-01-01T00:00:00Z' } }) })
    const api = backend()
    const store = new ProgressStore(storage, tick)
    store.attach('u1', { a: { status: 'completed', step: 3, updated_at: '2026-05-01T00:00:00Z' } }, api)
    expect(store.get('a')?.status).toBe('completed')
    expect(api.calls).toEqual([])
  })

  it('сохранение, сброс одного и всех уходят на сервер', () => {
    const api = backend()
    const store = new ProgressStore(memory(), tick)
    store.attach('u1', {}, api)
    store.set('a', { status: 'completed', step: 3 })
    store.set('b', { status: 'in_progress', step: 1 })
    store.reset('a')
    store.reset('missing')
    expect(store.get('a')).toBeNull()
    store.resetAll()
    expect(store.snapshot).toEqual({})
    expect(api.calls).toEqual(['save a completed 3', 'save b in_progress 1', 'reset a', 'resetAll'])
  })

  it('после выхода сервер больше не вызывается', () => {
    const api = backend()
    const store = new ProgressStore(memory(), tick)
    store.attach('u1', {}, api)
    store.attach(null, null, api)
    store.set('a', { status: 'completed', step: 1 })
    expect(api.calls).toEqual([])
  })

  it('предложение отмечается один раз и не затирает прогресс', () => {
    const store = new ProgressStore(memory(), tick)
    store.set('a', { status: 'completed', step: 3 })
    store.markOffered('a')
    store.markOffered('b')
    expect(store.get('a')?.status).toBe('completed')
    expect(store.get('b')?.status).toBe('offered')
  })

  it('ошибка сервера и недоступное хранилище не ломают прогресс', async () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    const api: ProgressBackend = {
      save: () => Promise.reject(new Error('offline')),
      reset: () => Promise.reject(new Error('offline')),
      resetAll: () => Promise.reject(new Error('offline')),
    }
    const store = new ProgressStore(broken, tick)
    store.attach('u1', null, api)
    store.set('a', { status: 'in_progress', step: 1 })
    await Promise.resolve()
    expect(store.get('a')?.step).toBe(1)
  })

  it('подписчики узнают об изменениях', () => {
    const store = new ProgressStore(null, tick)
    const fn = vi.fn()
    const off = store.subscribe(fn)
    store.set('a', { status: 'offered', step: 0 })
    off()
    store.resetAll()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
