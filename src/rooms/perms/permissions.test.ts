import { describe, expect, it } from 'vitest'
import type { RoomMemberView } from '../../types/rooms'
import {
  canClaimItem,
  canEditNote,
  capabilitiesOf,
  draftOf,
  effectiveLevel,
  isGmRole,
  isOwnerRole,
  isTrustedRole,
  levelAtLeast,
  levelOf,
  payloadOf,
  permissionRows,
} from './permissions'

const view = { default: null, users: {}, computed_default: 'observer' as const, computed_users: {} }

const member = (user_id: string, role: RoomMemberView['role'], status: RoomMemberView['status'] = 'approved'): RoomMemberView => ({
  user_id,
  role,
  status,
  room_character_id: null,
  nickname: null,
  display_name: null,
  avatar_url: null,
  online: false,
})

describe('роли', () => {
  it('помощник ведёт игру, но не хозяин', () => {
    expect(isGmRole('assistant')).toBe(true)
    expect(isOwnerRole('assistant')).toBe(false)
    expect(isGmRole('trusted')).toBe(false)
    expect(isTrustedRole('trusted')).toBe(true)
    expect(isTrustedRole('player')).toBe(false)
  })

  it('права участника берутся с сервера, а без них считаются по роли', () => {
    const fromServer = { is_owner: false, is_gm: false, manage_room: false, manage_members: false, draw: true, upload_media: false, map_pins: false, templates: false }
    expect(capabilitiesOf({ role: 'player', permissions: fromServer })).toBe(fromServer)
    expect(capabilitiesOf({ role: 'trusted' })).toMatchObject({ draw: true, upload_media: true, map_pins: true, is_gm: false })
    expect(capabilitiesOf({ role: 'assistant' })).toMatchObject({ is_gm: true, manage_room: false, manage_members: false })
    expect(capabilitiesOf({ role: 'player' }, true).draw).toBe(true)
    expect(capabilitiesOf(null).is_gm).toBe(false)
  })
})

describe('уровни', () => {
  it('сравнение уровней', () => {
    expect(levelAtLeast('owner', 'observer')).toBe(true)
    expect(levelAtLeast('limited', 'observer')).toBe(false)
    expect(levelAtLeast(undefined, 'limited')).toBe(false)
  })

  it('личный уровень важнее общего, общий важнее старых флагов', () => {
    expect(effectiveLevel(view, 'u1')).toBe('observer')
    expect(effectiveLevel({ ...view, default: 'limited' }, 'u1')).toBe('limited')
    expect(effectiveLevel({ ...view, default: 'limited', users: { u1: 'none' } }, 'u1')).toBe('none')
    expect(effectiveLevel({ ...view, computed_users: { u1: 'owner' } }, 'u1')).toBe('owner')
    expect(effectiveLevel({ ...view, default: 'none' }, 'u1', true)).toBe('owner')
  })

  it('что можно сделать по уровню документа', () => {
    expect(levelOf({}, false)).toBe('observer')
    expect(levelOf({ level: 'limited' }, true)).toBe('owner')
    expect(canClaimItem({ level: 'limited' }, false)).toBe(false)
    expect(canClaimItem({ level: 'limited' }, true)).toBe(true)
    expect(canClaimItem({}, false)).toBe(true)
    expect(canEditNote({ level: 'owner' })).toBe(true)
    expect(canEditNote({ level: 'observer' })).toBe(false)
  })
})

describe('черновик диалога', () => {
  it('«как раньше» и «как у всех» не уходят на сервер', () => {
    const draft = draftOf({ default: null, users: { u1: 'owner' } })
    expect(draft.default).toBe('inherit')
    draft.users.u2 = 'inherit'
    draft.users.u3 = 'none'
    expect(payloadOf(draft)).toEqual({ default: null, users: { u1: 'owner', u3: 'none' } })
    expect(payloadOf({ default: 'limited', users: {} })).toEqual({ default: 'limited', users: {} })
  })

  it('в строках только принятые игроки, без мастеров', () => {
    const rows = permissionRows([member('dm', 'dm'), member('a', 'assistant'), member('t', 'trusted'), member('p', 'player'), member('w', 'player', 'pending')])
    expect(rows.map((m) => m.user_id)).toEqual(['t', 'p'])
  })
})
