/**
 * Бой — отдельная сцена. Герои и существа стоят в полный рост (размер из
 * бестиария: огр выше гоблина), под ногами — перевёрнутый сплюснутый спидометр
 * хитов. Цели выбирают нажатием прямо по фигурам, результат виден на самих
 * фигурах: вылетающие числа, тряска, павшие падают.
 *
 * Кости бросает сервер; экран меняют только события.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BookmarkPlus, Hand, ChevronLeft, ChevronRight, ChevronsUp, Crosshair, Dices, Flag, Hourglass, PawPrint, Plus, Shield, Sparkles, Swords, Undo2, UserRound, Wand2, X, Zap } from 'lucide-react'
import { ApiError, getCharacter, getEngineDictionaries, getSheet, roomCharacterRef, type Character, type EngineDictionaries, type Spell } from '../../api'
import { Constellation } from '../../characters/SpellBook'
import { useCatalogList } from '../../create/useCatalog'
import { SpellSchoolMark, spellSchoolIcon } from '../../spellSchools'
import { parsePortrait } from '../../characters/portrait'
import { playForcedRoll, type ForcedDie } from '../../dice/diceControl'
import { facesOf } from '../../dice/bonusDice'
import type { AttackEntry, GrantedSpell, NaturalAttack, SheetSlot, SpellKnown } from '../../types/character'
import type { CombatActionRequest, CombatActionResult, CombatantView, FixedRolls, ConcentrationCheck, ConcentrationSave, EffectExpiry, RolledDice, SaveEndsResult, StatKey } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { addCombatants, beginCombat, combatAction, concentrationSave, delayTurn, endCombat, nextTurn, patchCombatant, patchRoomCharacter, prevTurn as stepBack, revertCombatAction, rollInitiative, setInitiative, spendLegendary } from '../roomsApi'
import { attackPresets, castable, loadBeastPresets, normDice, presetFromText, saveBeastPresets, spellLookup, spellPreset, type CasterHints, type Preset } from './actionPresets'
import { facesFor, ManualRolls, manualReady, SpellCast, type ChanceMap } from './SpellCast'
import { CreatureCard, HeroCard } from './Cards'
import { cardRatio, creatureArt, creatureHp, creatureName, creatureSize, Hex, HpArc, originFromEvent, seed, Silhouette, useHeroArt, type Origin } from './parts'
import { TopBar } from './TopBar'
import { auraClass, describeEffect, EffectSigils, SURPRISED } from './effects'
import { Img } from '../../media'

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

/** Грани броска для 3D; прибавочные кости эффектов — своим цветом */
const diceOf = (r: RolledDice | null | undefined): ForcedDie[] => (r ? facesOf(r.dice) : [])


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

/** Эффекты на участнике: у героя — подписи карточки, у существа — состояния */
function effectsOf(c: CombatantView): string[] {
  if (c.card) return c.card.effects ?? []
  const cr = c.creature
  if (!cr) return []
  return isFullCreature(cr) ? (cr.conditions ?? []).map((e) => e.label) : (cr.effects ?? [])
}

/** Легендарные счётчики: мастеру — из существа, игроку — если открыты действия */
function legendaryOf(c: CombatantView): { actions: number; actionsLeft: number; resist: number; resistLeft: number } | null {
  const cr = c.creature
  if (!cr) return null
  if (isFullCreature(cr)) {
    const actions = cr.legendary_actions ?? 0
    const resist = cr.legendary_resistances ?? 0
    return actions || resist ? { actions, actionsLeft: cr.legendary_actions_left ?? actions, resist, resistLeft: cr.legendary_resistances_left ?? resist } : null
  }
  const l = cr.legendary
  return l && (l.actions || l.resistances) ? { actions: l.actions, actionsLeft: l.actions_left, resist: l.resistances, resistLeft: l.resistances_left } : null
}

function Pips({ n, left, kind, onSpend }: { n: number; left: number; kind: 'action' | 'resistance'; onSpend?: (amount: number) => void }) {
  if (n <= 0) return null
  return (
    <span className={`bt-pips is-${kind}`} title={`${kind === 'action' ? 'Легендарные действия' : 'Легендарные сопротивления'}: ${left} из ${n}`}>
      <i>{kind === 'action' ? 'ЛД' : 'ЛС'}</i>
      {Array.from({ length: n }, (_, i) => {
        const on = i < left
        return onSpend ? (
          <button key={i} type="button" className={on ? 'is-on' : ''} onClick={() => onSpend(on ? 1 : -1)} aria-label={on ? 'Потратить' : 'Вернуть'} />
        ) : (
          <b key={i} className={on ? 'is-on' : ''} />
        )
      })}
    </span>
  )
}

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
  onSurprise,
  onLegendary,
  chance,
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
  /** мастер: отметить «застигнут врасплох» */
  onSurprise?: () => void
  /** мастер: потратить (1) или вернуть (−1) легендарное */
  onLegendary?: (kind: 'action' | 'resistance', amount: number) => void
  /** предпросмотр заклинания: шанс попасть или провалить спасбросок */
  chance?: { chance: number; kind: 'attack' | 'save' | 'auto' }
}) {
  const { roomId, data } = useRoom()
  // внезапность действует только в первом раунде
  const surprised = !!c.surprised && (data?.combat?.round ?? 0) <= 1
  // герой без своей картинки — с картинкой расы, как в листе
  const heroArt = useHeroArt(roomId, c.card?.id, c.card?.avatar_url, isDm || mine)
  const art = c.card ? parsePortrait(heroArt).src : artOf(c)
  const [broken, setBroken] = useState(false)
  const [initVal, setInitVal] = useState<string | null>(null)
  const hp = c.card ? { ratio: cardRatio(c.card), current: c.card.hp.current, max: c.card.hp.max, temp: c.card.hp.temp } : c.creature ? creatureHp(c.creature) : { ratio: null }
  const k = sizeK(c)
  const effects = effectsOf(c)
  const shown = [...(surprised ? [SURPRISED] : []), ...effects.map((l) => describeEffect(l))]
  const legend = legendaryOf(c)
  const cls = [
    'bt-fig',
    `is-${c.side}`,
    current && 'is-current',
    mine && 'is-mine',
    c.defeated && 'is-defeated',
    c.hidden && 'is-hidden',
    targeting && 'is-targetable',
    picked && 'is-picked',
    surprised && 'is-surprised',
    auraClass(shown),
    anim && `do-${anim}`,
  ]
    .filter(Boolean)
    .join(' ')
  const sway = (seed(c.id, 8) * 2).toFixed(2)
  return (
    <div className={cls} style={{ '--k': k, '--sway': `${sway}s` } as CSSProperties}>
      <button type="button" className="bt-fig-hit" onClick={(e) => onClick(originFromEvent(e))} aria-pressed={targeting ? picked : undefined} aria-label={`${nameOf(c)}${targeting ? (picked ? ': цель выбрана' : ': выбрать целью') : ': открыть карточку'}`}>
        <span className="bt-fig-ground" aria-hidden="true" />
        <EffectSigils effects={shown} size="lg" />
        <span className="bt-fig-body">
          {art && !broken ? <Img src={art} alt="" draggable={false} onError={() => setBroken(true)} /> : <Silhouette enemy={c.side === 'enemies'} />}
        </span>
        {targeting && picked && chance && chance.kind !== 'auto' && (
          <span className={`bt-chance${chance.chance >= 0.65 ? ' is-good' : chance.chance <= 0.35 ? ' is-bad' : ''}`} style={{ '--p': chance.chance } as CSSProperties} title={chance.kind === 'save' ? 'шанс провала спасброска' : 'шанс попасть'}>
            <b>{Math.round(chance.chance * 100)}%</b>
            <i>{chance.kind === 'save' ? 'провал' : 'попадание'}</i>
          </span>
        )}
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
      {legend && (
        <span className="bt-legend">
          <Pips n={legend.actions} left={legend.actionsLeft} kind="action" onSpend={onLegendary ? (a) => onLegendary('action', a) : undefined} />
          <Pips n={legend.resist} left={legend.resistLeft} kind="resistance" onSpend={onLegendary ? (a) => onLegendary('resistance', a) : undefined} />
        </span>
      )}
      {setup && isDm && onSurprise && (
        <button type="button" className={`bt-fig-surprise${c.surprised ? ' is-on' : ''}`} onClick={onSurprise} title={c.surprised ? 'Застигнут врасплох — снять' : 'Застигнуть врасплох'} aria-pressed={!!c.surprised}>
          !
        </button>
      )}
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

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
/** Метка своего приёма в листе: по ней его можно убрать прямо из боя */
const CUSTOM_TAG = 'свой приём'

type SlotPick = { level: number; pool: 'spell' | 'pact' }

/** Лист героя для боя: оружие, заклинания, ячейки и магические числа */
interface HeroKit {
  doc: Character | null
  slots: SheetSlot[]
  /** природные атаки и дарованные заклинания: их выдаёт вычисленный лист, как и в листе героя */
  natural: AttackEntry[]
  granted: SpellKnown[]
  hints: CasterHints & { dc?: number }
  setDoc: (c: Character) => void
}

function useHeroKit(roomId: string, heroId: string | null | undefined, level: number): HeroKit {
  const [doc, setDoc] = useState<Character | null>(null)
  const [slots, setSlots] = useState<SheetSlot[]>([])
  const [natural, setNatural] = useState<AttackEntry[]>([])
  const [granted, setGranted] = useState<SpellKnown[]>([])
  const [hints, setHints] = useState<CasterHints & { dc?: number }>({ level })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setDoc(null)
    setSlots([])
  }, [heroId])
  useEffect(() => {
    if (!heroId) return
    let alive = true
    const ref = roomCharacterRef(roomId, heroId)
    Promise.all([getSheet(ref), getCharacter(ref)])
      .then(([s, d]) => {
        if (!alive) return
        const val = (re: RegExp) => Object.entries(s.values).find(([k, v]) => re.test(k) && typeof v === 'number')?.[1] as number | undefined
        const attack = val(/^char\.class\.[^.]+\.spell_attack$/)
        const pb = val(/^char\.pb$/) ?? 2
        setHints({ dc: val(/^char\.class\.[^.]+\.spell_dc$/), attack, mod: attack != null ? attack - pb : undefined, level })
        setSlots(s.slots ?? [])
        const mod = (ab?: string) => Number(s.values[`char.abilities.${ab ?? 'str'}.mod`] ?? 0) || 0
        const nat = ((s.values['char.attacks.natural'] as NaturalAttack[] | undefined) ?? []).filter((a) => a?.name)
        setNatural(
          nat.map((a) => {
            const m = mod(a.ability)
            return { name: a.name, type: 'melee', attack_bonus: m + pb, damage: a.dice ? `${a.dice}${m ? (m > 0 ? `+${m}` : `${m}`) : ''}` : String(Math.max(1, 1 + m)), damage_type: a.type ?? '', range: '', properties: [] }
          }),
        )
        const own = new Set((d.spells ?? []).map((sp) => sp.name.toLocaleLowerCase('ru')))
        const gr = ((s.values['char.spells.granted'] as GrantedSpell[] | undefined) ?? []).filter((g) => g?.name && !own.has(g.name.toLocaleLowerCase('ru')))
        setGranted(gr.map((g) => ({ name: g.name, level: typeof g.level === 'number' ? g.level : -1, prepared: true, spell_source: null, snapshot: { granted: 'engine', uses: g.uses ?? null } })))
        setDoc(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId, heroId, level, tick])
  // ячейки тратит сервер: после действия и правки листа перечитываем
  useRoomEvents((msg) => {
    if (!heroId) return
    const p = msg.payload as { character_id?: string; card?: { id?: string } }
    if (msg.type === 'combat.action' || ((msg.type === 'character.sheet_changed' || msg.type === 'character.updated') && (p.character_id ?? p.card?.id) === heroId)) {
      setTick((t) => t + 1)
    }
  })
  return { doc, slots, natural, granted, hints, setDoc }
}

/** Ячейки героя — созвездия в правом нижнем углу; при заклинании по ним выбирают круг */
function SlotSky({ slots, pick, onPick }: { slots: SheetSlot[]; pick: SlotPick | null; onPick?: (p: SlotPick | null) => void }) {
  const list = slots.filter((s) => s.max > 0).sort((a, b) => Number(a.pool === 'pact') - Number(b.pool === 'pact') || a.level - b.level)
  if (list.length === 0) return null
  return (
    <div className={`bt-sky${onPick ? ' is-picking' : ''}`} aria-label="Ячейки заклинаний">
      {onPick && <p className="bt-sky-hint">Выберите круг ячейки</p>}
      <div className="bt-sky-grid">
        {list.map((s) => {
          const on = pick?.level === s.level && pick.pool === s.pool
          const empty = s.current <= 0
          return (
            <button
              key={`${s.pool}-${s.level}`}
              type="button"
              className={`bt-sky-cell${on ? ' is-on' : ''}${empty ? ' is-empty' : ''}`}
              disabled={!onPick || empty}
              aria-pressed={on}
              onClick={() => onPick?.(on ? null : { level: s.level, pool: s.pool })}
              title={`${s.pool === 'pact' ? 'Договор' : `${s.level} круг`}: ${s.current} из ${s.max}`}
            >
              <Constellation circle={s.level} max={s.max} used={s.max - s.current} locked />
              {s.pool === 'pact' && <i>договор</i>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Подходящая ячейка для круга заклинания: наименьшая свободная не ниже него */
function slotFor(level: number, slots: SheetSlot[]): SlotPick | null {
  const free = slots.filter((s) => s.current > 0 && s.level >= level).sort((a, b) => a.level - b.level || Number(a.pool === 'spell') - Number(b.pool === 'spell'))
  return free[0] ? { level: free[0].level, pool: free[0].pool } : null
}

function PresetArt({ p }: { p: Preset }) {
  const [broken, setBroken] = useState(false)
  if (p.image && !broken) return <Img src={p.image} alt="" draggable={false} onError={() => setBroken(true)} />
  if (p.look === 'spell') return spellSchoolIcon(p.school) ? <SpellSchoolMark school={p.school} /> : <Sparkles aria-hidden="true" />
  const Icon = p.look === 'ranged' ? Crosshair : p.look === 'beast' ? PawPrint : Swords
  return <Icon aria-hidden="true" />
}

function ActionTray({
  actor,
  cmd,
  targets,
  reaction,
  kit,
  slot,
  onSlot,
  onTargets,
  onChances,
  onClose,
}: {
  actor: CombatantView
  cmd: Cmd
  targets: string[]
  reaction: boolean
  kit: HeroKit
  slot: SlotPick | null
  onSlot: (p: SlotPick | null) => void
  onTargets: (ids: string[]) => void
  onChances: (c: ChanceMap) => void
  onClose: () => void
}) {
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
  const [secret, setSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dict, setDict] = useState<EngineDictionaries | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  // эффект на целях: длительность, концентрация, «до успешного спасброска»
  const [effOn, setEffOn] = useState(false)
  const [effLabel, setEffLabel] = useState('')
  const [effExpiry, setEffExpiry] = useState<EffectExpiry>('rounds')
  const [effRounds, setEffRounds] = useState('10')
  const [effConc, setEffConc] = useState(false)
  const [effAbility, setEffAbility] = useState<StatKey>('wis')
  const [effDc, setEffDc] = useState('')
  const [beastOwn, setBeastOwn] = useState<Preset[]>(() => (actor.creature ? loadBeastPresets(actor.creature.id) : []))
  // заклинание с механикой творит сервер — для него своя карточка
  const [castPick, setCastPick] = useState<Preset | null>(null)
  // живые кубики: игрок вписывает выпавшее, модификаторы прибавит сервер
  const [manual, setManual] = useState(false)
  const [fixed, setFixed] = useState<FixedRolls>({})
  const [saving, setSaving] = useState(false)
  const hero = !!actor.card
  const { doc, slots, hints } = kit
  const { items: catalog } = useCatalogList<Spell>('spells', cmd === 'spell' && hero)

  useEffect(() => {
    void getEngineDictionaries().then(setDict)
  }, [])
  // заклинание по умолчанию бьёт с бонусом и Сл героя
  useEffect(() => {
    if (cmd !== 'spell') return
    if (hints.dc != null) setSaveDc(String(hints.dc))
  }, [cmd, hints.dc])

  const presets = useMemo<Preset[]>(() => {
    if (cmd === 'attack') {
      if (hero) {
        const atk = [...(doc?.attacks ?? []), ...kit.natural.filter((n) => !(doc?.attacks ?? []).some((a) => a.name === n.name))]
        return attackPresets(atk, doc?.inventory, dict, new Set(atk.filter((a) => a.properties?.includes(CUSTOM_TAG)).map((a) => a.name)))
      }
      const c = actor.creature
      // у призванного игроку статблок открыт: действия есть и в его виде
      const acts = c ? (isFullCreature(c) ? c.snapshot.actions : c.actions) : null
      const own = (acts ?? []).map((a) => presetFromText(String(a.name ?? a.title ?? 'Действие'), String(a.description ?? a.text ?? ''), dict)).filter((p): p is Preset => !!p)
      return [...own, ...beastOwn]
    }
    if (cmd === 'spell' && hero && doc) {
      const find = spellLookup(catalog)
      return castable([...(doc.spells ?? []), ...kit.granted]).map((sp) => {
        const known = sp.level >= 0 ? sp : { ...sp, level: find(sp)?.spell_level ?? 0 }
        return spellPreset(known, find(known), hints, dict)
      })
    }
    return []
  }, [cmd, hero, doc, kit.natural, kit.granted, actor.creature, beastOwn, dict, catalog, hints])

  if (!combat) return null
  const me = actor
  const alive = combat.combatants.filter((c) => !c.defeated)
  const allies = alive.filter((c) => c.side === me.side && c.id !== me.id).map((c) => c.id)
  const foes = alive.filter((c) => c.side !== me.side).map((c) => c.id)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

  const applyPreset = (p: Preset) => {
    setPicked(p.key)
    if (p.look === 'spell' && p.mech && hero) {
      setCastPick(p)
      onSlot(p.level ? slotFor(p.level, slots) : null)
      const m = p.mech
      // на себя — сразу себя; лечение — без врагов в целях
      if (m.range.kind === 'self' || m.targets?.kind === 'self') onTargets([me.id])
      else if (m.heal && !m.damage.length) onTargets(targets.filter((t) => t === me.id || allies.includes(t)))
      return
    }
    setCastPick(null)
    setLabel(p.name)
    setBonus(p.bonus != null ? String(p.bonus) : '')
    setDice(p.dice)
    setType(p.type)
    if (p.look !== 'spell') return
    setHeal(p.heal ?? '')
    setSaveOn(!!p.save)
    if (p.save) {
      setSaveAbility(p.save.ability)
      setHalf(p.save.half)
      if (hints.dc != null) setSaveDc(String(hints.dc))
    }
    onSlot(p.level ? slotFor(p.level, slots) : null)
    // концентрация или «до спасброска»: эффект с именем заклинания
    const effect = !!p.conc || !!p.saveEnds
    setEffOn(effect)
    if (effect) {
      setEffLabel(p.name)
      setEffConc(!!p.conc)
      setEffExpiry(p.saveEnds ? 'save_ends' : p.conc ? 'never' : 'rounds')
      if (p.saveEnds) setEffAbility(p.saveEnds)
      setEffDc(hints.dc != null ? String(hints.dc) : '')
      setMore(true)
    }
    if (p.self) onTargets([me.id])
    else if (p.heal && !p.dice) onTargets(targets.filter((t) => t === me.id || allies.includes(t)))
  }

  /** Записать то, что в форме, как свой приём: у героя — в лист, у существа — в браузер */
  const saveOwn = async () => {
    const name = label.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    const typeLabel = dict?.damage_types.find((t) => t.value === type)?.label ?? type
    try {
      if (hero && actor.card && doc) {
        const entry: AttackEntry = { name, type: 'melee', attack_bonus: Number(bonus) || 0, damage: normDice(dice), damage_type: typeLabel, range: '', properties: [CUSTOM_TAG] }
        const next = [...(doc.attacks ?? []).filter((a) => a.name !== name), entry]
        await patchRoomCharacter(roomId, actor.card.id, { attacks: next })
        kit.setDoc({ ...doc, attacks: next })
      } else if (actor.creature) {
        const entry: Preset = { key: `own-${name}`, name, bonus: bonus.trim() === '' ? null : Number(bonus), dice: normDice(dice), type, look: 'beast', custom: true }
        const next = [...beastOwn.filter((p) => p.name !== name), entry]
        setBeastOwn(next)
        saveBeastPresets(actor.creature.id, next)
      }
      setPicked(hero ? `atk-${(doc?.attacks ?? []).filter((a) => a.name !== name).length}-${name}` : `own-${name}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const dropOwn = async (p: Preset) => {
    setError(null)
    try {
      if (hero && actor.card && doc) {
        const next = (doc.attacks ?? []).filter((a) => !(a.name === p.name && a.properties?.includes(CUSTOM_TAG)))
        await patchRoomCharacter(roomId, actor.card.id, { attacks: next })
        kit.setDoc({ ...doc, attacks: next })
      } else if (actor.creature) {
        const next = beastOwn.filter((x) => x.name !== p.name)
        setBeastOwn(next)
        saveBeastPresets(actor.creature.id, next)
      }
    } catch (e) {
      setError(errText(e))
    }
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
    if (slot) req.slot = slot
    if (manual) req.fixed = { attack: fixed.attack, damage: (fixed.damage ?? []).slice(0, manualFaces.length) }
    if (effOn && effLabel.trim()) {
      req.effect = {
        label: effLabel.trim(),
        modifiers: [],
        expires: effExpiry,
        rounds_left: effExpiry === 'rounds' ? Math.max(1, Number(effRounds) || 1) : null,
        concentration: effConc,
        ...(effExpiry === 'save_ends' ? { save_ability: effAbility, save_dc: Number(effDc) || hints.dc || 10 } : {}),
      }
    }
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
  const hasSky = hero && slots.some((s) => s.max > 0)
  const unitName = (id: string) => {
    const c = combat.combatants.find((u) => u.id === id)
    return c ? nameOf(c) : 'цель'
  }
  const manualAttack = bonus.trim() !== '' ? targets.map((id) => ({ id, name: unitName(id) })) : []
  const manualFaces = facesFor([dice, heal])
  const canSave = cmd === 'attack' && !!label.trim() && (!!dice.trim() || bonus.trim() !== '') && !presets.some((p) => p.name === label.trim() && !p.custom && p.dice === normDice(dice) && String(p.bonus ?? '') === bonus)
  const slotText = slot ? `${slot.pool === 'pact' ? 'договор, ' : ''}${slot.level} круг` : 'без ячейки'
  const aimBlock = <AimBlock cmd={cmd} hasSky={hasSky} slot={slot} slotText={slotText} onSlot={onSlot} me={me} targets={targets} allies={allies} foes={foes} same={same} onTargets={onTargets} needsTarget={needsTarget} />
  const presetList = presets.length > 0 && (
    <ul className={`bt-presets${cmd === 'spell' ? ' is-spells' : ''}${castPick ? ' is-compact' : ''}`}>
      {presets.map((p) => (
        <li key={p.key}>
          <button type="button" className={picked === p.key ? 'is-on' : ''} onClick={() => applyPreset(p)}>
            <span className="bt-preset-art">
              <PresetArt p={p} />
            </span>
            <b>{p.name}</b>
            <i>
              {p.look === 'spell' && <em className="bt-circle">{p.level ? ROMAN[p.level] : 'заг.'}</em>}
              {p.mech ? '' : `${p.bonus != null ? `${p.bonus >= 0 ? '+' : ''}${p.bonus} ` : ''}${p.dice || (p.heal ? `♥ ${p.heal}` : '')}`}
            </i>
          </button>
        </li>
      ))}
    </ul>
  )
  const head = (
    <header>
      <b>{reaction ? 'Реакция' : cmd === 'attack' ? 'Атака' : cmd === 'spell' ? 'Заклинание' : 'Действие'}</b>
      <i>{castPick ? `${nameOf(actor)} · ${castPick.name}` : nameOf(actor)}</i>
      <button type="button" className="tb-card-x" onClick={onClose} aria-label="Отменить">
        <X aria-hidden="true" />
      </button>
    </header>
  )
  if (castPick?.mech) {
    return (
      <aside className="bt-tray" aria-label="Заклинание">
        {head}
        <SpellCast
          key={castPick.key}
          actor={actor}
          spellName={castPick.spellName ?? castPick.name}
          mech={castPick.mech}
          slot={slot}
          targets={targets}
          units={combat.combatants}
          reaction={reaction}
          onChances={onChances}
          onClose={onClose}
          aim={aimBlock}
          top={presetList}
        />
      </aside>
    )
  }
  return (
    <aside className="bt-tray" aria-label="Действие">
      {head}
      <div className="bt-tray-scroll">
        {presets.length > 0 && (
          <ul className={`bt-presets${cmd === 'spell' ? ' is-spells' : ''}`}>
            {presets.map((p) => (
              <li key={p.key}>
                <button type="button" className={picked === p.key ? 'is-on' : ''} onClick={() => applyPreset(p)}>
                  <span className="bt-preset-art">
                    <PresetArt p={p} />
                  </span>
                  <b>{p.name}</b>
                  <i>
                    {p.look === 'spell' && <em className="bt-circle">{p.level ? ROMAN[p.level] : 'заг.'}</em>}
                    {p.bonus != null ? `${p.bonus >= 0 ? '+' : ''}${p.bonus} ` : ''}
                    {p.dice || (p.heal ? `♥ ${p.heal}` : '')}
                  </i>
                </button>
                {p.custom && (
                  <button type="button" className="bt-preset-x" onClick={() => void dropOwn(p)} aria-label={`Убрать приём: ${p.name}`} title="Убрать приём">
                    <X aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {cmd === 'spell' && hero && doc && presets.length === 0 && <p className="bt-empty">В листе нет заклинаний — опишите его ниже</p>}
        <div className="bt-name">
          <input className="bt-in" value={label} placeholder={cmd === 'spell' ? 'Название заклинания' : cmd === 'attack' ? 'Чем бьёт' : 'Что делает'} aria-label="Название" onChange={(e) => setLabel(e.target.value)} />
          {cmd === 'attack' && (
            <button type="button" className="bt-save" disabled={!canSave || saving} onClick={() => void saveOwn()} title={hero ? 'Сохранить приём в лист героя' : 'Запомнить приём существа'}>
              <BookmarkPlus aria-hidden="true" />
              <span>в приёмы</span>
            </button>
          )}
        </div>
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
        <div className="sp-mode" role="radiogroup" aria-label="Кто бросает">
          <button type="button" role="radio" aria-checked={!manual} className={!manual ? 'is-on' : ''} onClick={() => setManual(false)}>
            <Dices aria-hidden="true" /> бросает сервер
          </button>
          <button type="button" role="radio" aria-checked={manual} className={manual ? 'is-on' : ''} onClick={() => setManual(true)}>
            <Hand aria-hidden="true" /> ввожу сам
          </button>
        </div>
        {manual && <ManualRolls attackFor={manualAttack} saveFor={[]} faces={manualFaces} value={fixed} onChange={setFixed} />}

        {cmd === 'spell' && (heal || saveOn) && !more && (
          <p className="bt-spellnote">
            {heal && <span>лечение {heal}</span>}
            {saveOn && (
              <span>
                спасбросок: {ABILITIES.find((a) => a.key === saveAbility)?.label}, Сл {saveDc}
                {half ? ', половина при успехе' : ''}
              </span>
            )}
          </p>
        )}

        <button type="button" className="tb-linkbtn bt-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? 'меньше' : hasSky ? 'лечение, спасбросок…' : 'ячейка, лечение, спасбросок…'}
        </button>
        {more && (
          <div className="bt-moreform">
            <label>
              <span>Лечение</span>
              <input className="bt-in" value={heal} placeholder="2d4+2" onChange={(e) => setHeal(e.target.value)} />
            </label>
            {!hasSky && (
              <div className="bt-pair">
                <label>
                  <span>Ячейка</span>
                  <select className="bt-in" value={slot?.level ?? ''} onChange={(e) => onSlot(e.target.value ? { level: Number(e.target.value), pool: slot?.pool ?? 'spell' } : null)}>
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
                  <select className="bt-in" value={slot?.pool ?? 'spell'} disabled={!slot} onChange={(e) => slot && onSlot({ ...slot, pool: e.target.value as 'spell' | 'pact' })}>
                    <option value="spell">обычная</option>
                    <option value="pact">договор</option>
                  </select>
                </label>
              </div>
            )}
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
            <label className="bt-check">
              <input type="checkbox" checked={effOn} onChange={(e) => (setEffOn(e.target.checked), !effLabel && setEffLabel(label))} />
              <span>Наложить эффект на цели</span>
            </label>
            {effOn && (
              <div className="bt-effect">
                <input className="bt-in" value={effLabel} maxLength={120} placeholder="Отравлен, Опутан, Благословение…" aria-label="Название эффекта" onChange={(e) => setEffLabel(e.target.value)} />
                <div className="bt-pair">
                  <select className="bt-in" value={effExpiry} aria-label="Сколько длится" onChange={(e) => setEffExpiry(e.target.value as EffectExpiry)}>
                    <option value="rounds">раундов</option>
                    <option value="save_ends">до успешного спасброска</option>
                    <option value="turn_end">до конца хода</option>
                    <option value="turn_start">до начала хода</option>
                    <option value="never">пока не снимут</option>
                    <option value="short_rest">до короткого отдыха</option>
                    <option value="long_rest">до долгого отдыха</option>
                  </select>
                  {effExpiry === 'rounds' && <input className="bt-in" type="number" min={1} max={1000} inputMode="numeric" aria-label="Раундов" value={effRounds} onChange={(e) => setEffRounds(e.target.value)} />}
                  {effExpiry === 'save_ends' && (
                    <span className="bt-pair is-tight">
                      <select className="bt-in" value={effAbility} aria-label="Спасбросок" onChange={(e) => setEffAbility(e.target.value as StatKey)}>
                        {ABILITIES.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                      <input className="bt-in" type="number" inputMode="numeric" aria-label="Сложность" placeholder={hints.dc != null ? String(hints.dc) : 'Сл'} value={effDc} onChange={(e) => setEffDc(e.target.value)} />
                    </span>
                  )}
                </div>
                <label className="bt-check">
                  <input type="checkbox" checked={effConc} onChange={(e) => setEffConc(e.target.checked)} />
                  <span>Требует концентрации</span>
                </label>
              </div>
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
        {aimBlock}
        <button type="button" className="tb-goldbtn" disabled={busy || (needsTarget && targets.length === 0) || (manual && !manualReady(fixed, manualAttack, manualFaces))} onClick={() => void submit()}>
          {cmd === 'spell' ? <Wand2 aria-hidden="true" /> : <Dices aria-hidden="true" />} {cmd === 'spell' ? 'Сотворить' : 'Бросить кости'}
        </button>
      </footer>
    </aside>
  )
}

function AimBlock({ cmd, hasSky, slot, slotText, onSlot, me, targets, allies, foes, same, onTargets, needsTarget }: {
  cmd: Cmd
  hasSky: boolean
  slot: SlotPick | null
  slotText: string
  onSlot: (p: SlotPick | null) => void
  me: CombatantView
  targets: string[]
  allies: string[]
  foes: string[]
  same: (a: string[], b: string[]) => boolean
  onTargets: (ids: string[]) => void
  needsTarget: boolean
}) {
  return (
    <>
        {cmd === 'spell' && hasSky && (
          <span className={`bt-slotline${slot ? ' is-set' : ''}`}>
            <Sparkles aria-hidden="true" /> Ячейка: {slotText}
            {slot && (
              <button type="button" className="tb-linkbtn" onClick={() => onSlot(null)}>
                без ячейки
              </button>
            )}
          </span>
        )}
        <div className="bt-aim" role="group" aria-label="Быстрый выбор цели">
          <button type="button" className={same(targets, [me.id]) ? 'is-on' : ''} onClick={() => onTargets(same(targets, [me.id]) ? [] : [me.id])}>
            <UserRound aria-hidden="true" /> Себя
          </button>
          <button type="button" className={allies.length > 0 && same(targets, allies) ? 'is-on' : ''} disabled={allies.length === 0} onClick={() => onTargets(same(targets, allies) ? [] : allies)}>
            <Shield aria-hidden="true" /> Союзники
          </button>
          <button type="button" className={foes.length > 0 && same(targets, foes) ? 'is-on' : ''} disabled={foes.length === 0} onClick={() => onTargets(same(targets, foes) ? [] : foes)}>
            <Swords aria-hidden="true" /> Враги
          </button>
        </div>
        <span className={`bt-targets${targets.length ? ' is-set' : ''}`}>
          {targets.length ? `Целей: ${targets.length}` : needsTarget ? 'Или нажмите на цель на поле' : 'Можно без цели'}
          {targets.length > 0 && (
            <button type="button" className="tb-linkbtn" onClick={() => onTargets([])}>
              сбросить
            </button>
          )}
        </span>
    </>
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
  const [slot, setSlot] = useState<SlotPick | null>(null)
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

  const [concChecks, setConcChecks] = useState<ConcentrationCheck[]>([])
  const [chances, setChances] = useState<ChanceMap>({})
  const [groupInit, setGroupInit] = useState(true)

  // концентрация и «до успешного спасброска»: просьба бросить и итог над фигурой
  useRoomEvents((msg) => {
    const fresh = !msg.ts || Date.now() - Date.parse(msg.ts) < 20000
    if (msg.type === 'combat.concentration_check') {
      const p = msg.payload as ConcentrationCheck
      if (fresh) setConcChecks((list) => [...list.filter((x) => x.combatant_id !== p.combatant_id), p])
      return
    }
    if (msg.type === 'combat.concentration_save') {
      const p = msg.payload as ConcentrationSave
      setConcChecks((list) => list.filter((x) => x.combatant_id !== p.combatant_id))
      if (!fresh) return
      const show = () =>
        showFloat(p.combatant_id, [{ id: `conc-${msg.seq}`, text: p.success ? 'Концентрация удержана' : 'Концентрация потеряна', tone: p.success ? 'save' : 'miss', delay: 0 }], p.success ? '' : 'hit')
      const dice = diceOf(p.roll)
      actionQueue.current = actionQueue.current
        .then(() => (document.visibilityState === 'visible' && dice.length ? playForcedRoll({ dice }).then(show, show) : show()))
        .catch(() => undefined)
      return
    }
    if (msg.type === 'combat.save_ends') {
      const p = msg.payload as SaveEndsResult
      if (fresh) showFloat(p.combatant_id, [{ id: `se-${msg.seq}`, text: p.success ? `Стряхивает: ${p.effect}` : `Всё ещё: ${p.effect}`, tone: p.success ? 'save' : 'fx', delay: 0 }], '')
      return
    }
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
  // призванные игроком существа: ими он действует в их ход
  const meUser = data?.me.user_id
  const ruled = (c: CombatantView) => !!meUser && (c.controller_id === meUser || (!!c.creature && 'controller_id' in c.creature && c.creature.controller_id === meUser))
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

  // чей лист нужен панели: у игрока — свой герой, у мастера — тот, чей ход
  const kitUnit = combat ? (isDm ? (combat.combatants.find((c) => c.id === current) ?? combat.combatants.find((c) => !c.defeated)) : combat.combatants.find((c) => c.id === myUnitId)) : undefined
  const kit = useHeroKit(roomId, kitUnit?.card?.id, kitUnit?.card?.level ?? 1)

  if (!data || !combat || combat.status === 'ended') return null

  const units = combat.combatants.map((c) => (held[c.id] ? { ...c, ...held[c.id] } : c))
  const byId = new Map(units.map((c) => [c.id, c]))
  const party = units.filter((c) => c.side === 'party').sort((a, b) => a.slot - b.slot)
  const enemies = units.filter((c) => c.side === 'enemies').sort((a, b) => a.slot - b.slot)
  const currentUnit = current ? byId.get(current) : undefined
  const myUnit = myUnitId ? byId.get(myUnitId) : undefined
  const ruledNow = currentUnit && ruled(currentUnit) ? currentUnit : undefined
  const myTurn = (!!myUnit && myUnit.id === current) || !!ruledNow
  const setup = combat.status === 'setup'
  const closed = data.room.status === 'closed'
  const actor = isDm ? (currentUnit ?? combat.combatants.find((c) => !c.defeated)) : myUnit
  const targeting = !!cmd
  const trayActor = !isDm ? (ruledNow ?? myUnit) : actor

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
    setChances({})
    setCmd(null)
    setTargets([])
    setSlot(null)
  }
  const openCmd = (next: Cmd) => {
    setSlot(null)
    setCmd(next)
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
      onSurprise={isDm ? () => void run(() => patchCombatant(roomId, combat.id, c.id, { surprised: !c.surprised })) : undefined}
      onLegendary={isDm && c.creature ? (kind, amount) => void run(() => spendLegendary(roomId, c.creature!.id, kind, amount)) : undefined}
      chance={chances[c.id]}
    />
  )
  const myChecks = concChecks.filter((x) => isDm || x.character_id === mine)

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
                <button type="button" className={`bt-group${groupInit ? ' is-on' : ''}`} onClick={() => setGroupInit((v) => !v)} aria-pressed={groupInit} title="Одинаковые существа бросают инициативу один раз">
                  группами
                </button>
                <button type="button" className="bt-cmd" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, groupInit ? { group: true } : {}))}>
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
              <button type="button" className={`bt-cmd${cmd === 'attack' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'attack' ? closeTray() : openCmd('attack'))}>
                <Swords aria-hidden="true" /> <span>{isDm || myTurn ? 'Атака' : 'Реакция'}</span>
              </button>
              <button type="button" className={`bt-cmd${cmd === 'spell' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'spell' ? closeTray() : openCmd('spell'))}>
                <Wand2 aria-hidden="true" /> <span>Магия</span>
              </button>
              <button type="button" className={`bt-cmd${cmd === 'other' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'other' ? closeTray() : openCmd('other'))}>
                <Zap aria-hidden="true" /> <span>Другое</span>
              </button>
              {(isDm || myTurn) && (
                <span className="bt-endturn">
                  <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => nextTurn(roomId, combat.id).then(closeTray))}>
                    <ChevronRight aria-hidden="true" /> <span>{myTurn ? 'Конец хода' : 'Следующий'}</span>
                  </button>
                  <button type="button" className="tb-round bt-delay" disabled={busy || closed || !current} onClick={() => void run(() => delayTurn(roomId, combat.id).then(closeTray))} title="Отложить ход: в конец очереди" aria-label="Отложить ход">
                    <Hourglass aria-hidden="true" />
                  </button>
                </span>
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
          {!setup && (
            <button type="button" className="tb-round" disabled={busy || closed} onClick={() => void run(() => stepBack(roomId, combat.id).then(closeTray))} aria-label="Вернуть ход назад" title="Вернуть ход назад">
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
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

      {myChecks.length > 0 && (
        <div className="bt-concs" role="alert">
          {myChecks.map((x) => {
            const unit = byId.get(x.combatant_id)
            return (
              <div key={x.combatant_id} className="bt-conc">
                <span>
                  <b>{unit ? nameOf(unit) : 'Герой'}</b> получил {x.damage} урона: спасбросок концентрации, Сл {x.dc}
                </span>
                <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void run(() => concentrationSave(roomId, combat.id, x.combatant_id))}>
                  <Dices aria-hidden="true" /> Бросить
                </button>
                <button type="button" className="tb-card-x" onClick={() => setConcChecks((l) => l.filter((y) => y.combatant_id !== x.combatant_id))} aria-label="Скрыть">
                  <X aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!isDm && !myUnit && <p className="bt-note"><UserRound aria-hidden="true" /> Вашего героя нет в этом бою</p>}

      {error && (
        <p className="tb-claimerr" role="alert">
          {error}
        </p>
      )}

      {!setup && trayActor?.card && <SlotSky slots={kit.slots} pick={slot} onPick={cmd === 'spell' ? setSlot : undefined} />}
      {cmd && trayActor && (
        <ActionTray
          key={`${cmd}-${trayActor.id}`}
          actor={trayActor}
          cmd={cmd}
          targets={targets}
          reaction={!isDm && !myTurn}
          kit={kit}
          slot={slot}
          onSlot={setSlot}
          onTargets={setTargets}
          onChances={setChances}
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
