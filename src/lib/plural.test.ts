import { describe, expect, it } from 'vitest'
import { countLabel, plural } from './plural'

const RESULT = ['результат', 'результата', 'результатов'] as const
const FOOT = ['фут', 'фута', 'футов'] as const

describe('plural', () => {
  it.each([
    [0, 'результатов'],
    [1, 'результат'],
    [2, 'результата'],
    [3, 'результата'],
    [4, 'результата'],
    [5, 'результатов'],
    [10, 'результатов'],
    [11, 'результатов'],
    [12, 'результатов'],
    [13, 'результатов'],
    [14, 'результатов'],
    [15, 'результатов'],
    [20, 'результатов'],
    [21, 'результат'],
    [22, 'результата'],
    [24, 'результата'],
    [25, 'результатов'],
    [100, 'результатов'],
    [101, 'результат'],
    [102, 'результата'],
    [111, 'результатов'],
    [112, 'результатов'],
    [114, 'результатов'],
    [121, 'результат'],
    [1001, 'результат'],
  ])('%d → %s', (n, word) => {
    expect(plural(n, RESULT)).toBe(word)
  })

  it('отрицательные — как положительные', () => {
    expect(plural(-1, RESULT)).toBe('результат')
    expect(plural(-2, RESULT)).toBe('результата')
    expect(plural(-5, RESULT)).toBe('результатов')
    expect(plural(-11, RESULT)).toBe('результатов')
    expect(plural(-21, RESULT)).toBe('результат')
  })

  it('дроби берут вторую форму', () => {
    expect(plural(1.5, FOOT)).toBe('фута')
    expect(plural(0.5, FOOT)).toBe('фута')
    expect(plural(2.5, FOOT)).toBe('фута')
    expect(plural(11.5, FOOT)).toBe('фута')
    expect(plural(-1.5, FOOT)).toBe('фута')
  })

  it('не число — третья форма', () => {
    expect(plural(NaN, RESULT)).toBe('результатов')
    expect(plural(Infinity, RESULT)).toBe('результатов')
  })
})

describe('countLabel', () => {
  it('число и согласованное слово', () => {
    expect(countLabel(0, RESULT)).toBe('0 результатов')
    expect(countLabel(1, RESULT)).toBe('1 результат')
    expect(countLabel(4, RESULT)).toBe('4 результата')
    expect(countLabel(5, RESULT)).toBe('5 результатов')
    expect(countLabel(21, RESULT)).toBe('21 результат')
    expect(countLabel(111, RESULT)).toBe('111 результатов')
  })

  it('дробь — через запятую', () => {
    expect(countLabel(1.5, FOOT)).toBe('1,5 фута')
    expect(countLabel(-2.5, FOOT)).toBe('-2,5 фута')
  })
})
