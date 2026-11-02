/**
 * Бой — отдельная сцена. Герои и существа стоят в полный рост (размер из
 * бестиария: огр выше гоблина), под ногами — перевёрнутый сплюснутый спидометр
 * хитов. Цели выбирают нажатием прямо по фигурам, результат виден на самих
 * фигурах: вылетающие числа, тряска, павшие падают.
 *
 * Кости бросает сервер; экран меняют только события.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronRight, ChevronsUp, Dices, Flag, Plus, Swords, Undo2, UserRound, Wand2, X, Zap } from 'lucide-react'
import { ApiError, getCharacter, getEngineDictionaries, getSheet, roomCharacterRef, type EngineDictionaries } from '../../api'
import { parsePortrait } from '../../characters/portrait'
import { playForcedRoll, type ForcedDie } from '../../dice/diceControl'
import type { AttackEntry } from '../../types/character'
import type { CombatActionRequest, CombatActionResult, CombatantView, RolledDice, StatKey } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { addCombatants, beginCombat, combatAction, endCombat, nextTurn, revertCombatAction, rollInitiative, setInitiative } from '../roomsApi'
import { CreatureCard, HeroCard } from './Cards'
import { cardRatio, creatureArt, creatureHp, creatureName, creatureSize, Hex, HpArc, originFromEvent, seed, Silhouette, type Origin } from './parts'
import { TopBar } from './TopBar'

const errText = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'Сейчас так нельзя: не ваш ход или бой изменился.'
    if (e.status === 422) return `Не получилось: ${e.message}`
    if (e.status === 404) return 'Цель или участник не найден.'
  }
  return e instanceof Error ? e.message : 'Ошибка сервера'
}

const nameOf = (c: CombatantView): string => c.card?.name ?? (c.creature ? creatureName(c.creature) : 'Участник')
const artOf = (c: CombatantView): string | null => (c.card ? parsePortrait(c.card.avatar_url).src : c.creature ? creatureArt(c.creature) : null)

/** Во сколько раз фигура выше среднего существа */
const SIZE_K: Record<string, number> = { Tiny: 0.55, Small: 0.78, Medium: 1, Large: 1.32, Huge: 1.68, Gargantuan: 2 }
const sizeK = (c: CombatantView) => (c.creature ? (SIZE_K[creatureSize(c.creature) ?? 'Medium'] ?? 1) : 1)

const diceOf = (r: RolledDice | null | undefined): ForcedDie[] => (r ? r.dice.flatMap((d) => d.rolls.map((value) => ({ sides: d.sides, value }))) : [])

const normDice = (s: string) => s.replace(/[кk]/gi, 'd').replace(/\s+/g, '')

/** Как цель выглядела до удара: показываем это, пока не легли кости */
type Held = Record<string, Pick<CombatantView, 'card' | 'creature' | 'defeated'>>

/* ---------- что вылетает над фигурой ---------- */

interface Floater {
  id: string
  text: string
  tone: 'dmg' | 'crit' | 'hit' | 'miss' | 'heal' | 'save' | 'fx'
  /** задержка, чтобы несколько чисел не слипались */
  delay: number
}

const dealtBy = (t: CombatActionResult['targets'][number]) => t.damage.reduce((s, d) => s + (d.taken ?? d.amount ?? d.roll.total), 0)
/** Урон проходит: попали или броска атаки не было */
const landed = (t: CombatActionResult['targets'][number]) => t.hit || !t.attack

/** Что показать сразу после d20: попал или нет */
function verdictOf(t: CombatActionResult['targets'][number], key: string): Floater[] {
  if (t.attack) {
    // кубик может лечь где угодно: итог броска пишем рядом с вердиктом
    const total = t.attack.total
    if (!t.hit) return [{ id: `${key}-v`, text: `${total} · Промах`, tone: 'miss', delay: 0 }]
    return [{ id: `${key}-v`, text: t.crit ? `${total} · Крит!` : `${total} · Попал`, tone: t.crit ? 'crit' : 'hit', delay: 0 }]
  }
  if (t.save) return [{ id: `${key}-v`, text: `${t.save.total} · ${t.saved ? 'Спасся' : 'Не спасся'}`, tone: t.saved ? 'save' : 'miss', delay: 0 }]
  return []
}

/** Что показать, когда легли кости урона */
function impactOf(t: CombatActionResult['targets'][number], key: string): Floater[] {
  const out: Floater[] = []
  let delay = 0
  const push = (text: string, tone: Floater['tone']) => {
    out.push({ id: `${key}-i${out.length}`, text, tone, delay })
    delay += 220
  }
  const dealt = dealtBy(t)
  if (dealt > 0 && landed(t)) push(`−${dealt}`, t.crit ? 'crit' : 'dmg')
  if (t.healed) push(`+${t.healed}`, 'heal')
  if (t.effect) push(t.effect, 'fx')
  return out
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/* ---------- фигура ---------- */

function Figure({
  c,
  current,
  mine,
  targeting,
  picked,
  floaters,
  anim,
  setup,
  isDm,
  onClick,
  onInit,
}: {
  c: CombatantView
  current: boolean
  mine: boolean
  targeting: boolean
  picked: boolean
  floaters: Floater[]
  anim: string | null
  setup: boolean
  isDm: boolean
  onClick: (o: Origin) => void
  onInit: (v: number) => void
}) {
  const art = artOf(c)
  const [broken, setBroken] = useState(false)
  const [initVal, setInitVal] = useState<string | null>(null)
  const hp = c.card ? { ratio: cardRatio(c.card), current: c.card.hp.current, max: c.card.hp.max, temp: c.card.hp.temp } : c.creature ? creatureHp(c.creature) : { ratio: null }
  const k = sizeK(c)
  const cls = [
    'bt-fig',
    `is-${c.side}`,
    current && 'is-current',
    mine && 'is-mine',
    c.defeated && 'is-defeated',
    c.hidden && 'is-hidden',
    targeting && 'is-targetable',
    picked && 'is-picked',
    anim && `do-${anim}`,
  ]
    .filter(Boolean)
    .join(' ')
  const sway = (seed(c.id, 8) * 2).toFixed(2)
  return (
    <div className={cls} style={{ '--k': k, '--sway': `${sway}s` } as CSSProperties}>
      <button type="button" className="bt-fig-hit" onClick={(e) => onClick(originFromEvent(e))} aria-pressed={targeting ? picked : undefined} aria-label={`${nameOf(c)}${targeting ? (picked ? ': цель выбрана' : ': выбрать целью') : ': открыть карточку'}`}>
        <span className="bt-fig-ground" aria-hidden="true" />
        <span className="bt-fig-body">
          {art && !broken ? <img src={art} alt="" draggable={false} onError={() => setBroken(true)} /> : <Silhouette enemy={c.side === 'enemies'} />}
        </span>
        {targeting && (
          <svg className="bt-reticle" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="44" />
            <path d="M50 0V16M50 84V100M0 50H16M84 50H100" />
          </svg>
        )}
      </button>
      {current && <ChevronsUp className="bt-fig-turn" aria-hidden="true" />}
      <HpArc ratio={hp.ratio} current={hp.current} max={hp.max} temp={hp.temp} band={'band' in hp ? hp.band : undefined} />
      <b className="bt-fig-name">{nameOf(c)}</b>
      {setup && (
        isDm ? (
          <input
            className="bt-fig-init"
            type="number"
            inputMode="numeric"
            aria-label={`Инициатива: ${nameOf(c)}`}
            placeholder="—"
            value={initVal ?? c.initiative ?? ''}
            onChange={(e) => setInitVal(e.target.value)}
            onBlur={() => {
              if (initVal != null && initVal !== '' && Number(initVal) !== c.initiative) onInit(Number(initVal))
              setInitVal(null)
            }}
          />
        ) : (
          <i className="bt-fig-init">{c.initiative ?? '?'}</i>
        )
      )}
      {floaters.map((f) => (
        <span key={f.id} className={`bt-float is-${f.tone}`} style={{ animationDelay: `${f.delay}ms` }}>
          {f.text}
        </span>
      ))}
    </div>
  )
}

/* ---------- порядок хода ---------- */

function TurnStrip({ list, current }: { list: CombatantView[]; current: string | null }) {
  // идущий сейчас всегда первым: очередь как в тактических RPG
  const at = Math.max(0, list.findIndex((c) => c.id === current))
  const order = [...list.slice(at), ...list.slice(0, at)]
  return (
    <ol className="bt-strip" aria-label="Порядок хода">
      {order.map((c, i) => (
        <li key={c.id} className={`is-${c.side}${i === 0 && current ? ' is-now' : ''}${c.defeated ? ' is-defeated' : ''}`} title={`${nameOf(c)}: ${c.initiative ?? '—'}`}>
          {c.card ? <Hex raw={c.card.avatar_url} name={c.card.name} /> : <Hex plain={artOf(c)} name={nameOf(c)} tone="enemy" />}
          <i>{c.initiative ?? '?'}</i>
        </li>
      ))}
    </ol>
  )
}

/* ---------- панель команды ---------- */

type Cmd = 'attack' | 'spell' | 'other'

const ABILITIES: { key: StatKey; label: string }[] = [
  { key: 'str', label: 'Сила' },
  { key: 'dex', label: 'Ловкость' },
  { key: 'con', label: 'Телосл.' },
  { key: 'int', label: 'Интеллект' },
  { key: 'wis', label: 'Мудрость' },
  { key: 'cha', label: 'Харизма' },
]

interface Preset {
  name: string
  bonus: number | null
  dice: string
  type: string
}

/** Из текста действия существа: «+4 к попаданию… 4 (1к4+2) дробящего урона» */
function presetFromText(name: string, text: string, dict: EngineDictionaries | null): Preset | null {
  const bonus = /([+-]\s*\d+)\s*к\s*попаданию/i.exec(text)
  const dmg = /\((\d+\s*[кd]\s*\d+(?:\s*[+-]\s*\d+)?)\)\s*([а-яё]+)?/i.exec(text)
  if (!bonus && !dmg) return null
  const stem = dmg?.[2]?.slice(0, 5).toLowerCase()
  const type = stem ? (dict?.damage_types.find((t) => t.label.toLowerCase().startsWith(stem))?.value ?? '') : ''
  return { name, bonus: bonus ? Number(bonus[1].replace(/\s/g, '')) : null, dice: dmg ? normDice(dmg[1]) : '', type }
}

function ActionTray({ actor, cmd, targets, reaction, onClear, onClose }: { actor: CombatantView; cmd: Cmd; targets: string[]; reaction: boolean; onClear: () => void; onClose: () => void }) {
  const { data, roomId, isDm } = useRoom()
  const combat = data?.combat
  const [label, setLabel] = useState('')
  const [bonus, setBonus] = useState('')
  const [advantage, setAdvantage] = useState<'adv' | 'dis' | null>(null)
  const [dice, setDice] = useState(cmd === 'attack' ? '1d8' : '')
  const [type, setType] = useState('')
  const [more, setMore] = useState(cmd === 'other')
  const [heal, setHeal] = useState('')
  const [saveOn, setSaveOn] = useState(false)
  const [saveAbility, setSaveAbility] = useState<StatKey>('dex')
  const [saveDc, setSaveDc] = useState('13')
  const [half, setHalf] = useState(true)
  const [slotLevel, setSlotLevel] = useState<number | null>(cmd === 'spell' ? 1 : null)
  const [pool, setPool] = useState<'spell' | 'pact'>('spell')
  const [secret, setSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dict, setDict] = useState<EngineDictionaries | null>(null)
  const [attacks, setAttacks] = useState<AttackEntry[]>([])
  const [hints, setHints] = useState<{ dc?: number; attack?: number }>({})

  useEffect(() => {
    void getEngineDictionaries().then(setDict)
  }, [])
  const heroId = actor.card?.id
  useEffect(() => {
    if (!heroId) return
    let alive = true
    const ref = roomCharacterRef(roomId, heroId)
    Promise.all([getSheet(ref), getCharacter(ref)])
      .then(([s, doc]) => {
        if (!alive) return
        const val = (re: RegExp) => Object.entries(s.values).find(([k, v]) => re.test(k) && typeof v === 'number')?.[1] as number | undefined
        const dc = val(/^char\.class\.[^.]+\.spell_dc$/)
        const attack = val(/^char\.class\.[^.]+\.spell_attack$/)
        setHints({ dc, attack })
        setAttacks(doc.attacks ?? [])
        if (cmd === 'spell' && dc != null) setSaveDc(String(dc))
        if (cmd === 'spell' && attack != null) setBonus(String(attack))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId, heroId, cmd])

  const presets = useMemo<Preset[]>(() => {
    if (cmd !== 'attack') return []
    if (actor.card) {
      return attacks.map((a) => ({
        name: a.name,
        bonus: a.attack_bonus,
        dice: normDice(a.damage ?? ''),
        type: dict?.damage_types.find((t) => t.value === a.damage_type || t.label.toLowerCase() === (a.damage_type ?? '').toLowerCase())?.value ?? '',
      }))
    }
    const c = actor.creature
    if (c && isFullCreature(c)) {
      return (c.snapshot.actions ?? [])
        .map((a) => presetFromText(String(a.name ?? a.title ?? 'Действие'), String(a.description ?? a.text ?? ''), dict))
        .filter((p): p is Preset => !!p)
    }
    return []
  }, [cmd, actor, attacks, dict])

  if (!combat) return null
  const applyPreset = (p: Preset) => {
    setLabel(p.name)
    setBonus(p.bonus != null ? String(p.bonus) : '')
    setDice(p.dice)
    setType(p.type)
  }

  const submit = async () => {
    const req: CombatActionRequest = {
      actor_combatant_id: actor.id,
      kind: cmd,
      label: label.trim() || undefined,
      target_ids: targets,
      as_reaction: reaction || undefined,
      secret: isDm && secret ? true : undefined,
    }
    if (dice.trim()) req.damage = [{ dice: normDice(dice), type: type || null }]
    if (heal.trim()) req.heal_dice = normDice(heal)
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

  const needsTarget = cmd !== 'other'
  return (
    <aside className="bt-tray" aria-label="Действие">
      <header>
        <b>{reaction ? 'Реакция' : cmd === 'attack' ? 'Атака' : cmd === 'spell' ? 'Заклинание' : 'Действие'}</b>
        <i>{nameOf(actor)}</i>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Отменить">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="bt-tray-scroll">
        {presets.length > 0 && (
          <ul className="bt-presets">
            {presets.map((p, i) => (
              <li key={`${p.name}-${i}`}>
                <button type="button" className={label === p.name ? 'is-on' : ''} onClick={() => applyPreset(p)}>
                  <b>{p.name}</b>
                  <i>
                    {p.bonus != null ? `${p.bonus >= 0 ? '+' : ''}${p.bonus}` : ''} {p.dice}
                  </i>
                </button>
              </li>
            ))}
          </ul>
        )}
        <input className="bt-in" value={label} placeholder={cmd === 'spell' ? 'Название заклинания' : cmd === 'attack' ? 'Чем бьёт' : 'Что делает'} aria-label="Название" onChange={(e) => setLabel(e.target.value)} />
        <div className="bt-pair">
          <label>
            <span>Бонус</span>
            <input className="bt-in" type="number" inputMode="numeric" value={bonus} placeholder="без броска" onChange={(e) => setBonus(e.target.value)} />
          </label>
          <label>
            <span>Урон</span>
            <input className="bt-in" value={dice} placeholder="2d6+3" onChange={(e) => setDice(e.target.value)} />
          </label>
        </div>
        <select className="bt-in" value={type} aria-label="Тип урона" onChange={(e) => setType(e.target.value)}>
          <option value="">тип урона не важен</option>
          {(dict?.damage_types ?? []).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="tb-tri" role="radiogroup" aria-label="Преимущество">
          {([[null, 'Обычно'], ['adv', 'Преимущество'], ['dis', 'Помеха']] as const).map(([v, text]) => (
            <button key={text} type="button" role="radio" aria-checked={advantage === v} className={advantage === v ? 'is-on' : ''} onClick={() => setAdvantage(v)}>
              {text}
            </button>
          ))}
        </div>

        <button type="button" className="tb-linkbtn bt-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? 'меньше' : 'ячейка, лечение, спасбросок…'}
        </button>
        {more && (
          <div className="bt-moreform">
            <label>
              <span>Лечение</span>
              <input className="bt-in" value={heal} placeholder="2d4+2" onChange={(e) => setHeal(e.target.value)} />
            </label>
            <div className="bt-pair">
              <label>
                <span>Ячейка</span>
                <select className="bt-in" value={slotLevel ?? ''} onChange={(e) => setSlotLevel(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">не тратить</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      {n} круг
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Откуда</span>
                <select className="bt-in" value={pool} disabled={!slotLevel} onChange={(e) => setPool(e.target.value as 'spell' | 'pact')}>
                  <option value="spell">обычная</option>
                  <option value="pact">договор</option>
                </select>
              </label>
            </div>
            <label className="bt-check">
              <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} />
              <span>Цели делают спасбросок{hints.dc != null ? ` (Сл ${hints.dc})` : ''}</span>
            </label>
            {saveOn && (
              <>
                <div className="bt-pair">
                  <select className="bt-in" value={saveAbility} aria-label="Характеристика" onChange={(e) => setSaveAbility(e.target.value as StatKey)}>
                    {ABILITIES.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <input className="bt-in" type="number" inputMode="numeric" aria-label="Сложность" value={saveDc} onChange={(e) => setSaveDc(e.target.value)} />
                </div>
                <label className="bt-check">
                  <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
                  <span>половина урона при успехе</span>
                </label>
              </>
            )}
            {isDm && (
              <label className="bt-check">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
                <span>Скрытое действие</span>
              </label>
            )}
          </div>
        )}
      </div>
      <footer>
        {error && <p className="tb-err">{error}</p>}
        <span className={`bt-targets${targets.length ? ' is-set' : ''}`}>
          {targets.length ? `Целей: ${targets.length}` : needsTarget ? 'Нажмите на цель на поле' : 'Можно без цели'}
          {targets.length > 0 && (
            <button type="button" className="tb-linkbtn" onClick={onClear}>
              сбросить
            </button>
          )}
        </span>
        <button type="button" className="tb-goldbtn" disabled={busy || (needsTarget && targets.length === 0)} onClick={() => void submit()}>
          <Dices aria-hidden="true" /> Бросить кости
        </button>
      </footer>
    </aside>
  )
}

/* ---------- добавить участников (мастер) ---------- */

function AddUnits({ onClose }: { onClose: () => void }) {
  const { data, roomId } = useRoom()
  const combat = data?.combat
  const [error, setError] = useState<string | null>(null)
  if (!data || !combat) return null
  const inFight = new Set(combat.combatants.map((c) => c.ref_id))
  const heroes = data.characters.filter((c) => !inFight.has(c.id))
  const creatures = data.creatures.filter((c) => !inFight.has(c.id))
  const add = async (body: { character_ids?: string[]; creature_ids?: string[]; hidden?: boolean }) => {
    setError(null)
    try {
      await addCombatants(roomId, combat.id, body)
    } catch (e) {
      setError(errText(e))
    }
  }
  return (
    <div className="bt-addunits" role="dialog" aria-label="Добавить в бой">
      <header>
        <b>В бой вступают</b>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      {heroes.length + creatures.length === 0 && <p className="tb-hint">Все уже здесь.</p>}
      <div className="sc-tokens">
        {heroes.map((c) => (
          <button key={c.id} type="button" className="sc-token" onClick={() => void add({ character_ids: [c.id] })}>
            <Hex raw={c.avatar_url} name={c.name} />
            <b>{c.name}</b>
          </button>
        ))}
        {creatures.map((c) => (
          <button key={c.id} type="button" className="sc-token" onClick={() => void add({ creature_ids: [c.id], hidden: isFullCreature(c) && c.on_screen_only })}>
            <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
            <b>{creatureName(c)}</b>
          </button>
        ))}
      </div>
      {error && <p className="tb-err">{error}</p>}
    </div>
  )
}

/* ---------- сцена ---------- */

export function BattleScene({ onSheet }: { onSheet?: () => void }) {
  const { data, roomId, isDm } = useRoom()
  const combat = data?.combat
  const mine = data?.me.room_character_id ?? null
  const [cmd, setCmd] = useState<Cmd | null>(null)
  const [targets, setTargets] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [floaters, setFloaters] = useState<Record<string, Floater[]>>({})
  const [anims, setAnims] = useState<Record<string, string>>({})
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState<{ c: CombatantView; origin: Origin } | null>(null)
  const [adding, setAdding] = useState(false)
  const [yourTurn, setYourTurn] = useState(false)
  const prevTurn = useRef<string | null | undefined>(undefined)
  const [held, setHeld] = useState<Held>({})
  const actionQueue = useRef<Promise<void>>(Promise.resolve())

  const showFloat = (id: string, list: Floater[], anim: string) => {
    if (list.length > 0) {
      setFloaters((f) => ({ ...f, [id]: [...(f[id] ?? []), ...list] }))
      setTimeout(() => setFloaters((f) => ({ ...f, [id]: (f[id] ?? []).filter((x) => !list.includes(x)) })), 2300)
    }
    if (anim) {
      setAnims((a) => ({ ...a, [id]: anim }))
      setTimeout(() => setAnims((a) => ({ ...a, [id]: a[id] === anim ? '' : a[id] })), 680)
    }
  }

  /**
   * Сервер считает всё разом, а показываем как за столом: сначала d20, вердикт,
   * и только при попадании кости урона. Хиты целей держим до этого момента, иначе
   * дуга выдала бы исход раньше кубика.
   */
  const playAction = async (res: CombatActionResult) => {
    const targets = res.targets ?? []
    const animate = document.visibilityState === 'visible' && !res.secret
    const roll = async (dice: ForcedDie[]) => {
      if (animate && dice.length > 0) await playForcedRoll({ dice: dice.slice(0, 12) }).catch(() => undefined)
    }
    try {
      showFloat(res.actor_combatant_id, [], 'lunge')
      await roll(targets.flatMap((t) => diceOf(t.attack ?? t.save)))
      for (const t of targets) {
        showFloat(t.combatant_id, verdictOf(t, `${res.action_id}-${t.combatant_id}`), t.attack && !t.hit ? 'dodge' : '')
      }
      const hits = targets.filter((t) => landed(t) && t.damage.length > 0)
      if (hits.length > 0 && animate) {
        await wait(targets.some((t) => t.attack || t.save) ? 700 : 0)
        await roll(hits.flatMap((t) => t.damage.flatMap((d) => diceOf(d.roll))))
      }
      for (const t of targets) {
        const hurt = dealtBy(t) > 0 && landed(t)
        setHeld((h) => Object.fromEntries(Object.entries(h).filter(([k]) => k !== t.combatant_id)))
        showFloat(t.combatant_id, impactOf(t, `${res.action_id}-${t.combatant_id}`), t.crit && hurt ? 'crit' : hurt ? 'hit' : t.healed ? 'heal' : '')
      }
    } finally {
      const ids = new Set(targets.map((t) => t.combatant_id))
      setHeld((h) => Object.fromEntries(Object.entries(h).filter(([k]) => !ids.has(k))))
    }
  }

  useRoomEvents((msg) => {
    if (msg.type !== 'combat.action') return
    const res = msg.payload as CombatActionResult
    setLastAction(res.action_id)
    // здесь экран ещё прежний: запоминаем, как цели выглядели до удара
    const before = new Map((data?.combat?.combatants ?? []).map((c) => [c.id, c]))
    const keep: Held = {}
    for (const t of res.targets ?? []) {
      const c = before.get(t.combatant_id)
      if (c) keep[c.id] = { card: c.card, creature: c.creature, defeated: c.defeated }
    }
    setHeld((h) => ({ ...keep, ...h }))
    // действия идут строго по очереди, кости не должны наезжать друг на друга
    actionQueue.current = actionQueue.current.then(() => playAction(res)).catch(() => undefined)
  })

  // «Ваш ход!» — коротко, когда очередь дошла
  const current = combat?.current_combatant_id ?? null
  const myUnitId = combat?.combatants.find((c) => c.kind === 'character' && c.ref_id === mine)?.id
  const active = combat?.status === 'active'
  useEffect(() => {
    if (prevTurn.current !== undefined && current !== prevTurn.current && active && current && current === myUnitId) {
      setYourTurn(true)
      const t = setTimeout(() => setYourTurn(false), 1600)
      prevTurn.current = current
      return () => clearTimeout(t)
    }
    prevTurn.current = current
  }, [current, active, myUnitId])

  if (!data || !combat || combat.status === 'ended') return null

  const units = combat.combatants.map((c) => (held[c.id] ? { ...c, ...held[c.id] } : c))
  const byId = new Map(units.map((c) => [c.id, c]))
  const party = units.filter((c) => c.side === 'party').sort((a, b) => a.slot - b.slot)
  const enemies = units.filter((c) => c.side === 'enemies').sort((a, b) => a.slot - b.slot)
  const currentUnit = current ? byId.get(current) : undefined
  const myUnit = myUnitId ? byId.get(myUnitId) : undefined
  const myTurn = !!myUnit && myUnit.id === current
  const setup = combat.status === 'setup'
  const closed = data.room.status === 'closed'
  const actor = isDm ? (currentUnit ?? combat.combatants.find((c) => !c.defeated)) : myUnit
  const targeting = !!cmd

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
  const closeTray = () => {
    setCmd(null)
    setTargets([])
  }
  const onFigure = (c: CombatantView, origin: Origin) => {
    if (targeting) {
      if (c.defeated) return
      setTargets((t) => (t.includes(c.id) ? t.filter((x) => x !== c.id) : [...t, c.id].slice(0, 30)))
      return
    }
    setCardOpen({ c, origin })
  }
  const figure = (c: CombatantView) => (
    <Figure
      key={c.id}
      c={c}
      current={c.id === current}
      mine={c.id === myUnit?.id}
      targeting={targeting && !c.defeated}
      picked={targets.includes(c.id)}
      floaters={floaters[c.id] ?? []}
      anim={anims[c.id] || null}
      setup={setup}
      isDm={isDm}
      onClick={(o) => onFigure(c, o)}
      onInit={(v) => void run(() => setInitiative(roomId, combat.id, { [c.id]: v }))}
    />
  )

  const center = (
    <>
      <h1>{setup ? 'Бросайте инициативу' : `Раунд ${combat.round}`}</h1>
    </>
  )

  return (
    <div className={`bt-scene${cmd ? ' has-tray' : ''}${isDm ? ' is-dm' : ''}`}>
      <span className="bt-back" aria-hidden="true" />
      <span className="bt-fog" aria-hidden="true" />
      <span className="bt-embers" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${6 + (i % 5)}s`, '--w': `${(i * 0.7) % 5}s` } as CSSProperties} />
        ))}
      </span>

      <TopBar center={center} onSheet={onSheet} />

      <TurnStrip list={units} current={current} />

      <div className="bt-field">
        <div className="bt-row is-enemies" style={{ '--n': enemies.length } as CSSProperties}>
          {enemies.map(figure)}
        </div>
        <div className="bt-row is-party" style={{ '--n': party.length } as CSSProperties}>
          {party.map(figure)}
        </div>
      </div>

      {/* команды хода */}
      <nav className="bt-cmds" aria-label="Команды">
        {setup ? (
          <>
            {myUnit && myUnit.initiative == null && (
              <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, { combatant_ids: [myUnit.id] }))}>
                <Dices aria-hidden="true" /> <span>Инициатива</span>
              </button>
            )}
            {isDm && (
              <>
                <button type="button" className="bt-cmd" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, {}))}>
                  <Dices aria-hidden="true" /> <span>Бросить за всех</span>
                </button>
                <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => beginCombat(roomId, combat.id))}>
                  <Swords aria-hidden="true" /> <span>Начать бой</span>
                </button>
              </>
            )}
          </>
        ) : (
          actor && (
            <>
              <button type="button" className={`bt-cmd${cmd === 'attack' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'attack' ? closeTray() : setCmd('attack'))}>
                <Swords aria-hidden="true" /> <span>{isDm || myTurn ? 'Атака' : 'Реакция'}</span>
              </button>
              <button type="button" className={`bt-cmd${cmd === 'spell' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'spell' ? closeTray() : setCmd('spell'))}>
                <Wand2 aria-hidden="true" /> <span>Магия</span>
              </button>
              <button type="button" className={`bt-cmd${cmd === 'other' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'other' ? closeTray() : setCmd('other'))}>
                <Zap aria-hidden="true" /> <span>Другое</span>
              </button>
              {(isDm || myTurn) && (
                <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => nextTurn(roomId, combat.id).then(closeTray))}>
                  <ChevronRight aria-hidden="true" /> <span>{myTurn ? 'Конец хода' : 'Следующий'}</span>
                </button>
              )}
            </>
          )
        )}
      </nav>

      {/* служебное мастера */}
      {isDm && (
        <div className="bt-dmtools">
          <button type="button" className="tb-round" onClick={() => setAdding((v) => !v)} aria-label="Добавить участников" title="Добавить участников" aria-expanded={adding}>
            <Plus aria-hidden="true" />
          </button>
          {lastAction && !setup && (
            <button type="button" className="tb-round" disabled={busy || closed} onClick={() => void run(() => revertCombatAction(roomId, combat.id, lastAction).then(() => setLastAction(null)))} aria-label="Отменить последнее действие" title="Отменить последнее действие">
              <Undo2 aria-hidden="true" />
            </button>
          )}
          <button type="button" className="tb-round is-danger" disabled={busy || closed} onClick={() => confirm('Закончить бой?') && void run(() => endCombat(roomId, combat.id))} aria-label="Закончить бой" title="Закончить бой">
            <Flag aria-hidden="true" />
          </button>
        </div>
      )}

      {!isDm && !myUnit && <p className="bt-note"><UserRound aria-hidden="true" /> Вашего героя нет в этом бою</p>}

      {error && (
        <p className="tb-claimerr" role="alert">
          {error}
        </p>
      )}

      {cmd && actor && (
        <ActionTray
          key={`${cmd}-${actor.id}`}
          actor={!isDm && myUnit ? myUnit : actor}
          cmd={cmd}
          targets={targets}
          reaction={!isDm && !myTurn}
          onClear={() => setTargets([])}
          onClose={closeTray}
        />
      )}
      {adding && <AddUnits onClose={() => setAdding(false)} />}
      {yourTurn && (
        <div className="bt-yourturn" role="status">
          Ваш ход
        </div>
      )}

      {cardOpen?.c.card && <HeroCard card={cardOpen.c.card} origin={cardOpen.origin} onClose={() => setCardOpen(null)} />}
      {cardOpen?.c.creature && <CreatureCard id={cardOpen.c.creature.id} origin={cardOpen.origin} onClose={() => setCardOpen(null)} />}
    </div>
  )
}

/** Заставка входа в бой: два удара клинком и надпись */
export function BattleIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1650)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="bt-intro" aria-hidden="true">
      <span className="bt-slash is-a" />
      <span className="bt-slash is-b" />
      <b>К бою!</b>
    </div>
  )
}

/** Заставка конца боя */
export function BattleOutro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1300)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="bt-outro" aria-hidden="true">
      <b>Бой окончен</b>
    </div>
  )
}
