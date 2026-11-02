/**
 * Бой комнаты: игроки снизу, враги сверху, порядок хода полосой сверху — как в
 * пошаговых тактических играх. Карты пока нет (только хранение).
 *
 * Сервер бросает кости и применяет результат; формулу урона присылает клиент:
 * заклинания и действия существ в каталоге лежат текстом. Экран меняют только
 * события, ответ запроса — лишь для сообщения об ошибке.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Dices, Flag, Plus, Skull, Swords, Undo2, Wand2 } from 'lucide-react'
import { ApiError, getEngineDictionaries, getSheet, roomCharacterRef, type EngineDictionaries } from '../api'
import { parsePortrait } from '../characters/portrait'
import { SheetModal } from '../characters/SheetModal'
import { playForcedRoll, type ForcedDie } from '../dice/diceControl'
import type { CombatActionRequest, CombatActionResult, CombatantView, RolledDice, StatKey } from '../types/rooms'
import { creatureArt, creatureName, CreatureArt, HpMeter } from './Creatures'
import { useRoom, useRoomEvents } from './RoomProvider'
import { addCombatants, beginCombat, combatAction, endCombat, nextTurn, revertCombatAction, rollInitiative, setInitiative, startCombat } from './roomsApi'
import { RoomAvatar } from './ui'

const errText = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'Сейчас так нельзя: не ваш ход, бой изменился или комната закрыта. Данные обновятся сами.'
    if (e.status === 422) return `Не получилось: ${e.message}`
    if (e.status === 404) return 'Цель или участник не найден.'
  }
  return e instanceof Error ? e.message : 'Ошибка сервера'
}

const nameOf = (c: CombatantView): string => c.card?.name ?? (c.creature ? creatureName(c.creature) : 'Участник')
const artOf = (c: CombatantView): string | null => (c.card ? parsePortrait(c.card.avatar_url).src : c.creature ? creatureArt(c.creature) : null)

const ABILITIES: { key: StatKey; label: string }[] = [
  { key: 'str', label: 'Сила' },
  { key: 'dex', label: 'Ловкость' },
  { key: 'con', label: 'Телосложение' },
  { key: 'int', label: 'Интеллект' },
  { key: 'wis', label: 'Мудрость' },
  { key: 'cha', label: 'Харизма' },
]
const SPELL_CIRCLES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/* ---------- кубики боевого результата ---------- */

const diceOf = (r: RolledDice | null | undefined): ForcedDie[] => (r ? r.dice.flatMap((d) => d.rolls.map((value) => ({ sides: d.sides, value }))) : [])

/** Чем закончился бросок для подписи цели */
function describeTarget(t: CombatActionResult['targets'][number], isDm: boolean): string {
  const parts: string[] = []
  if (t.attack) parts.push(t.crit ? 'критическое попадание' : t.hit ? 'попал' : 'промах')
  else if (t.save) parts.push(t.saved ? 'спасбросок успешен' : 'спасбросок провален')
  const dealt = t.damage.reduce((s, d) => s + (d.taken ?? d.amount ?? 0), 0)
  const rolled = t.damage.reduce((s, d) => s + d.roll.total, 0)
  if (t.damage.length > 0 && (t.hit || !t.attack)) {
    if (isDm && dealt) parts.push(`${dealt} урона`)
    else if (rolled) parts.push(`урон ${rolled}`)
  }
  if (t.healed) parts.push(`+${t.healed} хитов`)
  if (t.effect) parts.push(t.effect)
  return parts.join(', ')
}

/* ---------- одна клетка боя ---------- */

function Unit({ c, current, mine, onPick, picked }: { c: CombatantView; current: boolean; mine: boolean; onPick?: () => void; picked?: boolean }) {
  const cls = `rm-unit is-${c.side}${current ? ' is-current' : ''}${c.defeated ? ' is-defeated' : ''}${mine ? ' is-mine' : ''}${picked ? ' is-picked' : ''}${c.hidden ? ' is-hidden' : ''}`
  const body = (
    <>
      <span className="rm-unit-art">
        {c.card ? <RoomAvatar src={artOf(c)} name={nameOf(c)} size={64} /> : <CreatureArt src={artOf(c)} name={nameOf(c)} size={64} />}
        {c.defeated && <Skull className="rm-unit-skull" aria-label="повержен" />}
        {c.initiative != null && <i className="rm-unit-init" title="Инициатива">{c.initiative}</i>}
      </span>
      <b className="rm-unit-name">{nameOf(c)}</b>
      {c.card ? (
        <span className="rm-meter">
          <span
            className={`rm-meter-fill is-${c.card.hp.max && c.card.hp.current / c.card.hp.max <= 0.25 ? 'low' : c.card.hp.max && c.card.hp.current / c.card.hp.max <= 0.6 ? 'mid' : 'ok'}`}
            style={{ width: `${c.card.hp.max ? Math.max(0, Math.min(100, (c.card.hp.current / c.card.hp.max) * 100)) : 0}%` }}
          />
          <b>
            {c.card.hp.current}/{c.card.hp.max}
          </b>
        </span>
      ) : c.creature ? (
        <HpMeter c={c.creature} />
      ) : null}
      {(c.card?.effects.length ?? 0) > 0 && <span className="rm-unit-fx">{c.card?.effects.join(' · ')}</span>}
    </>
  )
  return onPick ? (
    <button type="button" className={cls} onClick={onPick} aria-pressed={picked} title={picked ? 'Цель выбрана' : 'Выбрать целью'}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ---------- форма действия ---------- */

interface DmgRow {
  dice: string
  type: string
}

function ActionDialog({ actor, onClose }: { actor: CombatantView; onClose: () => void }) {
  const { data, roomId, isDm } = useRoom()
  const combat = data?.combat
  const [kind, setKind] = useState<NonNullable<CombatActionRequest['kind']>>('attack')
  const [label, setLabel] = useState('')
  const [targets, setTargets] = useState<string[]>([])
  const [bonus, setBonus] = useState('')
  const [advantage, setAdvantage] = useState<'adv' | 'dis' | null>(null)
  const [damage, setDamage] = useState<DmgRow[]>([{ dice: '1d8', type: '' }])
  const [heal, setHeal] = useState('')
  const [saveOn, setSaveOn] = useState(false)
  const [saveAbility, setSaveAbility] = useState<StatKey>('dex')
  const [saveDc, setSaveDc] = useState('13')
  const [half, setHalf] = useState(true)
  const [slotLevel, setSlotLevel] = useState<number | null>(null)
  const [pool, setPool] = useState<'spell' | 'pact'>('spell')
  const [reaction, setReaction] = useState(false)
  const [secret, setSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dict, setDict] = useState<EngineDictionaries | null>(null)
  const [hints, setHints] = useState<{ dc?: number; attack?: number }>({})

  useEffect(() => {
    void getEngineDictionaries().then(setDict)
  }, [])
  // подсказки Сл заклинаний и бонуса атаки — из листа героя
  const actorCharacter = actor.card?.id
  useEffect(() => {
    if (!actorCharacter) return
    let alive = true
    getSheet(roomCharacterRef(roomId, actorCharacter))
      .then((s) => {
        if (!alive) return
        const val = (re: RegExp) => Object.entries(s.values).find(([k, v]) => re.test(k) && typeof v === 'number')?.[1] as number | undefined
        setHints({ dc: val(/^char\.class\.[^.]+\.spell_dc$/), attack: val(/^char\.class\.[^.]+\.spell_attack$/) })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId, actorCharacter])

  if (!combat) return null
  const everyone = combat.combatants.filter((c) => !c.defeated || kind === 'other')

  const preset = (k: typeof kind) => {
    setKind(k)
    if (k === 'attack') {
      setSaveOn(false)
      setSlotLevel(null)
      setDamage((d) => (d.length ? d : [{ dice: '1d8', type: '' }]))
    }
    if (k === 'spell') setSlotLevel((l) => l ?? 1)
  }

  const submit = async () => {
    const req: CombatActionRequest = {
      actor_combatant_id: actor.id,
      kind,
      label: label.trim() || undefined,
      target_ids: targets,
      as_reaction: reaction || undefined,
      secret: isDm && secret ? true : undefined,
    }
    const dmg = damage.filter((d) => d.dice.trim()).map((d) => ({ dice: d.dice.trim(), type: d.type || null }))
    if (dmg.length) req.damage = dmg.slice(0, 6)
    if (heal.trim()) req.heal_dice = heal.trim()
    if (bonus.trim() !== '' && !Number.isNaN(Number(bonus))) req.attack_bonus = Number(bonus)
    if (advantage) req.advantage = advantage
    if (saveOn) req.save = { ability: saveAbility, dc: Number(saveDc) || 10, half_on_success: half }
    if (slotLevel) req.slot = { level: slotLevel, pool }
    setBusy(true)
    setError(null)
    try {
      await combatAction(roomId, combat.id, req)
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const toggleTarget = (id: string) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id].slice(0, 30)))
  const setRow = (i: number, patch: Partial<DmgRow>) => setDamage((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <SheetModal
      title={nameOf(actor)}
      kicker="действие в бою"
      tone="action"
      visual={<Swords className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={busy || targets.length === 0 && kind !== 'other'} onClick={() => void submit()}>
            <Dices aria-hidden="true" /> Выполнить
          </button>
        </>
      }
    >
      <div className="rm-form rm-action">
        <div className="rm-seg" role="tablist" aria-label="Тип действия">
          {(
            [
              ['attack', 'Атака', Swords],
              ['spell', 'Заклинание', Wand2],
              ['other', 'Другое', Flag],
            ] as const
          ).map(([k, text, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => preset(k)}>
              <Icon aria-hidden="true" /> {text}
            </button>
          ))}
        </div>

        <div className="rm-field">
          <span>Название</span>
          <input value={label} placeholder={kind === 'spell' ? 'Огненный шар' : kind === 'attack' ? 'Длинный меч' : 'Что делает'} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div className="rm-field">
          <span>Цели · {targets.length}</span>
          <div className="rm-targets" role="group" aria-label="Цели">
            {everyone.map((c) => (
              <button key={c.id} type="button" className={`rm-target is-${c.side}${targets.includes(c.id) ? ' is-on' : ''}`} aria-pressed={targets.includes(c.id)} onClick={() => toggleTarget(c.id)}>
                {nameOf(c)}
              </button>
            ))}
          </div>
        </div>

        {(kind === 'attack' || kind === 'spell') && (
          <div className="rm-row">
            <label className="rm-field">
              <span>Бонус атаки</span>
              <input type="number" inputMode="numeric" value={bonus} placeholder="без броска" onChange={(e) => setBonus(e.target.value)} />
              {hints.attack != null && (
                <button type="button" className="rm-hintbtn" onClick={() => setBonus(String(hints.attack))}>
                  атака заклинанием {hints.attack >= 0 ? '+' : ''}
                  {hints.attack}
                </button>
              )}
            </label>
            <div className="rm-field">
              <span>Преимущество</span>
              <div className="rm-seg">
                {([[null, 'Обычно'], ['adv', 'Преим.'], ['dis', 'Помеха']] as const).map(([v, text]) => (
                  <button key={text} type="button" className={advantage === v ? 'is-on' : ''} aria-pressed={advantage === v} onClick={() => setAdvantage(v)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="rm-field">
          <span>Урон</span>
          {damage.map((d, i) => (
            <div key={i} className="rm-dmg">
              <input value={d.dice} placeholder="2d6+3" aria-label="Кости урона" onChange={(e) => setRow(i, { dice: e.target.value })} />
              <select value={d.type} aria-label="Тип урона" onChange={(e) => setRow(i, { type: e.target.value })}>
                <option value="">без типа</option>
                {(dict?.damage_types ?? []).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button type="button" className="cw-mini-btn" onClick={() => setDamage((r) => r.filter((_, j) => j !== i))} aria-label="Убрать строку урона">
                ×
              </button>
            </div>
          ))}
          {damage.length < 6 && (
            <button type="button" className="cw-mini-btn" onClick={() => setDamage((r) => [...r, { dice: '', type: '' }])}>
              <Plus aria-hidden="true" /> ещё урон
            </button>
          )}
        </div>

        <div className="rm-row">
          <label className="rm-field">
            <span>Лечение</span>
            <input value={heal} placeholder="2d4+2" onChange={(e) => setHeal(e.target.value)} />
          </label>
          <div className="rm-field">
            <span>Ячейка</span>
            <div className="rm-row is-tight">
              <select value={slotLevel ?? ''} onChange={(e) => setSlotLevel(e.target.value ? Number(e.target.value) : null)} aria-label="Круг ячейки">
                <option value="">не тратить</option>
                {SPELL_CIRCLES.map((n) => (
                  <option key={n} value={n}>
                    {n} круг
                  </option>
                ))}
              </select>
              <select value={pool} onChange={(e) => setPool(e.target.value as 'spell' | 'pact')} aria-label="Откуда ячейка" disabled={!slotLevel}>
                <option value="spell">обычная</option>
                <option value="pact">договор</option>
              </select>
            </div>
          </div>
        </div>

        <label className="rm-check">
          <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} />
          <span>Цели делают спасбросок</span>
        </label>
        {saveOn && (
          <div className="rm-row">
            <select value={saveAbility} onChange={(e) => setSaveAbility(e.target.value as StatKey)} aria-label="Характеристика спасброска">
              {ABILITIES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <label className="rm-field">
              <span>Сл</span>
              <input type="number" inputMode="numeric" value={saveDc} onChange={(e) => setSaveDc(e.target.value)} />
              {hints.dc != null && (
                <button type="button" className="rm-hintbtn" onClick={() => setSaveDc(String(hints.dc))}>
                  Сл заклинаний {hints.dc}
                </button>
              )}
            </label>
            <label className="rm-check">
              <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
              <span>половина урона при успехе</span>
            </label>
          </div>
        )}

        <div className="rm-row">
          <label className="rm-check">
            <input type="checkbox" checked={reaction} onChange={(e) => setReaction(e.target.checked)} />
            <span>Это реакция (не в свой ход)</span>
          </label>
          {isDm && (
            <label className="rm-check">
              <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
              <span>Скрытое действие</span>
            </label>
          )}
        </div>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/* ---------- добавление участников ---------- */

function AddUnitsDialog({ onClose }: { onClose: () => void }) {
  const { data, roomId } = useRoom()
  const combat = data?.combat
  const [chars, setChars] = useState<string[]>([])
  const [creatures, setCreatures] = useState<string[]>([])
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data || !combat) return null
  const inFight = new Set(combat.combatants.map((c) => c.ref_id))
  const freeChars = data.characters.filter((c) => !inFight.has(c.id))
  const freeCreatures = data.creatures.filter((c) => !inFight.has(c.id))
  const toggle = (set: string[], id: string, fn: (v: string[]) => void) => fn(set.includes(id) ? set.filter((x) => x !== id) : [...set, id])

  return (
    <SheetModal
      title="Добавить в бой"
      kicker="участники"
      tone="action"
      visual={<Plus className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="cs-btn cw-next"
            disabled={busy || chars.length + creatures.length === 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await addCombatants(roomId, combat.id, { character_ids: chars, creature_ids: creatures, hidden })
                onClose()
              } catch (e) {
                setError(errText(e))
                setBusy(false)
              }
            }}
          >
            Добавить
          </button>
        </>
      }
    >
      <div className="rm-form">
        {freeChars.length + freeCreatures.length === 0 && <p className="muted">Все уже в бою.</p>}
        {freeChars.length > 0 && (
          <div className="rm-field">
            <span>Герои</span>
            {freeChars.map((c) => (
              <label key={c.id} className="rm-check">
                <input type="checkbox" checked={chars.includes(c.id)} onChange={() => toggle(chars, c.id, setChars)} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        )}
        {freeCreatures.length > 0 && (
          <div className="rm-field">
            <span>Существа</span>
            {freeCreatures.map((c) => (
              <label key={c.id} className="rm-check">
                <input type="checkbox" checked={creatures.includes(c.id)} onChange={() => toggle(creatures, c.id, setCreatures)} />
                <span>{creatureName(c)}</span>
              </label>
            ))}
          </div>
        )}
        <label className="rm-check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>Скрытые: игроки не видят их в бою</span>
        </label>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/* ---------- сцена боя ---------- */

export function CombatStage({ bare = false }: { bare?: boolean }) {
  const { data, roomId, isDm } = useRoom()
  const [acting, setActing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feed, setFeed] = useState<{ id: string; actor: string; label: string; secret: boolean; lines: { who: string; text: string }[]; at: number }[]>([])
  const [lastAction, setLastAction] = useState<string | null>(null)

  // результат действия: кости катятся, затем строки по целям
  useRoomEvents((msg) => {
    if (msg.type !== 'combat.action' || !data?.combat) return
    const res = msg.payload as CombatActionResult
    const by = new Map(data.combat.combatants.map((c) => [c.id, c]))
    const actor = by.get(res.actor_combatant_id)
    const lines = (res.targets ?? []).map((t) => ({ who: by.get(t.combatant_id) ? nameOf(by.get(t.combatant_id) as CombatantView) : 'Цель', text: describeTarget(t, isDm) })).filter((l) => l.text)
    setLastAction(res.action_id)
    const entry = { id: res.action_id, actor: actor ? nameOf(actor) : '', label: res.label || 'Действие', secret: res.secret, lines, at: Date.now() }
    // кубики: бросок атаки и урона первой цели; значения серверные
    const first = res.targets?.[0]
    const dice = [...diceOf(first?.attack), ...(first?.hit !== false ? diceOf(first?.damage?.[0]?.roll) : [])].slice(0, 12)
    const show = () => {
      setFeed((f) => [...f.slice(-2), entry])
      setTimeout(() => setFeed((f) => f.filter((x) => x.id !== entry.id)), 9000)
    }
    if (dice.length > 0 && document.visibilityState === 'visible' && !res.secret) void playForcedRoll({ dice }).then(show, show)
    else show()
  })

  const combat = data?.combat
  const mine = data?.me.room_character_id
  const byId = useMemo(() => new Map((combat?.combatants ?? []).map((c) => [c.id, c])), [combat])
  if (!data || !combat || combat.status === 'ended') return null

  const party = combat.combatants.filter((c) => c.side === 'party').sort((a, b) => a.slot - b.slot)
  const enemies = combat.combatants.filter((c) => c.side === 'enemies').sort((a, b) => a.slot - b.slot)
  const current = combat.current_combatant_id ? byId.get(combat.current_combatant_id) : undefined
  const myUnit = combat.combatants.find((c) => c.kind === 'character' && c.ref_id === mine)
  const myTurn = !!myUnit && myUnit.id === combat.current_combatant_id
  const setup = combat.status === 'setup'
  const closed = data.room.status === 'closed'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const actor = isDm ? (current ?? combat.combatants.find((c) => !c.defeated)) : myUnit
  const needsRoll = (c: CombatantView) => c.initiative == null

  return (
    <section className={bare ? 'rm-combat is-bare' : 'rm-panel rm-combat'} aria-label="Бой">
      <header className="rm-combat-head">
        <h3 className="rm-panel-title">
          <Swords aria-hidden="true" /> {setup ? 'Подготовка к бою' : `Бой · раунд ${combat.round}`}
        </h3>
        <span className="rm-combat-acts">
          {isDm && (
            <button type="button" className="cw-mini-btn" disabled={busy || closed} onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" /> участники
            </button>
          )}
          {isDm && !setup && (
            <button
              type="button"
              className="cw-mini-btn cw-mini-btn--danger"
              disabled={busy || closed}
              onClick={() => confirm('Закончить бой?') && void run(() => endCombat(roomId, combat.id))}
            >
              <Flag aria-hidden="true" /> закончить бой
            </button>
          )}
        </span>
      </header>

      {/* порядок хода */}
      <ol className="rm-order" aria-label="Порядок хода">
        {combat.combatants.map((c) => (
          <li key={c.id} className={`is-${c.side}${c.id === combat.current_combatant_id ? ' is-current' : ''}${c.defeated ? ' is-defeated' : ''}`} title={nameOf(c)}>
            <b>{nameOf(c)}</b>
            <i>{c.initiative ?? '—'}</i>
          </li>
        ))}
      </ol>

      {/* арена: враги сверху, партия снизу */}
      <div className="rm-arena">
        <div className="rm-row-units is-enemies">
          {enemies.length === 0 && <p className="rm-hint">Врагов не видно.</p>}
          {enemies.map((c) => (
            <Unit key={c.id} c={c} current={c.id === combat.current_combatant_id} mine={false} />
          ))}
        </div>
        <div className="rm-row-units is-party">
          {party.map((c) => (
            <Unit key={c.id} c={c} current={c.id === combat.current_combatant_id} mine={c.id === myUnit?.id} />
          ))}
        </div>
        {feed.length > 0 && (
          <div className="rm-feed" role="log" aria-live="polite">
            {feed.map((f) => (
              <div key={f.id} className={`rm-feed-item${f.secret ? ' is-secret' : ''}`}>
                <b>
                  {f.actor && `${f.actor}: `}
                  {f.label}
                </b>
                {f.lines.map((l, i) => (
                  <span key={i}>
                    {l.who} — {l.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* управление */}
      <div className="rm-combat-controls">
        {setup ? (
          <>
            {myUnit && needsRoll(myUnit) && (
              <button type="button" className="cs-btn" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, { combatant_ids: [myUnit.id] }))}>
                <Dices aria-hidden="true" /> Бросить инициативу
              </button>
            )}
            {isDm && (
              <>
                <button type="button" className="cs-btn" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, {}))}>
                  <Dices aria-hidden="true" /> Бросить за всех
                </button>
                <button type="button" className="cs-btn cw-next" disabled={busy || closed} onClick={() => void run(() => beginCombat(roomId, combat.id))}>
                  <ChevronRight aria-hidden="true" /> Начать бой
                </button>
                <InitiativeEditor />
              </>
            )}
            {!isDm && <p className="rm-hint">Мастер начнёт бой, когда все бросят инициативу.</p>}
          </>
        ) : (
          <>
            <p className="rm-turn">
              {current ? (
                <>
                  Ходит: <b>{nameOf(current)}</b>
                </>
              ) : (
                'Ходит скрытый участник'
              )}
            </p>
            {actor && (
              <button type="button" className="cs-btn" disabled={busy || closed} onClick={() => setActing(true)}>
                <Swords aria-hidden="true" /> {isDm ? 'Действие' : myTurn ? 'Ваш ход: действие' : 'Реакция'}
              </button>
            )}
            {(isDm || myTurn) && (
              <button type="button" className="cs-btn cw-next" disabled={busy || closed} onClick={() => void run(() => nextTurn(roomId, combat.id))}>
                <ChevronRight aria-hidden="true" /> Следующий ход
              </button>
            )}
            {isDm && lastAction && (
              <button type="button" className="cw-mini-btn" disabled={busy || closed} onClick={() => void run(() => revertCombatAction(roomId, combat.id, lastAction).then(() => setLastAction(null)))} title="Откатить последнее действие">
                <Undo2 aria-hidden="true" /> отменить действие
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="auth-error">{error}</p>}
      {acting && actor && <ActionDialog actor={myTurn || !isDm ? (myUnit ?? actor) : actor} onClose={() => setActing(false)} />}
      {adding && <AddUnitsDialog onClose={() => setAdding(false)} />}
    </section>
  )
}

/** Мастер вписывает инициативу руками: перед началом боя */
function InitiativeEditor() {
  const { data, roomId } = useRoom()
  const combat = data?.combat
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  if (!combat) return null
  return (
    <>
      <button type="button" className="cw-mini-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        вписать вручную
      </button>
      {open && (
        <div className="rm-init-edit">
          {combat.combatants.map((c) => (
            <label key={c.id}>
              <span>{nameOf(c)}</span>
              <input type="number" inputMode="numeric" value={vals[c.id] ?? c.initiative ?? ''} onChange={(e) => setVals((v) => ({ ...v, [c.id]: e.target.value }))} />
            </label>
          ))}
          <button
            type="button"
            className="cs-btn"
            disabled={busy}
            onClick={async () => {
              const values = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))
              if (Object.keys(values).length === 0) return
              setBusy(true)
              try {
                await setInitiative(roomId, combat.id, values)
                setOpen(false)
                setVals({})
              } finally {
                setBusy(false)
              }
            }}
          >
            Сохранить
          </button>
        </div>
      )}
    </>
  )
}

/** Мастер: начать бой с выбранными существами (герои идут все) */
export function StartCombatButton({ selected }: { selected: string[] }) {
  const { data, roomId } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data) return null
  const active = !!data.combat && data.combat.status !== 'ended'
  return (
    <div className="rm-start">
      <button
        type="button"
        className="cs-btn"
        disabled={busy || active || data.room.status === 'closed'}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await startCombat(roomId, { character_ids: data.characters.map((c) => c.id), creature_ids: selected })
          } catch (e) {
            setError(errText(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Swords aria-hidden="true" /> {active ? 'Бой уже идёт' : `Начать бой${selected.length ? `: ${selected.length} сущ.` : ''}`}
      </button>
      {!active && selected.length === 0 && <span className="rm-hint">Отметьте существ галочками слева от карточек.</span>}
      {error && <span className="auth-error">{error}</span>}
    </div>
  )
}

