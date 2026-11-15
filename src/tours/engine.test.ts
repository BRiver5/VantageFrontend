import { describe, expect, it } from 'vitest'
import { canGoBack, isLastStep, progressOf, startRun, stepRun, type RunAction, type TourRun } from './engine'

/** Довести поиск якорей до показа: present[i] — есть ли якорь у шага i */
function settle(run: TourRun, present: boolean[]): TourRun {
  let r = run
  for (let guard = 0; r.phase === 'resolving' && guard < 50; guard++) r = stepRun(r, { type: 'resolved', found: present[r.index] })
  return r
}

function drive(run: TourRun, present: boolean[], actions: RunAction['type'][]): TourRun {
  let r = settle(run, present)
  for (const type of actions) r = settle(stepRun(r, { type } as RunAction), present)
  return r
}

const all = (n: number) => Array.from({ length: n }, () => true)

describe('движок тура', () => {
  it('пустой тур не начинается', () => {
    expect(startRun('t', 0)).toBeNull()
  })

  it('вперёд и назад по шагам', () => {
    let r = drive(startRun('t', 3)!, all(3), [])
    expect(r).toMatchObject({ index: 0, phase: 'showing' })
    expect(canGoBack(r)).toBe(false)
    r = drive(r, all(3), ['next', 'next'])
    expect(r).toMatchObject({ index: 2, phase: 'showing' })
    expect(isLastStep(r)).toBe(true)
    r = drive(r, all(3), ['prev'])
    expect(r).toMatchObject({ index: 1, phase: 'showing' })
  })

  it('«Далее» на последнем шаге завершает тур', () => {
    const r = drive(startRun('t', 2)!, all(2), ['next', 'next'])
    expect(r.phase).toBe('done')
    expect(progressOf(r)).toEqual({ status: 'completed', step: 2 })
  })

  it('шаг без якоря пропускается вперёд', () => {
    const r = drive(startRun('t', 4)!, [true, false, false, true], ['next'])
    expect(r).toMatchObject({ index: 3, phase: 'showing', skipped: [1, 2] })
  })

  it('шаг без якоря пропускается и назад', () => {
    const r = drive(startRun('t', 3)!, [true, false, true], ['next', 'prev'])
    expect(r).toMatchObject({ index: 0, phase: 'showing' })
  })

  it('назад некуда — остаёмся на показанном шаге', () => {
    const r = drive(startRun('t', 3, { status: 'in_progress', step: 2 })!, [false, false, true], ['prev'])
    expect(r).toMatchObject({ index: 2, phase: 'showing' })
  })

  it('первые шаги без якорей пропускаются при старте', () => {
    const r = drive(startRun('t', 3)!, [false, false, true], [])
    expect(r).toMatchObject({ index: 2, phase: 'showing' })
  })

  it('хвост без якорей завершает тур', () => {
    const r = drive(startRun('t', 3)!, [true, false, false], ['next'])
    expect(r.phase).toBe('done')
  })

  it('ни одного якоря — тур пуст, прогресс не пишется', () => {
    const r = drive(startRun('t', 2)!, [false, false], [])
    expect(r.phase).toBe('empty')
    expect(progressOf(r)).toBeNull()
  })

  it('закрытие посреди сохраняет шаг, продолжение начинается с него', () => {
    const closed = drive(startRun('t', 5)!, all(5), ['next', 'next', 'close'])
    expect(progressOf(closed)).toEqual({ status: 'in_progress', step: 2 })
    const resumed = drive(startRun('t', 5, { status: 'in_progress', step: 2 })!, all(5), [])
    expect(resumed).toMatchObject({ index: 2, phase: 'showing' })
  })

  it('пройденный тур начинается заново, шаг за пределами обрезается', () => {
    expect(startRun('t', 3, { status: 'completed', step: 3 })!.index).toBe(0)
    expect(startRun('t', 3, { status: 'in_progress', step: 99 })!.index).toBe(2)
  })

  it('после завершения действия игнорируются', () => {
    const done = drive(startRun('t', 1)!, all(1), ['next'])
    expect(stepRun(done, { type: 'prev' })).toBe(done)
    expect(stepRun(done, { type: 'close' })).toBe(done)
  })

  it('«Далее» во время поиска якоря не перескакивает', () => {
    const run = startRun('t', 3)!
    expect(stepRun(run, { type: 'next' })).toBe(run)
  })
})
