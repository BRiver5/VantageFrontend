import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIONS,
  CATEGORY_LABELS,
  STORAGE_KEY,
  combosOf,
  comboFromEvent,
  conflicts,
  isOverridden,
  loadOverrides,
  matches,
  normalizeCombo,
  parseCombo,
  reset,
  setCombos,
  type KeyLike,
} from './keybindings'

const key = (k: string, mods: Partial<Omit<KeyLike, 'key'>> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods })

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  loadOverrides()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('реестр', () => {
  it('у каждого действия уникальный id, русская подпись, известный раздел и разбираемые сочетания', () => {
    const ids = ACTIONS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of ACTIONS) {
      expect(a.label).toMatch(/[а-яё]/i)
      expect(CATEGORY_LABELS[a.category]).toBeTruthy()
      for (const c of a.defaults) expect(parseCombo(c), `${a.id}: ${c}`).not.toBeNull()
    }
  })

  it('у умолчаний нет конфликтов', () => {
    expect(conflicts()).toEqual([])
  })
})

describe('parseCombo / normalizeCombo', () => {
  it('модификаторы в любом порядке и регистре', () => {
    expect(parseCombo('shift+ctrl+z')).toEqual({ ctrl: true, shift: true, alt: false, key: 'z' })
    expect(normalizeCombo('shift+cmd+z')).toBe('Ctrl+Shift+Z')
    expect(normalizeCombo('alt+ctrl+k')).toBe('Ctrl+Alt+K')
  })

  it('синонимы клавиш', () => {
    expect(normalizeCombo('esc')).toBe('Escape')
    expect(normalizeCombo('Space')).toBe('Space')
    expect(parseCombo('Space')?.key).toBe(' ')
    expect(normalizeCombo('del')).toBe('Delete')
    expect(normalizeCombo('Ctrl++')).toBe('Ctrl++')
    expect(normalizeCombo('/')).toBe('/')
  })

  it('мусор — null', () => {
    expect(parseCombo('')).toBeNull()
    expect(parseCombo('Ctrl+')).toBeNull()
    expect(parseCombo('Hyper+Z')).toBeNull()
    expect(parseCombo('Shift')).toBeNull()
  })
})

describe('matches', () => {
  it('Ctrl и ⌘ равноправны', () => {
    expect(matches(key('z', { ctrlKey: true }), 'map.undo')).toBe(true)
    expect(matches(key('z', { metaKey: true }), 'map.undo')).toBe(true)
    expect(matches(key('Z', { ctrlKey: true, shiftKey: true }), 'map.redo')).toBe(true)
  })

  it('строгие действия: лишний модификатор мешает', () => {
    expect(matches(key('Z', { ctrlKey: true, shiftKey: true }), 'map.undo')).toBe(false)
    expect(matches(key('z', { ctrlKey: true }), 'map.redo')).toBe(false)
    expect(matches(key('z'), 'map.undo')).toBe(false)
    expect(matches(key('z'), 'map.tool.zone')).toBe(true)
    expect(matches(key('z', { ctrlKey: true }), 'map.tool.zone')).toBe(false)
    expect(matches(key('z', { altKey: true }), 'map.tool.zone')).toBe(false)
  })

  it('несколько сочетаний на действие', () => {
    expect(matches(key('Delete'), 'map.delete')).toBe(true)
    expect(matches(key('Backspace'), 'map.delete')).toBe(true)
    expect(matches(key(' '), 'celebration.next')).toBe(true)
  })

  it('у знаков препинания Shift не учитывается, Ctrl/Alt — да', () => {
    expect(matches(key('/'), 'search.quick')).toBe(true)
    expect(matches(key('/', { shiftKey: true }), 'search.quick')).toBe(true)
    expect(matches(key('/', { ctrlKey: true }), 'search.quick')).toBe(false)
    expect(matches(key('/', { altKey: true }), 'search.quick')).toBe(false)
  })

  it('loose: лишние модификаторы не мешают, нужные обязательны', () => {
    expect(matches(key('Escape', { shiftKey: true }), 'dialog.close')).toBe(true)
    expect(matches(key('B', { ctrlKey: true, shiftKey: true }), 'kb.bold')).toBe(true)
    expect(matches(key('b'), 'kb.bold')).toBe(false)
    expect(matches(key('Enter', { metaKey: true }), 'review.send')).toBe(true)
    expect(matches(key('Enter'), 'review.send')).toBe(false)
  })

  it('клавиша сравнивается по e.key: другая раскладка — другая клавиша', () => {
    expect(matches(key('я', { ctrlKey: true }), 'map.undo')).toBe(false)
  })

  it('неизвестное действие — false', () => {
    expect(matches(key('z'), 'nope' as never)).toBe(false)
  })
})

describe('переназначения', () => {
  it('setCombos меняет сочетания и пишет в хранилище', () => {
    setCombos('map.undo', ['ctrl+y'])
    expect(combosOf('map.undo')).toEqual(['Ctrl+Y'])
    expect(isOverridden('map.undo')).toBe(true)
    expect(matches(key('y', { ctrlKey: true }), 'map.undo')).toBe(true)
    expect(matches(key('z', { ctrlKey: true }), 'map.undo')).toBe(false)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual({ 'map.undo': ['Ctrl+Y'] })
  })

  it('переназначения читаются из хранилища', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ 'kb.bold': ['ctrl+shift+b'], unknown: ['X'], 'kb.italic': 'bad' }))
    loadOverrides()
    expect(combosOf('kb.bold')).toEqual(['Ctrl+Shift+B'])
    expect(combosOf('kb.italic')).toEqual(['Ctrl+I'])
  })

  it('битое хранилище не ломает умолчания', () => {
    storage.setItem(STORAGE_KEY, '{oops')
    loadOverrides()
    expect(combosOf('map.undo')).toEqual(['Ctrl+Z'])
    storage.setItem(STORAGE_KEY, '[1,2]')
    loadOverrides()
    expect(combosOf('map.undo')).toEqual(['Ctrl+Z'])
  })

  it('без localStorage работает в памяти', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    loadOverrides()
    expect(combosOf('map.undo')).toEqual(['Ctrl+Z'])
    setCombos('map.undo', ['Ctrl+Y'])
    expect(combosOf('map.undo')).toEqual(['Ctrl+Y'])
    reset()
    expect(combosOf('map.undo')).toEqual(['Ctrl+Z'])
  })

  it('совпадение с умолчанием снимает переназначение', () => {
    setCombos('map.undo', ['Ctrl+Y'])
    setCombos('map.undo', ['ctrl+z'])
    expect(isOverridden('map.undo')).toBe(false)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('пустой список — действие без клавиш; мусор отбрасывается', () => {
    setCombos('map.duplicate', [])
    expect(combosOf('map.duplicate')).toEqual([])
    expect(matches(key('d', { ctrlKey: true }), 'map.duplicate')).toBe(false)
    setCombos('map.duplicate', ['Hyper+Q', 'ctrl+e', 'Ctrl+E'])
    expect(combosOf('map.duplicate')).toEqual(['Ctrl+E'])
  })

  it('reset одного действия и всех', () => {
    setCombos('map.undo', ['Ctrl+Y'])
    setCombos('kb.bold', ['Ctrl+G'])
    reset('map.undo')
    expect(combosOf('map.undo')).toEqual(['Ctrl+Z'])
    expect(combosOf('kb.bold')).toEqual(['Ctrl+G'])
    reset()
    expect(combosOf('kb.bold')).toEqual(['Ctrl+B'])
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('conflicts', () => {
  it('пары внутри раздела с общим сочетанием', () => {
    setCombos('map.tool.wall', ['V'])
    expect(conflicts()).toEqual([{ combo: 'V', a: 'map.tool.select', b: 'map.tool.wall' }])
  })

  it('сочетание учитывается после нормализации', () => {
    setCombos('map.redo', ['ctrl+z'])
    expect(conflicts()).toEqual([{ combo: 'Ctrl+Z', a: 'map.undo', b: 'map.redo' }])
  })

  it('разные разделы не конфликтуют', () => {
    // Ctrl+K есть и у поиска, и у базы знаний по умолчанию
    expect(combosOf('search.open')).toEqual(combosOf('kb.link'))
    expect(conflicts()).toEqual([])
  })

  it('три действия с одним сочетанием — три пары', () => {
    setCombos('map.tool.wall', ['V'])
    setCombos('map.tool.door', ['V'])
    expect(conflicts()).toHaveLength(3)
  })
})

describe('comboFromEvent', () => {
  it('сочетание из нажатия', () => {
    expect(comboFromEvent(key('z', { metaKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z')
    expect(comboFromEvent(key(' '))).toBe('Space')
    expect(comboFromEvent(key('Escape'))).toBe('Escape')
    expect(comboFromEvent(key('Control', { ctrlKey: true }))).toBeNull()
  })

  it('записанное сочетание срабатывает на то же нажатие', () => {
    const e = key('K', { ctrlKey: true, altKey: true, shiftKey: true })
    expect(parseCombo(comboFromEvent(e)!)).toEqual({ ctrl: true, alt: true, shift: true, key: 'k' })
  })
})
