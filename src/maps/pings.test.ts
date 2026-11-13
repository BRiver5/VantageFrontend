import { describe, expect, it } from 'vitest'
import { ALERT_COLOR, PAN_COLOR, edgeArrow, parsePing, pingColor, pingKindFor, pingLife, userColor } from './pings'

describe('pings', () => {
  it('старый пинг без kind — обычный', () => {
    expect(parsePing({ map_id: 'm', x: 10, y: 20, user_id: 'u' })).toEqual({ mapId: 'm', at: { x: 10, y: 20 }, kind: 'basic', color: null, zoom: null, userId: 'u' })
  })

  it('разбирает вид, масштаб и цвет; мусор отбрасывает', () => {
    expect(parsePing({ map_id: 'm', x: 1, y: 2, kind: 'pan', zoom: 1.5 })?.zoom).toBe(1.5)
    expect(parsePing({ map_id: 'm', x: 1, y: 2, kind: 'alert', zoom: 1.5 })?.zoom).toBeNull()
    expect(parsePing({ map_id: 'm', x: 1, y: 2, kind: 'boom' })?.kind).toBe('basic')
    expect(parsePing({ map_id: 'm', x: 1, y: 2, color: 'red;}' })?.color).toBeNull()
    expect(parsePing({ map_id: 'm', x: 1, y: 2, color: '#78c8ff' })?.color).toBe('#78c8ff')
    expect(parsePing({ map_id: 'm', x: 'a', y: 2 })).toBeNull()
    expect(parsePing({ x: 1, y: 2 })).toBeNull()
  })

  it('вид по модификаторам: Shift — только у мастера', () => {
    expect(pingKindFor({ altKey: true, shiftKey: false }, false)).toBe('alert')
    expect(pingKindFor({ altKey: false, shiftKey: true }, true)).toBe('pan')
    expect(pingKindFor({ altKey: false, shiftKey: true }, false)).toBeNull()
    expect(pingKindFor({ altKey: false, shiftKey: false }, true)).toBeNull()
  })

  it('цвета: внимание красное, сюда золотое, обычный — цвет участника', () => {
    expect(pingColor('alert', '#fff')).toBe(ALERT_COLOR)
    expect(pingColor('pan', '#fff')).toBe(PAN_COLOR)
    expect(pingColor('basic', '#fff')).toBe('#fff')
    expect(userColor('abc')).toBe(userColor('abc'))
    expect(userColor('abc')).not.toBe(userColor('abd'))
  })

  it('щадящий режим живёт дольше', () => {
    expect(pingLife('basic', true)).toBeGreaterThan(pingLife('basic', false))
  })

  it('стрелка у края: видимая точка — null, иначе на краю и смотрит на точку', () => {
    expect(edgeArrow({ x: 50, y: 50 }, 100, 100)).toBeNull()
    const right = edgeArrow({ x: 500, y: 50 }, 100, 100, 10)!
    expect(right.x).toBeCloseTo(90)
    expect(right.y).toBeCloseTo(50)
    expect(right.angle).toBeCloseTo(0)
    const up = edgeArrow({ x: 50, y: -300 }, 100, 100, 10)!
    expect(up.y).toBeCloseTo(10)
    expect(up.angle).toBeCloseTo(-Math.PI / 2)
  })
})
