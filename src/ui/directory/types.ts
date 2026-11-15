import type { DragEvent, ReactNode } from 'react'
import type { PermissionKind } from '../../types/rooms'
import type { FolderPatch } from './api'
import type { DirFolder, DirItem, SortMode } from './model'

export interface MoveRequest {
  itemIds: string[]
  folderIds: string[]
  /** Куда; null — корень */
  targetId: string | null
  /** Новый ручной порядок содержимого целевой папки (папки и записи) */
  order?: string[]
}

/** Что умеют папки списка (useDirectory); null — сервер без папок */
export interface FolderOps {
  createFolder: (parentId: string | null, name: string) => Promise<string | null>
  patchFolder: (id: string, patch: FolderPatch) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  move: (req: MoveRequest) => Promise<void>
}

/** Действие записи, которое добавляет владелец списка (в меню после «Открыть») */
export interface ExtraAction {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  run: () => void
}

/** Общие действия меню; какие есть — решает владелец списка */
export interface ItemActions<T extends DirItem> {
  open?: (item: T) => void
  rename?: (item: T, name: string) => Promise<unknown> | void
  duplicate?: (item: T) => Promise<unknown> | void
  /** Права доступа: тот же диалог, что и в остальных местах (src/rooms/perms/PermissionsDialog.tsx) */
  permissions?: PermissionKind
  /** Данные для «Экспорт JSON»; файл назовётся по имени записи */
  exportJson?: (item: T) => unknown | Promise<unknown>
  remove?: (item: T) => Promise<unknown> | void
  /** Свои действия списка: «На стол», «Показать», «Отдать»… */
  extra?: (item: T) => ExtraAction[]
}

export interface DirectoryListProps<T extends DirItem> {
  /** Ключ для памяти (свёрнутые папки, порядок): уникален в приложении */
  listId: string
  label: string
  items: T[]
  folders: DirFolder[]
  ops: FolderOps | null
  actions: ItemActions<T>
  selectedId?: string | null
  /** Содержимое строки записи; по умолчанию — значок и имя */
  renderItem?: (item: T) => ReactNode
  /** Кнопки в конце строки (видны при наведении и у выбранной) */
  rowActions?: (item: T) => ReactNode
  icon?: (item: T) => ReactNode
  /** «Создать»: новая запись в папке (null — корень) */
  onCreate?: (folderId: string | null) => void
  createLabel?: string
  /** Кнопка «Создать» в шапке; false — только «создать здесь» у папок (своя кнопка в toolbar) */
  createInHeader?: boolean
  /** Кнопка «Создать» нажата (например, открыт поиск по бестиарию) */
  createActive?: boolean
  /** Свои кнопки шапки после стандартных */
  toolbar?: ReactNode
  /** Поиск снаружи (например, клик по #тегу на странице) */
  query?: string
  onQueryChange?: (q: string) => void
  searchPlaceholder?: string
  match?: (item: T, query: string) => boolean
  defaultSort?: SortMode
  hideEmptyFolders?: boolean
  /** Перетаскивание записи наружу: свои данные (страница в редактор, жетон на стол) */
  onItemDragStart?: (item: T, e: DragEvent) => void
  /** Конец перетаскивания; ``point`` — где был указатель последним (dragend в Firefox его не знает) */
  onItemDragEnd?: (item: T, e: DragEvent, point: { x: number; y: number } | null) => void
  empty?: ReactNode
  className?: string
  /** Без шапки — для вторых списков того же вида */
  compact?: boolean
}
