/**
 * Роли участников и уровни доступа к документам — чистые функции для интерфейса.
 * Сервер проверяет всё сам (ROOMS_FRONTEND.md → «Роли и права»); здесь только решаем,
 * какие кнопки показывать и что рисовать в диалоге «Права доступа».
 */
import type { DocPermissions, PermissionLevel, PermissionsView, RoomCapabilities, RoomMemberView, RoomRole } from '../../types/rooms'

/* ---------- роли ---------- */

export const ROLE_LABEL: Record<RoomRole, string> = {
  dm: 'Мастер',
  assistant: 'Помощник мастера',
  trusted: 'Доверенный игрок',
  player: 'Игрок',
}

export const ROLE_HINT: Record<RoomRole, string> = {
  dm: 'Хозяин комнаты: всё, включая настройки и участников',
  assistant: 'Ведёт игру как мастер: бой, токены, существа, карты, база знаний. Комнатой не управляет',
  trusted: 'Игрок, который рисует на карте, ставит метки и загружает картинки',
  player: 'Обычный игрок',
}

/** Роли, которые хозяин может выдать участнику */
export const ASSIGNABLE_ROLES: readonly RoomRole[] = ['player', 'trusted', 'assistant']

export const isGmRole = (role: RoomRole | string | null | undefined) => role === 'dm' || role === 'assistant'
export const isOwnerRole = (role: RoomRole | string | null | undefined) => role === 'dm'
export const isTrustedRole = (role: RoomRole | string | null | undefined) => role === 'dm' || role === 'assistant' || role === 'trusted'

/** Что может участник. У старого сервера me.permissions нет — считаем по роли и настройкам */
export function capabilitiesOf(me: { role: RoomRole; permissions?: RoomCapabilities } | null | undefined, playersCanDraw = false): RoomCapabilities {
  if (me?.permissions) return me.permissions
  const role = me?.role
  const trusted = isTrustedRole(role)
  return {
    is_owner: isOwnerRole(role),
    is_gm: isGmRole(role),
    manage_room: isOwnerRole(role),
    manage_members: isOwnerRole(role),
    draw: trusted || playersCanDraw,
    upload_media: trusted,
    map_pins: trusted,
    templates: trusted,
  }
}

/* ---------- уровни ---------- */

export const LEVELS: readonly PermissionLevel[] = ['none', 'limited', 'observer', 'owner']

export const LEVEL_LABEL: Record<PermissionLevel, string> = {
  none: 'Нет доступа',
  limited: 'Ограниченный',
  observer: 'Наблюдатель',
  owner: 'Владелец',
}

export type PermissionTarget = 'notes' | 'creatures' | 'items'

/** Что даёт уровень на документе этого вида */
export const LEVEL_HINT: Record<PermissionTarget, Record<PermissionLevel, string>> = {
  notes: { none: 'страница не видна', limited: 'только заголовок и метка на карте', observer: 'читает страницу', owner: 'читает и правит' },
  creatures: { none: 'не видно', limited: 'имя и портрет (и то, что открыто глазами)', observer: 'весь статблок', owner: 'статблок и управление токеном' },
  items: { none: 'не виден', limited: 'имя и картинка', observer: 'всё описание, можно взять', owner: 'всё и правка заметки' },
}

const rank = (l: PermissionLevel | null | undefined) => LEVELS.indexOf(l ?? 'none')

export const levelAtLeast = (level: PermissionLevel | null | undefined, needed: PermissionLevel) => rank(level) >= rank(needed)

/** Уровень пользователя: личный → общий → вычисленный по старым флагам. Мастер — всегда owner */
export function effectiveLevel(view: Pick<PermissionsView, 'default' | 'users' | 'computed_default' | 'computed_users'>, userId: string, isGm = false): PermissionLevel {
  if (isGm) return 'owner'
  return view.users[userId] ?? view.computed_users[userId] ?? view.default ?? view.computed_default
}

/** Уровень игрока на документе из проекции: нет поля — старый сервер, значит видит целиком */
export const levelOf = (doc: { level?: PermissionLevel } | null | undefined, isGm: boolean): PermissionLevel => (isGm ? 'owner' : (doc?.level ?? 'observer'))

/** Взять предмет со стола: нужен наблюдатель (limited показывает только имя) */
export const canClaimItem = (item: { level?: PermissionLevel }, isGm: boolean) => levelAtLeast(levelOf(item, isGm), 'observer')

/** Игрок правит страницу базы знаний, если он владелец */
export const canEditNote = (note: { level?: PermissionLevel }) => note.level === 'owner'

/* ---------- черновик диалога ---------- */

/** inherit — у игрока нет личного уровня, действует общий */
export type RowLevel = PermissionLevel | 'inherit'

export interface PermissionDraft {
  /** inherit — по старым флагам */
  default: RowLevel
  users: Record<string, RowLevel>
}

export function draftOf(view: Pick<PermissionsView, 'default' | 'users'>): PermissionDraft {
  return { default: view.default ?? 'inherit', users: { ...view.users } }
}

export function payloadOf(draft: PermissionDraft): DocPermissions {
  const users: Record<string, PermissionLevel> = {}
  for (const [id, level] of Object.entries(draft.users)) if (level !== 'inherit') users[id] = level
  return { default: draft.default === 'inherit' ? null : draft.default, users }
}

/** Строки диалога: принятые участники, кроме мастеров (у них всегда полный доступ) */
export function permissionRows(members: readonly RoomMemberView[]): RoomMemberView[] {
  return members.filter((m) => m.status === 'approved' && !isGmRole(m.role))
}

export const memberName = (m: Pick<RoomMemberView, 'display_name' | 'nickname'>) => m.display_name || m.nickname || 'Игрок'
