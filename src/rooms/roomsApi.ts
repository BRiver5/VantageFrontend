/**
 * Маршруты комнат. Все требуют настоящий вход (без токена 401), поэтому везде
 * `auth: true`. Ответ REST экран не обновляет — экран меняют события WebSocket
 * (см. RoomProvider); ответ нужен для значения, которое надо знать сразу (бросок).
 *
 * Лист, действия, отдых, хиты и прочие игровые маршруты персонажа комнаты — те же
 * функции из api.ts, что и у обычного персонажа: им передают
 * `roomCharacterRef(roomId, characterId)` вместо id.
 */
import { request, type ImageQuality } from '../api'
import type { Currency } from '../api'
import type {
  BattleMap,
  CharacterCard,
  CombatActionRequest,
  CombatActionResult,
  CombatStartBody,
  CombatView,
  ContentPreloadBody,
  CreatureAddBody,
  CreaturePatchBody,
  DashboardWidget,
  DiceRollEvent,
  ItemIssueBody,
  RollRequest,
  Room,
  RoomCreateBody,
  RoomCreature,
  RoomEventMessage,
  RoomItem,
  RoomJoinBody,
  RoomListItem,
  RoomMemberView,
  RoomPatchBody,
  RoomState,
  RoomStatus,
  ScreenItemTemplate,
  ScreenNote,
  AnyCreature,
} from '../types/rooms'

const r = (id: string, path = '') => `/rooms/${id}${path}`
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: true })
const get = <T>(path: string, quality?: ImageQuality) => request<T>(path, { auth: true, quality })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body, auth: true })
const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body, auth: true })
const del = <T = void>(path: string) => request<T>(path, { method: 'DELETE', auth: true })

/* ---------- комната ---------- */

export const createRoom = (body: RoomCreateBody) => post<Room>('/rooms', body)

export async function listRooms(quality?: ImageQuality): Promise<RoomListItem[]> {
  const res = await get<{ items: RoomListItem[] } | RoomListItem[]>('/rooms', quality)
  return Array.isArray(res) ? res : (res?.items ?? [])
}

export const joinRoom = (body: RoomJoinBody) =>
  post<{ room_id: string; room_name: string; status: string }>('/rooms/join', body)

export const getRoom = (id: string) => get<Room>(r(id))
export const patchRoom = (id: string, body: RoomPatchBody) => patch<Room>(r(id), body)
export const deleteRoom = (id: string) => del(r(id))
export const setRoomStatus = (id: string, status: RoomStatus) => post<{ status: RoomStatus }>(r(id, '/status'), { status })
export const rotateInvite = (id: string) => post<{ invite_code: string }>(r(id, '/invite/rotate'))
export const leaveRoom = (id: string) => post<{ status: string }>(r(id, '/leave'))

/** Снимок для вашей роли и номер события, с которого сокет догонит остальное */
export const getRoomState = (id: string, quality?: ImageQuality) => get<RoomState>(r(id, '/state'), quality)

export async function getRoomEvents(id: string, afterSeq = 0, limit = 200): Promise<RoomEventMessage[]> {
  const res = await get<{ items: RoomEventMessage[] }>(r(id, `/events?after_seq=${afterSeq}&limit=${limit}`))
  return res?.items ?? []
}

/** В комнате кости бросает сервер; всем показываем значения из события dice.rolled */
export const rollInRoom = (id: string, body: RollRequest) => post<DiceRollEvent & { seq: number }>(r(id, '/rolls'), body)

/* ---------- участники ---------- */

export async function listMembers(id: string): Promise<RoomMemberView[]> {
  return (await get<{ items: RoomMemberView[] }>(r(id, '/members')))?.items ?? []
}
export const approveMember = (id: string, userId: string) =>
  post<{ user_id: string; room_character_id: string; card: CharacterCard }>(r(id, `/members/${userId}/approve`))
export const rejectMember = (id: string, userId: string) => post<{ status: string }>(r(id, `/members/${userId}/reject`))
export const kickMember = (id: string, userId: string) => post<{ status: string }>(r(id, `/members/${userId}/kick`))

/* ---------- персонажи (краткие карточки; лист — через roomCharacterRef) ---------- */

/** Правка комнатной копии героя (поля, которые игроку можно менять сам) */
export const patchRoomCharacter = (id: string, cid: string, body: Record<string, unknown>) => patch<unknown>(r(id, `/characters/${cid}`), body)

/** Картинка героя в комнате: копия героя её не обновляет сама */
export const setRoomCharacterAvatar = (id: string, cid: string, avatar_url: string) => patch<unknown>(r(id, `/characters/${cid}`), { avatar_url })


export async function listRoomCharacters(id: string): Promise<CharacterCard[]> {
  return (await get<{ items: CharacterCard[] }>(r(id, '/characters')))?.items ?? []
}

/* ---------- предметы ---------- */

export const issueItem = (id: string, body: ItemIssueBody) => post<RoomItem>(r(id, '/items'), body)
export async function listRoomItems(id: string): Promise<RoomItem[]> {
  return (await get<{ items: RoomItem[] }>(r(id, '/items')))?.items ?? []
}
/** Кто первый взял, того и предмет; опоздавший получит 409 */
export const claimItem = (id: string, itemId: string, characterId?: string) =>
  post<unknown>(r(id, `/items/${itemId}/claim`), characterId ? { character_id: characterId } : {})
export const takeBackItem = (id: string, itemId: string) => post<unknown>(r(id, `/items/${itemId}/take-back`))

const inv = (id: string, cid: string, inst: string, path = '') => r(id, `/characters/${cid}/inventory/${inst}${path}`)

export interface InventoryPatch {
  equipped?: boolean
  equip_slot?: string | null
  is_attuned?: boolean
  position?: { col: number; row: number }
  notes?: string
}
export const patchInventoryItem = (id: string, cid: string, inst: string, body: InventoryPatch) =>
  patch<unknown>(inv(id, cid, inst), body)
export const transferItem = (id: string, cid: string, inst: string, body: { to_character_id: string; quantity?: number }) =>
  post<unknown>(inv(id, cid, inst, '/transfer'), body)
export const dropItem = (id: string, cid: string, inst: string, quantity?: number) =>
  post<unknown>(inv(id, cid, inst, '/drop'), quantity ? { quantity } : {})
export const takeBackFromCharacter = (id: string, cid: string, inst: string, quantity?: number) =>
  post<unknown>(inv(id, cid, inst, '/take-back'), quantity ? { quantity } : {})
export const transferCurrency = (
  id: string,
  cid: string,
  body: { to_character_id: string; amount: Partial<Record<Currency, number>> },
) => post<unknown>(r(id, `/characters/${cid}/currency/transfer`), body)

/* ---------- существа ---------- */

export async function addCreatures(id: string, body: CreatureAddBody): Promise<RoomCreature[]> {
  return (await post<{ items: RoomCreature[] }>(r(id, '/creatures'), body))?.items ?? []
}
export async function listRoomCreatures(id: string): Promise<AnyCreature[]> {
  return (await get<{ items: AnyCreature[] }>(r(id, '/creatures')))?.items ?? []
}
export const getRoomCreature = (id: string, creatureId: string) => get<AnyCreature>(r(id, `/creatures/${creatureId}`))
export const patchRoomCreature = (id: string, creatureId: string, body: CreaturePatchBody) =>
  patch<RoomCreature>(r(id, `/creatures/${creatureId}`), body)
export const removeRoomCreature = (id: string, creatureId: string) => del(r(id, `/creatures/${creatureId}`))
export const creatureVitals = (
  id: string,
  creatureId: string,
  body: { op: 'damage' | 'heal' | 'temp' | 'set'; amount: number; damage_type?: string | null },
) => post<RoomCreature>(r(id, `/creatures/${creatureId}/vitals`), body)
export const revealCreature = (id: string, creatureId: string) => post<RoomCreature>(r(id, `/creatures/${creatureId}/reveal`))

/* ---------- бой ---------- */

const cb = (id: string, combat: string, path = '') => r(id, `/combat/${combat}${path}`)

export const startCombat = (id: string, body: CombatStartBody = {}) => post<CombatView>(r(id, '/combat'), body)
export const getCombat = (id: string, combat: string) => get<CombatView>(cb(id, combat))
export const addCombatants = (
  id: string,
  combat: string,
  body: { character_ids?: string[]; creature_ids?: string[]; hidden?: boolean },
) => post<CombatView>(cb(id, combat, '/combatants'), body)
/** Мастер за всех, игрок за себя; только до начала боя */
export const rollInitiative = (id: string, combat: string, body: { combatant_ids?: string[]; advantage?: 'adv' | 'dis' | null } = {}) =>
  post<CombatView>(cb(id, combat, '/initiative/roll'), body)
export const setInitiative = (id: string, combat: string, values: Record<string, number>) =>
  patch<CombatView>(cb(id, combat, '/initiative'), { values })
export const beginCombat = (id: string, combat: string) => post<CombatView>(cb(id, combat, '/start'))
export const nextTurn = (id: string, combat: string) => post<CombatView>(cb(id, combat, '/next-turn'))
export const combatAction = (id: string, combat: string, body: CombatActionRequest) =>
  post<CombatActionResult>(cb(id, combat, '/actions'), body)
export const revertCombatAction = (id: string, combat: string, actionId: string) =>
  post<CombatView>(cb(id, combat, `/actions/${actionId}/revert`))
export const endCombat = (id: string, combat: string) => post<CombatView>(cb(id, combat, '/end'))

/* ---------- ширма (только мастер) ---------- */

type NoteBody = Partial<Omit<ScreenNote, 'id' | 'room_id'>>
export const createNote = (id: string, body: NoteBody) => post<ScreenNote>(r(id, '/screen/notes'), body)
export async function listNotes(id: string): Promise<ScreenNote[]> {
  return (await get<{ items: ScreenNote[] }>(r(id, '/screen/notes')))?.items ?? []
}
export const patchNote = (id: string, noteId: string, body: NoteBody) => patch<ScreenNote>(r(id, `/screen/notes/${noteId}`), body)
export const deleteNote = (id: string, noteId: string) => del(r(id, `/screen/notes/${noteId}`))

type TemplateBody = Partial<Omit<ScreenItemTemplate, 'id' | 'room_id'>>
export const createTemplate = (id: string, body: TemplateBody) => post<ScreenItemTemplate>(r(id, '/screen/items'), body)
export async function listTemplates(id: string): Promise<ScreenItemTemplate[]> {
  return (await get<{ items: ScreenItemTemplate[] }>(r(id, '/screen/items')))?.items ?? []
}
export const patchTemplate = (id: string, templateId: string, body: TemplateBody) =>
  patch<ScreenItemTemplate>(r(id, `/screen/items/${templateId}`), body)
export const deleteTemplate = (id: string, templateId: string) => del(r(id, `/screen/items/${templateId}`))
export const issueTemplate = (id: string, templateId: string, body: { quantity?: number; target?: string; notes?: string } = {}) =>
  post<RoomItem>(r(id, `/screen/items/${templateId}/issue`), body)

type MapBody = Partial<Omit<BattleMap, 'id' | 'room_id'>>
export const createMap = (id: string, body: MapBody) => post<BattleMap>(r(id, '/screen/maps'), body)
export async function listMaps(id: string): Promise<BattleMap[]> {
  return (await get<{ items: BattleMap[] }>(r(id, '/screen/maps')))?.items ?? []
}
export const patchMap = (id: string, mapId: string, body: MapBody) => patch<BattleMap>(r(id, `/screen/maps/${mapId}`), body)
export const deleteMap = (id: string, mapId: string) => del(r(id, `/screen/maps/${mapId}`))

export async function getDashboard(id: string): Promise<DashboardWidget[]> {
  return (await get<{ widgets: DashboardWidget[] }>(r(id, '/screen/dashboard')))?.widgets ?? []
}
/** Сетка из 12 колонок; выход за край и пересечения дают 422 */
export const saveDashboard = (id: string, widgets: DashboardWidget[]) =>
  put<{ widgets: DashboardWidget[] }>(r(id, '/screen/dashboard'), { widgets })

/* ---------- контент для всех сразу ---------- */

export const preloadContent = (id: string, body: ContentPreloadBody) =>
  post<{ content_id: string; expected: number }>(r(id, '/content/preload'), body)
export const revealContent = (id: string, contentId: string) =>
  post<{ content_id: string }>(r(id, `/content/${contentId}/reveal`))
