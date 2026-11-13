import { describe, expect, it } from 'vitest'
import { canTogglePause, isPausedStatus, isTypingTarget, nextPauseStatus } from './pause'

describe('pause', () => {
  it('переключение только между игрой и паузой', () => {
    expect(nextPauseStatus('active')).toBe('paused')
    expect(nextPauseStatus('paused')).toBe('active')
    expect(nextPauseStatus('lobby')).toBeNull()
    expect(nextPauseStatus('closed')).toBeNull()
    expect(canTogglePause('lobby')).toBe(false)
    expect(isPausedStatus('paused')).toBe(true)
    expect(isPausedStatus(undefined)).toBe(false)
  })

  it('поле ввода не перехватывает пробел', () => {
    // тесты идут без DOM: заглушки с closest
    const el = (inField: boolean, editable = false) => ({ isContentEditable: editable, closest: () => (inField ? {} : null) }) as unknown as Element
    expect(isTypingTarget(el(true))).toBe(true)
    expect(isTypingTarget(el(false, true))).toBe(true)
    expect(isTypingTarget(el(false))).toBe(false)
    expect(isTypingTarget({} as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
