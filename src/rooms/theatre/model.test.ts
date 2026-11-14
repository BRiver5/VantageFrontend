import { describe, expect, it } from 'vitest'
import type { RoomEventMessage } from '../../types/rooms'
import { initialTheatre, theatreReduce, visibleShow, type TheatreShow } from './model'

const show = (id: string, kind: TheatreShow['kind'] = 'speech'): TheatreShow => ({
  id,
  kind,
  name: 'Страж',
  text: 'Стой!',
  shown_at: '2026-11-14T10:00:00Z',
  by: { user_id: 'dm', label: 'Мастер' },
})
const ev = (type: string, payload: unknown, seq = 1): RoomEventMessage => ({ v: 1, seq, type, payload })

describe('сцена для всех: состояние', () => {
  it('ответ GET показывает текущий показ', () => {
    const s = theatreReduce(initialTheatre, { type: 'loaded', show: show('a') })
    expect(visibleShow(s)?.id).toBe('a')
    expect(visibleShow(theatreReduce(initialTheatre, { type: 'loaded', show: null }))).toBeNull()
  })

  it('событие новее ответа GET: опоздавший ответ не затирает', () => {
    let s = theatreReduce(initialTheatre, { type: 'event', msg: ev('theatre.shown', { show: show('b') }) })
    s = theatreReduce(s, { type: 'loaded', show: show('a') })
    expect(visibleShow(s)?.id).toBe('b')
    s = theatreReduce(initialTheatre, { type: 'event', msg: ev('theatre.cleared', { id: 'zzz' }) })
    expect(theatreReduce(s, { type: 'loaded', show: show('old') }).show).toBeNull()
  })

  it('новый показ заменяет прежний и снимает «закрыл у себя»', () => {
    let s = theatreReduce(initialTheatre, { type: 'event', msg: ev('theatre.shown', { show: show('a') }) })
    s = theatreReduce(s, { type: 'dismiss' })
    expect(visibleShow(s)).toBeNull()
    s = theatreReduce(s, { type: 'event', msg: ev('theatre.shown', { show: show('b', 'narration') }) })
    expect(visibleShow(s)?.kind).toBe('narration')
  })

  it('мастер убрал показ у всех; чужой id не трогает текущий', () => {
    let s = theatreReduce(initialTheatre, { type: 'event', msg: ev('theatre.shown', { show: show('a') }) })
    s = theatreReduce(s, { type: 'event', msg: ev('theatre.cleared', { id: 'other' }) })
    expect(visibleShow(s)?.id).toBe('a')
    s = theatreReduce(s, { type: 'event', msg: ev('theatre.cleared', { id: 'a' }) })
    expect(s.show).toBeNull()
  })

  it('мусор и чужие события не меняют состояние', () => {
    const s = theatreReduce(initialTheatre, { type: 'event', msg: ev('theatre.shown', { show: { id: 1 } }) })
    expect(s).toBe(initialTheatre)
    expect(theatreReduce(initialTheatre, { type: 'event', msg: ev('chat.message', {}) })).toBe(initialTheatre)
    expect(theatreReduce(initialTheatre, { type: 'dismiss' })).toBe(initialTheatre)
  })
})
