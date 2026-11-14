import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, decodeDrag, emptyPages, encodeDrag, normalizePages, PAGES, parseSlot, setSlot, SLOTS, slotKey, slotKeyLabel, swapSlots, tabFor, type HotbarSlot } from './model'
import { invokeSlot, PRIORITY, registerOpener, registerRunner, resetRegistry, subscribePending } from './registry'

const sword: HotbarSlot = { kind: 'attack', ref: 'Длинный меч', label: 'Длинный меч', character_id: 'c1' }
const shield: HotbarSlot = { kind: 'spell', ref: 'Щит', label: 'Щит', character_id: 'c1' }

describe('модель панели', () => {
  it('пустая панель — 5 страниц по 10', () => {
    const p = emptyPages()
    expect(p).toHaveLength(PAGES)
    expect(p.every((row) => row.length === SLOTS && row.every((c) => c === null))).toBe(true)
  })

  it('с сервера: битое — пусто, лишнее отброшено, недостающее дополнено', () => {
    const p = normalizePages([[sword, { kind: 'macro', ref: 'x', label: 'x' }, 5, ...Array(20).fill(shield)], 'junk'])
    expect(p[0][0]).toEqual(sword)
    expect(p[0][1]).toBeNull()
    expect(p[0][2]).toBeNull()
    expect(p[0]).toHaveLength(SLOTS)
    expect(p[1].every((c) => c === null)).toBe(true)
    expect(normalizePages(null)).toEqual(emptyPages())
  })

  it('ячейка проверяется: вид, ссылка и подпись обязательны', () => {
    expect(parseSlot({ kind: 'item', ref: 'i1', label: 'Зелье', character_id: '', icon: null })).toEqual({ kind: 'item', ref: 'i1', label: 'Зелье' })
    expect(parseSlot({ kind: 'item', ref: '', label: 'x' })).toBeNull()
    expect(parseSlot({ kind: 'script', ref: 'a', label: 'b' })).toBeNull()
  })

  it('положить, переложить без дублей, очистить и поменять местами', () => {
    let p = setSlot(emptyPages(), 0, 0, sword)
    p = setSlot(p, 0, 3, sword)
    expect(p[0][0]).toBeNull()
    expect(p[0][3]).toEqual(sword)
    // на другой странице та же ссылка может лежать отдельно
    p = setSlot(p, 1, 0, sword)
    expect(p[1][0]).toEqual(sword)
    p = setSlot(p, 0, 4, shield)
    p = swapSlots(p, 0, 3, 4)
    expect(p[0][3]).toEqual(shield)
    expect(p[0][4]).toEqual(sword)
    p = clearSlot(p, 0, 4)
    expect(p[0][4]).toBeNull()
    // вне диапазона — без изменений
    expect(setSlot(p, 9, 0, sword)).toBe(p)
    expect(clearSlot(p, 0, 9)).toBe(p)
  })

  it('перетаскивание кодируется и проверяется', () => {
    expect(decodeDrag(encodeDrag({ slot: sword, from: { page: 1, index: 2 } }))).toEqual({ slot: sword, from: { page: 1, index: 2 } })
    expect(decodeDrag(encodeDrag({ slot: sword, from: { page: 7, index: 2 } }))).toEqual({ slot: sword })
    expect(decodeDrag('не json')).toBeNull()
    expect(decodeDrag(JSON.stringify({ slot: { kind: 'x' } }))).toBeNull()
  })

  it('ключ общий для листа и лотка боя, подписи клавиш 1…0, вкладки листа', () => {
    expect(slotKey(sword)).toBe('attack:c1:Длинный меч')
    expect(slotKey({ kind: 'sheet', ref: 'c1' })).toBe('sheet::c1')
    expect(Array.from({ length: SLOTS }, (_, i) => slotKeyLabel(i)).join('')).toBe('1234567890')
    expect(tabFor('spell', false)).toBe('magic')
    expect(tabFor('attack', true)).toBe('actions')
    expect(tabFor('item', true)).toBe('bag')
    expect(tabFor('sheet', false)).toBeNull()
  })
})

describe('кто выполняет ячейку', () => {
  afterEach(() => resetRegistry())

  it('вызывает обработчик кнопки, лоток боя важнее листа', () => {
    const sheet = vi.fn()
    const tray = vi.fn()
    const offSheet = registerRunner(slotKey(sword), sheet, PRIORITY.sheet)
    const offTray = registerRunner(slotKey(sword), tray, PRIORITY.tray)
    expect(invokeSlot(sword)).toBe('ran')
    expect(tray).toHaveBeenCalledTimes(1)
    expect(sheet).not.toHaveBeenCalled()
    offTray()
    invokeSlot(sword)
    expect(sheet).toHaveBeenCalledTimes(1)
    offSheet()
  })

  it('кнопки нет — открывает лист и выполняет, когда кнопка появилась', async () => {
    const pending = vi.fn()
    subscribePending(pending)
    const fallback = vi.fn(() => true)
    expect(invokeSlot(shield, fallback)).toBe('fallback')
    expect(fallback).toHaveBeenCalledWith(shield)
    expect(pending).toHaveBeenLastCalledWith(shield)
    const run = vi.fn()
    registerRunner(slotKey(shield), run)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
    expect(pending).toHaveBeenLastCalledWith(null)
  })

  it('сначала спрашивает лоток боя; никто не взялся — ничего не ждёт', async () => {
    const opener = vi.fn(() => true)
    const off = registerOpener(opener)
    expect(invokeSlot(sword, () => false)).toBe('opened')
    off()
    resetRegistry()
    expect(invokeSlot(sword, () => false)).toBe('none')
    const late = vi.fn()
    registerRunner(slotKey(sword), late)
    await Promise.resolve()
    expect(late).not.toHaveBeenCalled()
  })
})
