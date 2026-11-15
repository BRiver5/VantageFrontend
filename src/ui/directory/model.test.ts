import { describe, expect, it } from 'vitest'
import { allFolderIds, ancestors, buildTree, canNest, dropZone, folderPath, mergePathFolders, reorder, sortItems, visibleRows, type DirFolder, type DirItem } from './model'

const folder = (id: string, name: string, parentId: string | null = null, order = 0, sort: DirFolder['sort'] = null): DirFolder => ({ id, name, color: null, parentId, order, sort })
const item = (id: string, name: string, folderId: string | null = null, sortOrder: number | null = null): DirItem => ({ id, name, folderId, sortOrder })

const FOLDERS = [folder('a', 'Подземелье', null, 1), folder('b', 'Город', null, 0), folder('c', 'Нежить', 'a')]
const ITEMS = [item('1', 'Скелет', 'c', 1), item('2', 'Зомби', 'c', 0), item('3', 'Стражник', 'b'), item('4', 'Волк'), item('5', 'Бандит', 'потерянная')]

describe('buildTree', () => {
  it('раскладывает по папкам, по алфавиту, потерянная папка — корень', () => {
    const t = buildTree(FOLDERS, ITEMS, { mode: 'alpha' })
    expect(t.folders.map((f) => f.folder.name)).toEqual(['Город', 'Подземелье'])
    expect(t.folders[1].folders[0].items.map((x) => x.name)).toEqual(['Зомби', 'Скелет'])
    expect(t.items.map((x) => x.name)).toEqual(['Бандит', 'Волк'])
    expect(t.folders[1].count).toBe(2)
    expect(t.folders[1].folders[0].depth).toBe(1)
  })

  it('вручную — по order папок и sort_order записей, без порядка — в конце по имени', () => {
    const t = buildTree(FOLDERS, ITEMS, { mode: 'manual' })
    expect(t.folders.map((f) => f.folder.name)).toEqual(['Город', 'Подземелье'])
    expect(t.folders[1].folders[0].items.map((x) => x.name)).toEqual(['Зомби', 'Скелет'])
    expect(sortItems([item('x', 'Б'), item('y', 'А'), item('z', 'В', null, 0)], 'manual').map((x) => x.name)).toEqual(['В', 'А', 'Б'])
  })

  it('порядок папки важнее порядка списка', () => {
    const fs = [folder('a', 'A', null, 0, 'manual')]
    const t = buildTree(fs, [item('1', 'Альфа', 'a', 2), item('2', 'Бета', 'a', 1)], { mode: 'alpha' })
    expect(t.folders[0].items.map((x) => x.name)).toEqual(['Бета', 'Альфа'])
  })

  it('поиск оставляет совпадения и их папки; папка по имени — целиком', () => {
    const t = buildTree(FOLDERS, ITEMS, { mode: 'alpha', query: 'скел' })
    expect(t.folders.map((f) => f.folder.name)).toEqual(['Подземелье'])
    expect(t.folders[0].folders[0].items.map((x) => x.name)).toEqual(['Скелет'])
    expect(t.items).toEqual([])
    const byFolder = buildTree(FOLDERS, ITEMS, { mode: 'alpha', query: 'нежить' })
    expect(byFolder.folders[0].folders[0].items).toHaveLength(2)
    const custom = buildTree(FOLDERS, ITEMS, { mode: 'alpha', query: '#страж', match: (x, q) => q === '#страж' && x.name.startsWith('Страж') })
    expect(custom.folders.map((f) => f.folder.name)).toEqual(['Город'])
  })

  it('пустые папки можно скрыть', () => {
    const t = buildTree([...FOLDERS, folder('e', 'Пустая')], ITEMS, { mode: 'alpha', hideEmpty: true })
    expect(t.folders.map((f) => f.folder.name)).toEqual(['Город', 'Подземелье'])
  })

  it('петля в данных не роняет дерево', () => {
    const t = buildTree([folder('x', 'X', 'y'), folder('y', 'Y', 'x')], [], { mode: 'alpha' })
    expect(t.folders).toEqual([])
  })
})

describe('строки и клавиатура', () => {
  it('свёрнутая папка прячет содержимое, поиск раскрывает всё', () => {
    const t = buildTree(FOLDERS, ITEMS, { mode: 'alpha' })
    const rows = visibleRows(t, new Set(['a']))
    expect(rows.map((r) => r.id)).toEqual(['b', '3', 'a', '5', '4'])
    expect(rows[1]).toMatchObject({ kind: 'item', depth: 1, parentId: 'b' })
    expect(visibleRows(t, new Set(['a']), true).map((r) => r.id)).toEqual(['b', '3', 'a', 'c', '2', '1', '5', '4'])
    expect(allFolderIds(t)).toEqual(['b', 'a', 'c'])
  })

  it('предки и запрет вкладывать папку в себя', () => {
    expect(ancestors(FOLDERS, 'c')).toEqual(['a', 'c'])
    expect(canNest(FOLDERS, 'a', 'c')).toBe(false)
    expect(canNest(FOLDERS, 'a', 'a')).toBe(false)
    expect(canNest(FOLDERS, 'c', 'b')).toBe(true)
    expect(canNest(FOLDERS, 'a', null)).toBe(true)
    expect(folderPath(FOLDERS, 'c')).toBe('Подземелье/Нежить')
  })
})

describe('перетаскивание', () => {
  it('reorder ставит перед соседом или в конец', () => {
    expect(reorder(['a', 'b', 'c'], ['c'], 'a')).toEqual(['c', 'a', 'b'])
    expect(reorder(['a', 'b', 'c'], ['a'], null)).toEqual(['b', 'c', 'a'])
    expect(reorder(['a', 'b'], ['x'], 'b')).toEqual(['a', 'x', 'b'])
    expect(reorder(['a', 'b'], ['x'], 'нет')).toEqual(['a', 'b', 'x'])
  })

  it('dropZone: папка — внутрь, края — соседи в ручном порядке', () => {
    expect(dropZone('folder', 10, 40, false)).toBe('inside')
    expect(dropZone('folder', 2, 40, true)).toBe('before')
    expect(dropZone('folder', 20, 40, true)).toBe('inside')
    expect(dropZone('folder', 38, 40, true)).toBe('after')
    expect(dropZone('item', 5, 40, true)).toBe('before')
    expect(dropZone('item', 30, 40, false)).toBe('after')
  })
})

describe('папки-строки', () => {
  it('строковые пути становятся виртуальными папками, настоящие находятся без учёта регистра', () => {
    const server = [{ id: 'g', name: 'Город', color: '#ff0000', parent_id: null, sort: null, order: 0 }]
    const { folders, byPath } = mergePathFolders(server, ['город/Таверны', 'Лес', null, 'Город/таверны/Подвал'])
    expect(byPath('Город')).toBe('g')
    expect(byPath('ГОРОД/таверны')).toBe('path:город/таверны')
    expect(byPath(null)).toBeNull()
    const tav = folders.find((f) => f.id === byPath('город/таверны'))
    expect(tav).toMatchObject({ name: 'Таверны', parentId: 'g', virtual: true, path: 'город/Таверны' })
    expect(folders.find((f) => f.id === byPath('Город/Таверны/Подвал'))?.parentId).toBe(tav?.id)
    expect(folders.find((f) => f.id === 'g')?.path).toBe('Город')
    expect(folders.filter((f) => f.virtual).map((f) => f.name).sort()).toEqual(['Лес', 'Подвал', 'Таверны'])
  })
})
