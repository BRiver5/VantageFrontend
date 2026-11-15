import { beforeEach, describe, expect, it, vi } from 'vitest'
import { combosOf, getAction, isLocked, isOverridden, loadOverrides, reset, setCombos, type ActionId } from '../input/keybindings'
import { conflictIndex, conflictText, groupActions, hasCustomBinds, putCombo, removeCombo } from './controls'

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

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  loadOverrides()
})

describe('groupActions', () => {
  it('lists every category in registry order', () => {
    const groups = groupActions()
    expect(groups[0].category).toBe('general')
    expect(groups.flatMap((g) => g.actions).length).toBeGreaterThan(40)
  })

  it('searches labels, categories and combos', () => {
    expect(groupActions('линейка').flatMap((g) => g.actions.map((a) => a.id))).toContain('ruler.toggle')
    expect(groupActions('ctrl+z').flatMap((g) => g.actions.map((a) => a.id))).toEqual(['map.undo'])
    expect(groupActions('редактор стена').flatMap((g) => g.actions.map((a) => a.id))).toEqual(['map.tool.wall'])
    expect(groupActions('нет такого действия')).toEqual([])
  })

  it('finds rebound combos', () => {
    setCombos('map.undo', ['Ctrl+U'])
    expect(groupActions('ctrl+u').flatMap((g) => g.actions.map((a) => a.id))).toContain('map.undo')
  })
})

describe('rebinding', () => {
  it('replaces, adds and removes combos', () => {
    putCombo('map.undo', 0, 'ctrl+y')
    expect(combosOf('map.undo')).toEqual(['Ctrl+Y'])
    putCombo('map.undo', 1, 'Alt+Z')
    expect(combosOf('map.undo')).toEqual(['Ctrl+Y', 'Alt+Z'])
    removeCombo('map.undo', 0)
    expect(combosOf('map.undo')).toEqual(['Alt+Z'])
    removeCombo('map.undo', 0)
    expect(combosOf('map.undo')).toEqual([])
    expect(isOverridden('map.undo')).toBe(true)
  })

  it('ignores garbage combos', () => {
    putCombo('map.undo', 0, 'Ctrl+')
    expect(combosOf('map.undo')).toEqual(['Ctrl+Z'])
    expect(isOverridden('map.undo')).toBe(false)
  })

  it('does not duplicate the same combo', () => {
    putCombo('map.delete', 2, 'Delete')
    expect(combosOf('map.delete')).toEqual(['Delete', 'Backspace'])
  })

  it('back to defaults removes the override', () => {
    putCombo('map.undo', 0, 'Ctrl+Y')
    putCombo('map.undo', 0, 'Ctrl+Z')
    expect(isOverridden('map.undo')).toBe(false)
  })

  it('tracks custom binds for «reset all»', () => {
    expect(hasCustomBinds()).toBe(false)
    putCombo('ruler.toggle', 0, 'G')
    expect(hasCustomBinds()).toBe(true)
    reset('ruler.toggle')
    expect(hasCustomBinds()).toBe(false)
  })

  it('locked actions cannot be changed', () => {
    expect(isLocked('dialog.close')).toBe(true)
    putCombo('dialog.close', 0, 'Q')
    removeCombo('dialog.close', 0)
    setCombos('dialog.close', ['Q'])
    expect(combosOf('dialog.close')).toEqual(getAction('dialog.close').defaults)
    expect(hasCustomBinds()).toBe(false)
  })
})

describe('conflicts', () => {
  it('names clashing actions in the same category, both ways', () => {
    putCombo('map.tool.wall', 0, 'V')
    const idx = conflictIndex()
    expect(idx.get('map.tool.wall')).toEqual([{ combo: 'V', with: ['map.tool.select'] }])
    expect(idx.get('map.tool.select')).toEqual([{ combo: 'V', with: ['map.tool.wall'] }])
    const label = (id: ActionId) => getAction(id).label
    expect(conflictText(idx.get('map.tool.wall')!, label)).toBe('V — также: Инструмент: выбор')
  })

  it('different categories do not clash', () => {
    // Ctrl+K: поиск (общее) и ссылка (база знаний) — разные места
    expect(conflictIndex().get('kb.link')).toBeUndefined()
  })
})
