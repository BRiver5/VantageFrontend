/**
 * Состояние комнаты на клиенте и применение событий WebSocket.
 *
 * Принцип контракта: ответ REST экран не меняет — его меняют события, поэтому у
 * всех участников порядок один и тот же. Функции здесь чистые: идемпотентны
 * (upsert по id), потому что один и тот же seq может прийти дважды при sync.
 *
 * Мастер и игроки получают РАЗНЫЕ события с разными номерами (например,
 * creature.updated — полное мастеру и урезанное игрокам); чужое приходит как
 * `noop`. Поэтому в состоянии существа лежат в том виде, в каком их прислали
 * именно этой роли (RoomCreature или CreaturePlayerView).
 */
import type {
  AnyCreature,
  CharacterCard,
  ChatMessage,
  ConcentrationSave,
  RoomClock,
  SaveEndsResult,
  SharedNote,
  CombatActionResult,
  CombatView,
  DiceRollEvent,
  OnlineUser,
  Room,
  RoomCreature,
  RoomEventMessage,
  RoomItem,
  RoomLogEntry,
  RoomMemberView,
  RoomState,
  RoomStatus,
} from '../types/rooms'
import { isEngineRoll, type RollPayload } from '../types/rooms'
import type { BattleMap } from '../maps/types'

/** Сколько записей журнала держим в памяти */
export const LOG_LIMIT = 300

export interface RoomData {
  seq: number
  room: Room
  me: RoomState['me']
  members: RoomMemberView[]
  characters: CharacterCard[]
  /** у мастера здесь и предметы ширмы: различайте по holder */
  items: RoomItem[]
  creatures: AnyCreature[]
  combat: CombatView | null
  online: OnlineUser[]
  /** ревизия листа каждого персонажа: меняется — лист надо перечитать */
  sheetRev: Record<string, number>
  log: RoomLogEntry[]
  /** сообщения чата по порядку; история догружается из /events?types=chat.message */
  chat: ChatMessage[]
  /** часы прогресса; игроку — только видимые */
  clocks: RoomClock[]
  /** заметки, которые мастер открыл партии */
  sharedNotes: SharedNote[]
  /** номера скрытых бросков, которые мастер уже раскрыл */
  revealed: number[]
  /** боевая карта на столе: мастеру целиком, игроку — проекция */
  activeMap: BattleMap | null
}

/** То, чего нет в снимке /state: оно грузится отдельно и переживает пересъём снимка */
export type RoomExtras = Pick<RoomData, 'chat' | 'clocks' | 'sharedNotes' | 'revealed' | 'activeMap'>
const NO_EXTRAS: RoomExtras = { chat: [], clocks: [], sharedNotes: [], revealed: [], activeMap: null }

/** Сколько сообщений чата держим */
export const CHAT_LIMIT = 400

export function fromSnapshot(s: RoomState, prevLog: RoomLogEntry[] = [], extras: RoomExtras = NO_EXTRAS): RoomData {
  return {
    seq: s.seq,
    room: s.room,
    me: s.me,
    members: s.members,
    characters: s.characters,
    items: s.table,
    creatures: s.creatures,
    combat: s.combat,
    online: s.online,
    sheetRev: {},
    log: prevLog,
    chat: extras.chat,
    clocks: extras.clocks,
    sharedNotes: extras.sharedNotes,
    revealed: extras.revealed,
    activeMap: extras.activeMap,
  }
}

/** Сообщение чата из события: кто написал, берём из actor */
export function chatOf(msg: RoomEventMessage): ChatMessage | null {
  const p = msg.payload as ChatMessage | undefined
  if (!p?.id) return null
  return { ...p, seq: msg.seq, ts: msg.ts, from_user_id: msg.actor?.user_id ?? null, from_label: msg.actor?.label ?? null }
}

/** Добавить сообщения без повторов, по порядку seq */
export function mergeChat(list: ChatMessage[], add: ChatMessage[]): ChatMessage[] {
  const known = new Set(list.map((m) => m.id))
  const fresh: ChatMessage[] = []
  for (const m of add) {
    // known пополняем по ходу: повторы внутри самого пакета тоже отсеиваются
    if (known.has(m.id)) continue
    known.add(m.id)
    fresh.push(m)
  }
  if (fresh.length === 0) return list
  const all = [...list, ...fresh].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))
  return all.length > CHAT_LIMIT ? all.slice(all.length - CHAT_LIMIT) : all
}

const byOrder = <T extends { order: number }>(list: T[]) => [...list].sort((a, b) => a.order - b.order)

/* ---------- мелкие помощники ---------- */

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id)
  if (i < 0) return [...list, item]
  const next = list.slice()
  next[i] = item
  return next
}
const without = <T extends { id: string }>(list: T[], id: string): T[] => list.filter((x) => x.id !== id)

/** Данные мёрджим поверх старых: у room.updated нет invite_code, даже у мастера */
const mergeRoom = (room: Room, patch: Partial<Room>): Room => ({ ...room, ...patch, invite_code: room.invite_code ?? patch.invite_code })

const mark = (members: RoomMemberView[], online: OnlineUser[]): RoomMemberView[] => {
  const on = new Set(online.map((o) => o.user_id))
  return members.map((m) => (m.online === on.has(m.user_id) ? m : { ...m, online: on.has(m.user_id) }))
}

/** Обновить карточки и существ, которые пришли внутри результата боя */
function mergeCombat(combat: CombatView | null, upd: { id: string; card?: CharacterCard; creature?: AnyCreature }[]): CombatView | null {
  if (!combat) return combat
  const byId = new Map(upd.map((u) => [u.id, u]))
  return {
    ...combat,
    combatants: combat.combatants.map((c) => {
      const u = byId.get(c.id)
      return u ? { ...c, card: u.card ?? c.card, creature: u.creature ?? c.creature } : c
    }),
  }
}

type P = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/* ---------- применение события ---------- */

export function applyEvent(state: RoomData, msg: RoomEventMessage): RoomData {
  const seq = msg.seq != null && msg.seq > state.seq ? msg.seq : state.seq
  const base = seq === state.seq ? state : { ...state, seq }
  const p = (msg.payload ?? {}) as P

  switch (msg.type) {
    case 'room.updated':
      return { ...base, room: mergeRoom(base.room, p as Partial<Room>) }

    case 'audio.play':
    case 'audio.pause':
    case 'audio.resume':
    case 'audio.stop':
    case 'audio.seek':
    case 'audio.volume':
    case 'audio.pads': {
      const audio = p.audio as Room['audio'] | undefined
      return audio ? { ...base, room: { ...base.room, audio } } : base
    }

    case 'room.status':
      return { ...base, room: { ...base.room, status: p.status as RoomStatus } }

    case 'member.requested': {
      const m: RoomMemberView = {
        user_id: p.user_id,
        role: 'player',
        status: 'pending',
        room_character_id: null,
        nickname: p.nickname ?? null,
        display_name: p.display_name ?? null,
        avatar_url: null,
        online: false,
        source_character_id: p.character_id ?? null,
        character_name: p.character_name ?? null,
      }
      const i = base.members.findIndex((x) => x.user_id === m.user_id)
      const members = i < 0 ? [...base.members, m] : base.members.map((x, j) => (j === i ? { ...x, ...m } : x))
      return { ...base, members }
    }

    case 'member.approved': {
      const card = p.card as CharacterCard
      return {
        ...base,
        members: base.members.map((m) => (m.user_id === p.user_id ? { ...m, status: 'approved', room_character_id: card?.id ?? m.room_character_id } : m)),
        characters: card ? upsert(base.characters, card) : base.characters,
        me: p.user_id === base.me.user_id && card ? { ...base.me, room_character_id: card.id } : base.me,
      }
    }

    case 'member.rejected':
      return { ...base, members: base.members.map((m) => (m.user_id === p.user_id ? { ...m, status: 'rejected' } : m)) }

    case 'member.kicked':
    case 'member.left': {
      const status = msg.type === 'member.kicked' ? 'kicked' : 'left'
      return {
        ...base,
        members: base.members.map((m) => (m.user_id === p.user_id ? { ...m, status, online: false } : m)),
        characters: p.character_id ? without(base.characters, p.character_id) : base.characters,
      }
    }

    case 'presence.changed': {
      const online = (p.online ?? []) as OnlineUser[]
      return { ...base, online, members: mark(base.members, online) }
    }

    case 'character.updated': {
      const card = p.card as CharacterCard | undefined
      return card ? { ...base, characters: upsert(base.characters, card) } : base
    }

    case 'character.sheet_changed':
      return { ...base, sheetRev: { ...base.sheetRev, [p.character_id]: p.revision } }

    case 'item.issued': {
      const item = p.item as RoomItem | undefined
      return item ? { ...base, items: upsert(base.items, item) } : base
    }

    case 'item.claimed':
      return { ...base, items: without(base.items, p.item_id) }

    case 'item.taken_back': {
      // со стола на ширму: игрокам предмет исчезает, мастеру остаётся с holder = screen
      if (p.from !== 'table') return base
      if (base.me.role === 'dm') {
        return { ...base, items: base.items.map((it) => (it.id === p.item_id ? { ...it, holder: 'screen' } : it)) }
      }
      return { ...base, items: without(base.items, p.item_id) }
    }

    case 'creature.added':
    case 'creature.updated':
    case 'creature.revealed': {
      const c = p.creature as AnyCreature | undefined
      return c ? { ...base, creatures: upsert(base.creatures, c) } : base
    }

    case 'creature.removed':
      return { ...base, creatures: without(base.creatures, p.creature_id) }

    case 'combat.started':
    case 'combat.updated':
    case 'combat.turn':
      return { ...base, combat: p as unknown as CombatView, room: { ...base.room, active_combat_id: (p as CombatView).id } }

    case 'combat.ended':
      return { ...base, combat: null, room: { ...base.room, active_combat_id: null } }

    case 'combat.action': {
      const res = p as unknown as CombatActionResult
      let characters = base.characters
      let creatures = base.creatures
      for (const t of res.targets ?? []) {
        if (t.card) characters = upsert(characters, t.card)
        if (t.creature) creatures = upsert(creatures, t.creature)
      }
      const combat = mergeCombat(
        base.combat,
        (res.targets ?? []).map((t) => ({ id: t.combatant_id, card: t.card, creature: t.creature })),
      )
      return { ...base, characters, creatures, combat }
    }

    case 'chat.message': {
      const m = chatOf(msg)
      return m ? { ...base, chat: mergeChat(base.chat, [m]) } : base
    }

    case 'clock.updated': {
      // скрытые часы игроку приходят как {clock_id, hidden: true}: убрать с экрана
      if (p.hidden && p.clock_id) return { ...base, clocks: without(base.clocks, p.clock_id) }
      const clock = p.clock as RoomClock | undefined
      return clock ? { ...base, clocks: byOrder(upsert(base.clocks, clock)) } : base
    }

    case 'clock.removed':
      return { ...base, clocks: without(base.clocks, p.clock_id) }

    case 'note.shared': {
      const note = p.note as SharedNote | undefined
      return note ? { ...base, sharedNotes: byOrder(upsert(base.sharedNotes, note)) } : base
    }

    case 'note.unshared':
      return { ...base, sharedNotes: without(base.sharedNotes, p.note_id) }

    case 'map.activated': {
      const m = p.map as BattleMap | undefined
      return m ? { ...base, activeMap: m, room: { ...base.room, active_map_id: m.id } } : base
    }
    case 'map.updated': {
      const m = p.map as BattleMap | undefined
      if (!m) return base
      // обновилась та, что на столе, — заменить; спрятали — убрать со стола
      if (base.activeMap?.id === m.id || base.room.active_map_id === m.id) return { ...base, activeMap: m.revealed || base.me.role === 'dm' ? m : null }
      return base
    }
    case 'map.token_moved': {
      const am = base.activeMap
      if (!am) return base
      return { ...base, activeMap: { ...am, tokens: am.tokens.map((t) => (t.id === p.token_id ? { ...t, x: p.x, y: p.y, elevation_ft: p.elevation_ft ?? t.elevation_ft } : t)) } }
    }
    case 'map.door': {
      const am = base.activeMap
      if (!am) return base
      return { ...base, activeMap: { ...am, walls: am.walls.map((w) => (w.id === p.wall_id ? { ...w, door: { ...(w.door ?? { open: false, locked: false }), open: !!p.open, locked: !!p.locked } } : w)) } }
    }

    case 'dice.revealed': {
      const at = Number(p.rolled_seq)
      return Number.isFinite(at) && !base.revealed.includes(at) ? { ...base, revealed: [...base.revealed, at] } : base
    }

    default:
      // dice.*, content.*, combat.action_reverted, item.transferred, currency.transferred,
      // noop: меняют только журнал и анимации (см. describeEvent / подписчиков)
      return base
  }
}

/* ---------- журнал ---------- */

const nameOf = (state: RoomData, id: string | null | undefined): string => {
  if (!id) return ''
  const card = state.characters.find((c) => c.id === id)
  if (card) return card.name
  const m = state.members.find((x) => x.user_id === id || x.room_character_id === id)
  return m?.display_name || m?.nickname || ''
}

const unitName = (state: RoomData, combatantId: string): string => {
  const c = state.combat?.combatants.find((x) => x.id === combatantId)
  const cr = c?.creature
  return c?.card?.name ?? (cr ? ('snapshot' in cr ? cr.display_name : cr.name) : '')
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Грани кости для журнала: отброшенные (kh/kl/dh/dl) — в скобках */
const facesOf = (d: DiceRollEvent['dice'][number]) => d.rolls.map((v, i) => (d.dropped?.includes(i) ? `(${v})` : String(v))).join(', ')

export function rollSummary(r: DiceRollEvent): string {
  // прибавочные кости эффектов подписаны: «+ Благословение 1к4 [3]»
  const parts = r.dice.map((d, i) => `${i === 0 ? (d.sign < 0 ? '−' : '') : d.sign < 0 ? '− ' : '+ '}${d.source ? `${d.source} ` : ''}${d.rolls.length}к${d.sides} [${facesOf(d)}]`)
  return `${parts.join(' ')}${r.modifier ? ` ${signed(r.modifier)}` : ''} = ${r.total}`
}

/** Что показать в общем журнале; null — событие в журнал не идёт */
export function describeEvent(state: RoomData, msg: RoomEventMessage): RoomLogEntry | null {
  const p = (msg.payload ?? {}) as P
  const key = `${msg.seq ?? `t${msg.ts ?? ''}`}:${msg.type}`
  const base = { key, seq: msg.seq, ts: msg.ts ?? new Date().toISOString(), type: msg.type }
  const who = msg.actor?.label ?? null

  switch (msg.type) {
    case 'dice.rolled': {
      const roll = p as unknown as RollPayload
      if (isEngineRoll(roll)) {
        return { ...base, kind: 'roll', who: nameOf(state, roll.character_id) || who, text: `${roll.label}: ${roll.engine.dice} [${roll.engine.rolls.join(', ')}] = ${roll.engine.total}` }
      }
      const hidden = roll.visibility && roll.visibility !== 'public' ? (roll.visibility === 'blind' ? 'вслепую · ' : 'скрыто · ') : ''
      return { ...base, kind: 'roll', who: nameOf(state, roll.character_id) || who, text: `${hidden}${roll.label || roll.expression}: ${rollSummary(roll)}`, roll }
    }
    case 'dice.revealed': {
      const roll = p as unknown as DiceRollEvent
      if (!roll.dice) return null
      return { ...base, kind: 'roll', who: nameOf(state, roll.character_id) || who, text: `раскрыт бросок · ${roll.label || roll.expression}: ${rollSummary(roll)}`, roll: { ...roll, visibility: 'public' } }
    }
    case 'combat.effect_applied': {
      const label = (p.effect as { label?: string } | undefined)?.label ?? 'состояние'
      const names = ((p.targets ?? []) as { combatant_id: string }[]).map((t) => unitName(state, t.combatant_id)).filter(Boolean)
      return { ...base, kind: 'combat', who, text: `${label}: ${names.join(', ') || 'цели'}` }
    }
    case 'concentration.ended':
    case 'effect.ended': {
      const removed = ((p.removed ?? []) as { label?: string }[]).map((r) => r.label).filter(Boolean)
      const what = String(p.label ?? '').replace(/^концентрация:\s*/i, '')
      return { ...base, kind: 'combat', who, text: `${msg.type === 'concentration.ended' ? 'Концентрация прервана' : 'Действие закончилось'}${what ? `: ${what}` : ''}${removed.length ? ` — сняты ${removed.join(', ')}` : ''}` }
    }
    case 'room.rest':
      return { ...base, kind: 'room', who, text: p.kind === 'long' ? 'Партия отдыхает: продолжительный отдых' : 'Партия делает короткий привал' }
    case 'note.shared':
      return { ...base, kind: 'room', who, text: `Мастер открыл заметку «${(p.note as SharedNote | undefined)?.title ?? ''}»` }
    case 'combat.concentration_save': {
      const c = p as unknown as ConcentrationSave
      const name = unitName(state, c.combatant_id)
      return { ...base, kind: 'combat', who: name, text: c.success ? `держит концентрацию (${c.roll.total} против Сл ${c.dc})` : `теряет концентрацию (${c.roll.total} против Сл ${c.dc})${c.lost.length ? `: ${c.lost.join(', ')}` : ''}` }
    }
    case 'combat.save_ends': {
      const c = p as unknown as SaveEndsResult
      return { ...base, kind: 'combat', who: unitName(state, c.combatant_id), text: c.success ? `стряхивает «${c.effect}» (${c.roll.total} против Сл ${c.dc})` : `всё ещё под «${c.effect}» (${c.roll.total} против Сл ${c.dc})` }
    }
    case 'item.issued': {
      if (p.item) {
        const it = p.item as RoomItem
        const name = it.equipment?.equipment_name ?? it.magic_item?.item_name ?? 'предмет'
        return { ...base, kind: 'item', who, text: `${it.holder === 'screen' ? 'За ширму' : 'На стол'}: ${name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}` }
      }
      return { ...base, kind: 'item', who, text: `${nameOf(state, p.character_id) || 'Персонаж'} получает ${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ''}` }
    }
    case 'item.claimed':
      return { ...base, kind: 'item', who: p.character_name, text: `забирает ${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ''} со стола` }
    case 'item.transferred':
      return { ...base, kind: 'item', who: nameOf(state, p.from_character_id), text: `передаёт ${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ''}: ${nameOf(state, p.to_character_id) || 'другому персонажу'}` }
    case 'item.taken_back':
      return { ...base, kind: 'item', who, text: p.from === 'table' ? 'Предмет убран со стола' : `Мастер забирает ${p.name ?? 'предмет'}` }
    case 'currency.transferred': {
      const amount = Object.entries(p.amount ?? {}).map(([k, v]) => `${v} ${k}`).join(', ')
      return { ...base, kind: 'item', who: nameOf(state, p.from_character_id), text: `передаёт ${amount}: ${nameOf(state, p.to_character_id) || 'другому персонажу'}` }
    }
    case 'combat.started':
      return { ...base, kind: 'combat', who, text: 'Бой начался' }
    case 'combat.ended':
      return { ...base, kind: 'combat', who, text: 'Бой окончен' }
    case 'combat.turn': {
      const v = p as unknown as CombatView
      const cur = v.combatants?.find((c) => c.id === v.current_combatant_id)
      const cr = cur?.creature
      const name = cur?.card?.name ?? (cr ? ('snapshot' in cr ? cr.display_name : cr.name) : '')
      return name ? { ...base, kind: 'combat', who, text: `Ход: ${name} (раунд ${v.round})` } : null
    }
    case 'combat.action': {
      const a = p as unknown as CombatActionResult
      if (a.secret) return { ...base, kind: 'combat', who, text: 'Скрытое действие' }
      const unit = (id: string) => {
        const c = state.combat?.combatants.find((x) => x.id === id)
        const cr = c?.creature
        return c?.card?.name ?? (cr ? ('snapshot' in cr ? cr.display_name : cr.name) : 'цель')
      }
      const parts = (a.targets ?? []).map((t) => {
        const dmg = t.damage.reduce((sum, d) => sum + (d.taken ?? d.amount ?? d.roll.total), 0)
        const res = t.attack ? (t.crit ? 'крит' : t.hit ? 'попал' : 'промах') : t.save ? (t.saved ? 'спас' : 'провал') : ''
        return `${unit(t.combatant_id)}${res ? ` (${res})` : ''}${dmg > 0 && (t.hit || !t.attack) ? ` −${dmg}` : ''}${t.healed ? ` +${t.healed}` : ''}`
      })
      const head = `${unit(a.actor_combatant_id)}: ${a.label || 'действие'}`
      return { ...base, kind: 'combat', who, text: parts.length ? `${head} → ${parts.join(', ')}` : head }
    }
    case 'member.approved':
      return { ...base, kind: 'member', who: p.card?.name, text: 'вступает в партию' }
    case 'member.left':
      return { ...base, kind: 'member', who, text: 'покидает партию' }
    case 'member.kicked':
      return { ...base, kind: 'member', who, text: 'исключён из комнаты' }
    case 'room.status':
      return { ...base, kind: 'room', who, text: `Статус комнаты: ${statusRu(p.status)}` }
    case 'character.updated':
      return p.label ? { ...base, kind: 'room', who: p.card?.name, text: String(p.label) } : null
    default:
      return null
  }
}

export const statusRu = (s: string): string =>
  ({ lobby: 'сбор', active: 'идёт игра', paused: 'перерыв', closed: 'закрыта' })[s] ?? s

/** Добавить запись в журнал без дубликатов; старейшие обрезаем */
export function pushLog(state: RoomData, entry: RoomLogEntry): RoomData {
  if (state.log.some((e) => e.key === entry.key)) return state
  const log = [...state.log, entry]
  return { ...state, log: log.length > LOG_LIMIT ? log.slice(log.length - LOG_LIMIT) : log }
}

export type { RoomCreature }
