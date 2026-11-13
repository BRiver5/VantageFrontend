import { describe, expect, it } from 'vitest'
import type { BattleMap } from '../maps/types'
import type {
  CharacterCard,
  ChatMessage,
  CombatView,
  DiceRollEvent,
  RoomClock,
  RoomEventMessage,
  RoomItem,
  RoomLogEntry,
  RoomMemberView,
  RoomState,
} from '../types/rooms'
import { CHAT_LIMIT, LOG_LIMIT, applyEvent, chatOf, describeEvent, fromSnapshot, mergeChat, pushLog, rollSummary, statusRu, type RoomData } from './applyEvent'

const card = (id: string, name = 'Арвен'): CharacterCard => ({ id, user_id: null, name, avatar_url: null, level: 1, ac: 12, hp: { current: 10, max: 10, temp: 0 }, effects: [] })

const member = (user_id: string, over: Partial<RoomMemberView> = {}): RoomMemberView => ({
  user_id,
  role: 'player',
  status: 'approved',
  room_character_id: null,
  nickname: null,
  display_name: null,
  avatar_url: null,
  online: false,
  ...over,
})

const item = (id: string, over: Partial<RoomItem> = {}): RoomItem => ({ id, room_id: 'r', holder: 'table', kind: 'equipment', equipment: null, magic_item: null, quantity: 1, notes: '', ...over })

const clock = (id: string, order: number): RoomClock => ({ id, name: id, kind: 'progress', segments: 4, filled: 0, ends_at: null, visible: true, order })

const chat = (id: string, seq: number | null): ChatMessage => ({ id, channel: 'ic', text: id, character_id: null, to_user_id: null, seq })

const snapshot = (over: Partial<RoomState> = {}): RoomState =>
  ({
    seq: 10,
    room: { id: 'r', name: 'Комната', status: 'lobby', invite_code: 'ABC', active_combat_id: null, audio: {} },
    me: { user_id: 'dm', role: 'dm', room_character_id: null },
    members: [member('u1'), member('u2')],
    characters: [card('ch1')],
    table: [],
    creatures: [],
    combat: null,
    online: [],
    ...over,
  }) as RoomState

const state = (over: Partial<RoomState> = {}, extra: Partial<RoomData> = {}): RoomData => ({ ...fromSnapshot(snapshot(over)), ...extra })

const ev = <P,>(type: string, payload: P, seq: number | null = 11, extra: Partial<RoomEventMessage> = {}): RoomEventMessage => ({ v: 1, seq, type, payload, ...extra })

const map = (id: string, over: Partial<BattleMap> = {}): BattleMap => ({ id, revealed: true, tokens: [], walls: [], ...over }) as unknown as BattleMap

describe('fromSnapshot', () => {
  it('переносит снимок и сохраняет журнал и доп. данные', () => {
    const log: RoomLogEntry[] = [{ key: 'k', seq: 1, ts: '', type: 'x', kind: 'room', text: '' }]
    const d = fromSnapshot(snapshot({ table: [item('i1')] }), log, { chat: [chat('m', 1)], clocks: [], sharedNotes: [], revealed: [3], activeMap: null })
    expect(d.items.map((i) => i.id)).toEqual(['i1'])
    expect(d.log).toBe(log)
    expect(d.chat).toHaveLength(1)
    expect(d.revealed).toEqual([3])
    expect(d.sheetRev).toEqual({})
  })
})

describe('applyEvent: seq', () => {
  it('seq растёт только вперёд', () => {
    const s = state()
    expect(applyEvent(s, ev('noop', {}, 15)).seq).toBe(15)
    expect(applyEvent(s, ev('noop', {}, 5)).seq).toBe(10)
    expect(applyEvent(s, ev('noop', {}, null)).seq).toBe(10)
  })

  it('неизвестное событие без нового seq возвращает то же состояние', () => {
    const s = state()
    expect(applyEvent(s, ev('dice.rolled', {}, 3))).toBe(s)
  })
})

describe('applyEvent: комната и участники', () => {
  it('room.updated не затирает invite_code', () => {
    const s = applyEvent(state(), ev('room.updated', { name: 'Новая', invite_code: undefined }))
    expect(s.room.name).toBe('Новая')
    expect(s.room.invite_code).toBe('ABC')
  })

  it('audio.* меняет звук, без audio — ничего', () => {
    const audio = { track: 'x' }
    expect(applyEvent(state(), ev('audio.play', { audio })).room.audio).toBe(audio)
    const s = state()
    expect(applyEvent(s, ev('audio.stop', {}, 10))).toBe(s)
  })

  it('room.status', () => {
    expect(applyEvent(state(), ev('room.status', { status: 'active' })).room.status).toBe('active')
  })

  it('room.status: пауза и продолжение', () => {
    const paused = applyEvent(state({ room: { ...snapshot().room, status: 'active' } }), ev('room.status', { status: 'paused' }))
    expect(paused.room.status).toBe('paused')
    expect(describeEvent(paused, ev('room.status', { status: 'paused' }))?.text).toBe('Мастер поставил игру на паузу')
    const resumed = applyEvent(paused, ev('room.status', { status: 'active' }, 12))
    expect(resumed.room.status).toBe('active')
    expect(describeEvent(resumed, ev('room.status', { status: 'active' }, 12))?.text).toBe('Статус комнаты: идёт игра')
    expect(statusRu('paused')).toBe('пауза')
  })

  it('member.requested добавляет заявку или обновляет существующую', () => {
    const s1 = applyEvent(state(), ev('member.requested', { user_id: 'u3', nickname: 'Ник', character_name: 'Гимли' }))
    expect(s1.members).toHaveLength(3)
    expect(s1.members[2]).toMatchObject({ user_id: 'u3', status: 'pending', nickname: 'Ник', character_name: 'Гимли', role: 'player' })
    const s2 = applyEvent(s1, ev('member.requested', { user_id: 'u3', nickname: 'Другой' }))
    expect(s2.members).toHaveLength(3)
    expect(s2.members[2].nickname).toBe('Другой')
  })

  it('member.approved: статус, карточка и мой room_character_id', () => {
    const s = applyEvent(state({ me: { user_id: 'u1', role: 'player', room_character_id: null } }), ev('member.approved', { user_id: 'u1', card: card('ch2') }))
    expect(s.members[0]).toMatchObject({ status: 'approved', room_character_id: 'ch2' })
    expect(s.characters.map((c) => c.id)).toEqual(['ch1', 'ch2'])
    expect(s.me.room_character_id).toBe('ch2')
  })

  it('member.rejected / kicked / left', () => {
    expect(applyEvent(state(), ev('member.rejected', { user_id: 'u1' })).members[0].status).toBe('rejected')
    const k = applyEvent(state({ members: [member('u1', { online: true })] }), ev('member.kicked', { user_id: 'u1', character_id: 'ch1' }))
    expect(k.members[0]).toMatchObject({ status: 'kicked', online: false })
    expect(k.characters).toEqual([])
    const l = applyEvent(state(), ev('member.left', { user_id: 'u2' }))
    expect(l.members[1].status).toBe('left')
    expect(l.characters).toHaveLength(1)
  })

  it('presence.changed отмечает онлайн', () => {
    const s = applyEvent(state(), ev('presence.changed', { online: [{ user_id: 'u2', label: 'x', is_dm: false }] }))
    expect(s.online).toHaveLength(1)
    expect(s.members.map((m) => m.online)).toEqual([false, true])
  })
})

describe('applyEvent: персонажи, предметы, существа', () => {
  it('character.updated — upsert, sheet_changed — ревизия', () => {
    expect(applyEvent(state(), ev('character.updated', { card: card('ch1', 'Новое имя') })).characters).toEqual([card('ch1', 'Новое имя')])
    expect(applyEvent(state(), ev('character.sheet_changed', { character_id: 'ch1', revision: 4 })).sheetRev).toEqual({ ch1: 4 })
  })

  it('item.issued / claimed', () => {
    const s = applyEvent(state(), ev('item.issued', { item: item('i1') }))
    expect(s.items).toHaveLength(1)
    expect(applyEvent(applyEvent(s, ev('item.issued', { item: item('i1') }, 12)), ev('noop', {}, 13)).items).toHaveLength(1)
    expect(applyEvent(s, ev('item.claimed', { item_id: 'i1' }, 12)).items).toEqual([])
  })

  it('item.taken_back: мастеру — на ширму, игроку — исчезает', () => {
    const dm = state({ table: [item('i1')] })
    expect(applyEvent(dm, ev('item.taken_back', { item_id: 'i1', from: 'table' })).items[0].holder).toBe('screen')
    const pl = state({ table: [item('i1')], me: { user_id: 'u1', role: 'player', room_character_id: null } })
    expect(applyEvent(pl, ev('item.taken_back', { item_id: 'i1', from: 'table' })).items).toEqual([])
    expect(applyEvent(pl, ev('item.taken_back', { item_id: 'i1', from: 'character' })).items).toHaveLength(1)
  })

  it('creature.added / updated / removed', () => {
    const c = { id: 'cr', name: 'Гоблин', image_url: null, effects: [] }
    const s = applyEvent(state(), ev('creature.added', { creature: c }))
    expect(s.creatures).toEqual([c])
    expect(applyEvent(s, ev('creature.updated', { creature: { ...c, name: 'Хобгоблин' } }, 12)).creatures).toHaveLength(1)
    expect(applyEvent(s, ev('creature.removed', { creature_id: 'cr' }, 12)).creatures).toEqual([])
  })
})

describe('applyEvent: бой', () => {
  const combat = (): CombatView =>
    ({
      id: 'cb',
      status: 'active',
      round: 1,
      combatants: [
        { id: 'a', card: card('ch1') },
        { id: 'b', creature: { id: 'cr', name: 'Гоблин', image_url: null, effects: [] } },
      ],
    }) as unknown as CombatView

  it('combat.started / ended', () => {
    const s = applyEvent(state(), ev('combat.started', combat()))
    expect(s.combat?.id).toBe('cb')
    expect(s.room.active_combat_id).toBe('cb')
    const e = applyEvent(s, ev('combat.ended', {}, 12))
    expect(e.combat).toBeNull()
    expect(e.room.active_combat_id).toBeNull()
  })

  it('combat.action обновляет карточки, существ и участников боя', () => {
    const s = state({ combat: combat(), creatures: [{ id: 'cr', name: 'Гоблин', image_url: null, effects: [] }] })
    const hurt = { id: 'cr', name: 'Гоблин', image_url: null, effects: ['Горит'] }
    const r = applyEvent(s, ev('combat.action', { targets: [{ combatant_id: 'b', creature: hurt, damage: [] }, { combatant_id: 'a', card: card('ch1', 'Ранена'), damage: [] }] }))
    expect(r.creatures).toEqual([hurt])
    expect(r.characters[0].name).toBe('Ранена')
    expect(r.combat?.combatants[1].creature).toEqual(hurt)
    expect(r.combat?.combatants[0].card?.name).toBe('Ранена')
  })

  it('combat.action без активного боя не падает', () => {
    const r = applyEvent(state(), ev('combat.action', { targets: [{ combatant_id: 'x', card: card('ch9'), damage: [] }] }))
    expect(r.combat).toBeNull()
    expect(r.characters.map((c) => c.id)).toEqual(['ch1', 'ch9'])
  })
})

describe('applyEvent: чат, часы, заметки, броски', () => {
  it('chat.message с подписью из actor, повтор не дублирует', () => {
    const msg = ev('chat.message', chat('m1', null), 11, { ts: 't', actor: { user_id: 'u1', label: 'Арвен' } })
    const s = applyEvent(state(), msg)
    expect(s.chat).toEqual([{ ...chat('m1', 11), ts: 't', from_user_id: 'u1', from_label: 'Арвен' }])
    expect(applyEvent(s, msg).chat).toHaveLength(1)
    expect(applyEvent(state(), ev('chat.message', {})).chat).toEqual([])
  })

  it('clock.updated сортирует по order, скрытые убирает', () => {
    let s = applyEvent(state(), ev('clock.updated', { clock: clock('b', 2) }))
    s = applyEvent(s, ev('clock.updated', { clock: clock('a', 1) }, 12))
    expect(s.clocks.map((c) => c.id)).toEqual(['a', 'b'])
    expect(applyEvent(s, ev('clock.updated', { clock_id: 'a', hidden: true }, 13)).clocks.map((c) => c.id)).toEqual(['b'])
    expect(applyEvent(s, ev('clock.removed', { clock_id: 'b' }, 13)).clocks.map((c) => c.id)).toEqual(['a'])
  })

  it('note.shared / unshared', () => {
    const note = { id: 'n', title: 'Слухи', body: '', folder: null, pinned: false, order: 0 }
    const s = applyEvent(state(), ev('note.shared', { note }))
    expect(s.sharedNotes).toEqual([note])
    expect(applyEvent(s, ev('note.unshared', { note_id: 'n' }, 12)).sharedNotes).toEqual([])
  })

  it('dice.revealed запоминает номер один раз', () => {
    const s = applyEvent(state(), ev('dice.revealed', { rolled_seq: 7 }))
    expect(s.revealed).toEqual([7])
    expect(applyEvent(s, ev('dice.revealed', { rolled_seq: 7 }, 11))).toBe(s)
    expect(applyEvent(state(), ev('dice.revealed', { rolled_seq: 'x' }, 10)).revealed).toEqual([])
  })
})

describe('applyEvent: карта', () => {
  it('map.activated ставит карту на стол', () => {
    const s = applyEvent(state(), ev('map.activated', { map: map('m1') }))
    expect(s.activeMap?.id).toBe('m1')
    expect(s.room.active_map_id).toBe('m1')
  })

  it('map.updated: своя карта обновляется, спрятанная игроку пропадает, чужая игнорируется', () => {
    const dm = state({}, { activeMap: map('m1') })
    expect(applyEvent(dm, ev('map.updated', { map: map('m1', { name: 'Новая', revealed: false }) })).activeMap?.name).toBe('Новая')
    const pl = state({ me: { user_id: 'u1', role: 'player', room_character_id: null } }, { activeMap: map('m1') })
    expect(applyEvent(pl, ev('map.updated', { map: map('m1', { revealed: false }) })).activeMap).toBeNull()
    expect(applyEvent(pl, ev('map.updated', { map: map('m2') })).activeMap?.id).toBe('m1')
  })

  it('map.token_moved и map.door', () => {
    const tok = { id: 't', x: 0, y: 0, elevation_ft: 5 }
    const door = { id: 'w', door: { open: false, locked: true } }
    const s = state({}, { activeMap: map('m1', { tokens: [tok], walls: [door] } as unknown as Partial<BattleMap>) })
    const moved = applyEvent(s, ev('map.token_moved', { token_id: 't', x: 3, y: 4 }))
    expect(moved.activeMap?.tokens[0]).toMatchObject({ x: 3, y: 4, elevation_ft: 5 })
    const opened = applyEvent(s, ev('map.door', { wall_id: 'w', open: true }))
    expect(opened.activeMap?.walls[0].door).toEqual({ open: true, locked: false })
    const none = state()
    expect(applyEvent(none, ev('map.door', { wall_id: 'w' }, 10))).toBe(none)
  })
})

describe('mergeChat / chatOf', () => {
  it('сортирует по seq, без seq — в конец', () => {
    const out = mergeChat([chat('b', 2)], [chat('c', null), chat('a', 1)])
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('ничего нового — тот же массив', () => {
    const list = [chat('a', 1)]
    expect(mergeChat(list, [chat('a', 1)])).toBe(list)
  })

  it(`держит не больше ${CHAT_LIMIT} сообщений, старые обрезает`, () => {
    const many = Array.from({ length: CHAT_LIMIT + 5 }, (_, i) => chat(`m${i}`, i))
    const out = mergeChat([], many)
    expect(out).toHaveLength(CHAT_LIMIT)
    expect(out[0].id).toBe('m5')
  })

  // например, перекрывающиеся страницы истории
  it('повторы внутри добавляемого пакета отсеиваются', () => {
    expect(mergeChat([], [chat('a', 1), chat('a', 1)])).toHaveLength(1)
    const out = mergeChat([chat('a', 1)], [chat('b', 2), chat('a', 1), chat('b', 2)])
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('chatOf без id — null', () => {
    expect(chatOf(ev('chat.message', {}))).toBeNull()
    expect(chatOf(ev('chat.message', chat('x', null)))?.from_user_id).toBeNull()
  })
})

describe('журнал', () => {
  const dice = (over: Partial<DiceRollEvent> = {}): DiceRollEvent => ({
    expression: '1d20+5',
    dice: [{ sides: 20, sign: 1, rolls: [12] }],
    modifier: 5,
    total: 17,
    mode: null,
    discarded_total: null,
    label: 'Атака',
    visibility: 'public',
    dice_style: { body_color: '', accent_color: '', number_color: '' },
    ...over,
  })

  it('rollSummary: модификатор, отброшенные, прибавочные кости', () => {
    expect(rollSummary(dice())).toBe('1к20 [12] +5 = 17')
    expect(rollSummary(dice({ dice: [{ sides: 20, sign: 1, rolls: [3, 15], dropped: [0] }], modifier: -1, total: 14 }))).toBe('2к20 [(3), 15] −1 = 14')
    expect(rollSummary(dice({ dice: [{ sides: 20, sign: 1, rolls: [10] }, { sides: 4, sign: -1, rolls: [2], source: 'Порча' }], modifier: 0, total: 8 }))).toBe('1к20 [10] − Порча 1к4 [2] = 8')
  })

  it('describeEvent: бросок, скрытый бросок, движок', () => {
    const s = state()
    expect(describeEvent(s, ev('dice.rolled', dice({ character_id: 'ch1' })))).toMatchObject({ key: '11:dice.rolled', kind: 'roll', who: 'Арвен', text: 'Атака: 1к20 [12] +5 = 17' })
    expect(describeEvent(s, ev('dice.rolled', dice({ visibility: 'blind' })))?.text).toBe('вслепую · Атака: 1к20 [12] +5 = 17')
    expect(describeEvent(s, ev('dice.rolled', dice({ visibility: 'dm' })))?.text).toMatch(/^скрыто · /)
    const engine = { character_id: 'ch1', label: 'Ловкость', engine: { dice: '1d20', rolls: [7], total: 9 } }
    expect(describeEvent(s, ev('dice.rolled', engine))?.text).toBe('Ловкость: 1d20 [7] = 9')
  })

  it('describeEvent: dice.revealed делает бросок публичным', () => {
    const e = describeEvent(state(), ev('dice.revealed', dice({ visibility: 'blind' })))
    expect(e?.text).toBe('раскрыт бросок · Атака: 1к20 [12] +5 = 17')
    expect(e?.roll?.visibility).toBe('public')
    expect(describeEvent(state(), ev('dice.revealed', { rolled_seq: 3 }))).toBeNull()
  })

  it('describeEvent: ключ без seq строится из ts', () => {
    expect(describeEvent(state(), ev('combat.started', {}, null, { ts: 'T' }))?.key).toBe('tT:combat.started')
  })

  it('describeEvent: действие в бою', () => {
    const s = state({
      combat: { id: 'cb', combatants: [{ id: 'a', card: card('ch1') }, { id: 'b', creature: { id: 'cr', name: 'Гоблин', image_url: null, effects: [] } }] } as unknown as CombatView,
    })
    const action = {
      actor_combatant_id: 'a',
      label: 'Длинный меч',
      secret: false,
      targets: [{ combatant_id: 'b', hit: true, crit: false, attack: { total: 18 }, save: null, damage: [{ roll: { total: 7 } }], healed: null }],
    }
    expect(describeEvent(s, ev('combat.action', action))?.text).toBe('Арвен: Длинный меч → Гоблин (попал) −7')
    expect(describeEvent(s, ev('combat.action', { ...action, secret: true }))?.text).toBe('Скрытое действие')
    const miss = { ...action, targets: [{ ...action.targets[0], hit: false }] }
    expect(describeEvent(s, ev('combat.action', miss))?.text).toBe('Арвен: Длинный меч → Гоблин (промах)')
    const high = { ...action, targets: [{ ...action.targets[0], attack: { total: 18, high_ground: true } }] }
    expect(describeEvent(s, ev('combat.action', high))?.text).toBe('Арвен: Длинный меч → Гоблин (попал, с высоты) −7')
  })

  it('describeEvent: ход, статус, отдых, предметы', () => {
    const s = state()
    const turn = { combatants: [{ id: 'a', card: card('ch1') }], current_combatant_id: 'a', round: 2 }
    expect(describeEvent(s, ev('combat.turn', turn))?.text).toBe('Ход: Арвен (раунд 2)')
    expect(describeEvent(s, ev('combat.turn', { ...turn, current_combatant_id: 'z' }))).toBeNull()
    expect(describeEvent(s, ev('room.status', { status: 'paused' }))?.text).toBe('Мастер поставил игру на паузу')
    expect(describeEvent(s, ev('room.rest', { kind: 'long' }))?.text).toBe('Партия отдыхает: продолжительный отдых')
    expect(describeEvent(s, ev('room.rest', { kind: 'short' }))?.text).toBe('Партия делает короткий привал')
    expect(describeEvent(s, ev('item.claimed', { character_name: 'Гимли', name: 'Факел', quantity: 3 }))).toMatchObject({ who: 'Гимли', text: 'забирает Факел ×3 со стола' })
    expect(describeEvent(s, ev('currency.transferred', { from_character_id: 'ch1', to_character_id: 'zz', amount: { зм: 5 } }))).toMatchObject({ who: 'Арвен', text: 'передаёт 5 зм: другому персонажу' })
    expect(describeEvent(s, ev('effect.ended', { label: 'Концентрация: Благословение', removed: [{ label: 'Благословение' }] }))?.text).toBe('Действие закончилось: Благословение — сняты Благословение')
    expect(describeEvent(s, ev('character.updated', { card: card('ch1') }))).toBeNull()
    expect(describeEvent(s, ev('noop', {}))).toBeNull()
  })

  it('statusRu', () => {
    expect(statusRu('active')).toBe('идёт игра')
    expect(statusRu('weird')).toBe('weird')
  })

  it('pushLog: без дублей и с обрезкой', () => {
    const entry = (k: string): RoomLogEntry => ({ key: k, seq: null, ts: '', type: 'x', kind: 'room', text: '' })
    const s = pushLog(state(), entry('a'))
    expect(s.log).toHaveLength(1)
    expect(pushLog(s, entry('a'))).toBe(s)
    let big = state()
    for (let i = 0; i < LOG_LIMIT + 3; i++) big = pushLog(big, entry(`k${i}`))
    expect(big.log).toHaveLength(LOG_LIMIT)
    expect(big.log[0].key).toBe('k3')
  })
})
