/**
 * Лист героя «в духе бестиария» — общий для итога конструктора и для
 * сохранённого персонажа.
 *
 * Сохранённый лист идёт по страницам (`paged`): «Лист» — сцена героя,
 * характеристики с навыками, оружие и инвентарь; «Магия» — книга заклинаний;
 * «Умения» — умения, черты и владения; «Характер» — портрет во весь рост,
 * внешность и записи. Итог визарда — одна страница с теми же карточками.
 *
 * Без `onPatch` лист — витрина (итог визарда, предпросмотр). У сохранённого
 * героя все числа приходят с сервера (`/sheet`): игровая панель `engine`
 * шлёт действия, отдых и ход движку, а `onPatch` правит только документ —
 * кошелёк и записи. Всё, что бросается, бросается кликом — общими 3D-костями,
 * с историей бросков в углу экрана; туда же попадают броски сервера.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  Backpack,
  BookOpen,
  Camera,
  ChevronDown,
  Crosshair,
  Clover,
  Dices,
  Eye,
  Flame,
  EyeOff,
  Footprints,
  Hand,
  Heart,
  Languages,
  NotebookPen,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Trash2,
  UserRound,
  Zap,
  MoreHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cleanDescription, realImage } from '../api'
import type { Currency, Feat } from '../api'
import { CoinImg } from '../coins'
import { useCreatureDice } from '../creatureSheet'
import { formatDice } from '../equipment'
import { DIE_IMAGE_URLS, hitDieType } from '../dice/diceAssets'
import { useCatalogList } from '../create/useCatalog'
import { Corners } from '../ornaments'
import { RichText } from '../terms/terms'
import { AbilityText, parseAbilityText } from '../abilities/AbilityText'
import { useAbility } from '../abilities/abilityData'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../types/character'
import type { AbilityName, AttackEntry, InventoryItemInstance, LogEntry, SheetView } from '../types/character'
import { abilityMod } from '../create/dnd5e'
import { ChoicePortrait } from '../create/steps/ui'
import { alignmentAbbr } from '../create/steps/AlignmentChart'
import { FaceAvatar } from './FacePortrait'
import { HudBar } from './HudBar'
import { HeroStage } from './HeroStage'
import { InventoryBoard } from './InventoryBoard'
import { useAppShell } from '../shell'
import { SheetModal } from './SheetModal'
import { SpellBook } from './SpellBook'
import { DEFAULT_FACE, FALLBACK_FACE, type FaceCrop } from './portrait'
import type { SheetPatch, SheetPlay, SheetRoller } from './sheetPlay'
import { attackTags, d20Cards, rollMode, tagBonus, tagCards, type RollContext, type RollMode } from './rollBonuses'
import { RollTheater, type RollReaction, type RollSpec } from '../dice/theater/RollTheater'
import { ActionButton, activeStates, EnginePanel, type EngineView } from './EnginePanel'
import { ResourceBand } from './ResourceBand'
import { abilityPath } from './sheetView'
import { WhyDot, WhyProvider } from './WhyPopover'
import type { Outcome } from './useCharacterEngine'
import type { StageEngine } from './HeroStage'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/* ---------- бросок и история ---------- */

interface RollShown {
  id: number
  label: string
  /** выпавшие кости и бонус; total — итог */
  dice: number[]
  sides: number
  bonus: number
  /** число броска или знак для событий без броска (сотворено заклинание) */
  total: number | string
  crit?: boolean
  fumble?: boolean
}

/**
 * История бросков — закреплена в правом нижнем углу экрана. Новый бросок
 * появляется сверху и подсвечивается; список можно свернуть или очистить.
 */
function RollLog({ rolls, onClear }: { rolls: RollShown[]; onClear: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  if (rolls.length === 0) return null
  const [last, ...older] = rolls
  const mark = (r: RollShown) => (r.crit ? ' is-crit' : r.fumble ? ' is-fumble' : '')
  return createPortal(
    <aside className={`cw-rolllog${collapsed ? ' is-collapsed' : ''}`} aria-label="История бросков">
      <header className="cw-rolllog-head">
        <Dices aria-hidden="true" />
        <span>Броски · {rolls.length}</span>
        <button type="button" onClick={onClear} title="Очистить историю" aria-label="Очистить историю">
          <Trash2 aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          aria-expanded={!collapsed}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </header>
      <div key={last.id} className={`cw-rolllog-last${mark(last)}`} role="status" aria-live="polite">
        <span className="cw-rolllog-label">{last.label}</span>
        <span className="cw-rolllog-math">
          {last.dice.length > 0 && (
            <>
              {last.dice.length}к{last.sides} [<b>{last.dice.join(', ')}</b>]
            </>
          )}{' '}
          {last.bonus !== 0 && signed(last.bonus)}
        </span>
        <strong>{last.total}</strong>
      </div>
      {!collapsed && older.length > 0 && (
        <ol className="cw-rolllog-list">
          {older.map((r) => (
            <li key={r.id} className={mark(r).trim()}>
              <span>{r.label}</span>
              <b>{r.total}</b>
            </li>
          ))}
        </ol>
      )}
    </aside>,
    document.body,
  )
}

/** «1d8+3» / «1к8 + 3» → кости и бонус; число без костей — фиксированный урон */
function parseDamage(text: string): { n: number; sides: number; bonus: number } | null {
  const m = /(\d+)\s*[dк]\s*(\d+)\s*(?:([+\-−])\s*(\d+))?/i.exec(text)
  if (m) {
    const bonus = m[3] ? (m[3] === '+' ? 1 : -1) * Number(m[4]) : 0
    return { n: Number(m[1]), sides: Number(m[2]), bonus }
  }
  const flat = /^\s*([+\-−]?\d+)\s*$/.exec(text)
  return flat ? { n: 0, sides: 0, bonus: Number(flat[1].replace('−', '-')) } : null
}

/** Сколько атак даёт одно действие «Атака» */
function attacksPerAction(className: string, level: number): number {
  if (className === 'Воин') return level >= 20 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1
  if (['Варвар', 'Паладин', 'Следопыт', 'Монах'].includes(className)) return level >= 5 ? 2 : 1
  return 1
}

const SOURCE_LABEL: Record<string, string> = {
  class: 'умение класса',
  subclass: 'умение подкласса',
  race: 'расовая особенность',
  subrace: 'особенность подрасы',
  background: 'умение предыстории',
  feat: 'черта',
  choice: 'выбор',
  item: 'от предмета',
  other: 'умение',
}

/** Порядок групп на странице умений */
const SOURCE_GROUPS: { title: string; sources: string[] }[] = [
  { title: 'Класс', sources: ['class'] },
  { title: 'Подкласс', sources: ['subclass'] },
  { title: 'Раса', sources: ['race', 'subrace'] },
  { title: 'Предыстория', sources: ['background'] },
  { title: 'Черты', sources: ['feat'] },
  { title: 'Выбранные: стили, воззвания, предметы договора', sources: ['choice'] },
  { title: 'Предметы', sources: ['item'] },
  { title: 'Прочее', sources: ['other'] },
]

/* ---------- мелкие кирпичи ---------- */

/** Текст умения: у способностей движка — опрятный, со ссылками и сводкой механики */
function FeatureText({ row }: { row: FeatureRow }) {
  const ability = useAbility(row.slug)
  if (!row.slug) return row.text ? <RichText text={row.text} /> : <p className="cw-field-note">Описания нет.</p>
  return (
    <>
      {row.text || ability?.description ? (
        <AbilityText text={row.text || ability?.description} />
      ) : (
        <p className="cw-field-note">Описания нет.</p>
      )}
    </>
  )
}

function Card({
  title,
  icon: Icon,
  className = '',
  aside,
  children,
}: {
  title: string
  icon: LucideIcon
  className?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`beast-card cw-sheet-card ${className}`}>
      <Corners size={18} />
      <h3 className="beast-card-title">
        <Icon aria-hidden="true" /> {title}
        {aside && <span className="cw-sheet-aside">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Портрет: свой арт героя, иначе арт расы; битая ссылка — силуэт */
function HeroPortrait({ own, fallback }: { own: string | null; fallback: string | null }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [own])
  return own && !broken ? (
    <img src={own} alt="" onError={() => setBroken(true)} />
  ) : (
    <ChoicePortrait src={fallback} icon={UserRound} />
  )
}

/** Картинка оружия из инвентаря; без картинки — значок вида атаки */
function WeaponArt({ src, icon: Icon }: { src: string | null; icon: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="cw-wpn-art">
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon aria-hidden="true" />}
    </span>
  )
}

/** Кнопка-кость: сама кость за числом; «горячая» — следующий урон критический */
function DieButton({
  sides,
  value,
  label,
  hot,
  title,
  disabled,
  onClick,
}: {
  sides: number
  value: ReactNode
  label: string
  hot?: boolean
  title?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`cw-die${sides === 20 ? ' cw-die--hit' : ' cw-die--dmg'}${hot ? ' is-hot' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="cw-die-shape" aria-hidden="true">
        {sides > 0 ? <img src={DIE_IMAGE_URLS[hitDieType(sides)]} alt="" draggable={false} /> : <i className="cw-die-flat" />}
      </span>
      <b>{value}</b>
      <i>{label}</i>
    </button>
  )
}

type SheetAttack = Pick<AttackEntry, 'name' | 'type' | 'attack_bonus' | 'damage' | 'damage_type' | 'range' | 'properties'> & {
  key: string
  versatile: string | null
  image: string | null
}

interface FeatureRow {
  key: string
  source: string
  title: string
  sub: string
  text: string
  /** умение движка: можно включить или отключить, у него свои действия и ресурсы */
  grantId?: string
  slug?: string
  /** отключено игроком: бонусы не действуют, но умение остаётся в списке */
  disabled?: boolean
  status?: string
  active?: boolean
}

/** Страницы листа: на телефоне — бой / сумка / герой, на столе — те же четыре */
export type SheetTab = 'main' | 'magic' | 'features' | 'story' | 'bag' | 'hero' | 'more'

export interface CharacterSheetProps {
  sheet: SheetView
  /** свой портрет героя (ссылка) и запасной — арт расы */
  portrait: string | null
  fallbackPortrait: string | null
  /** заголовок над шапкой (например, «Герой готов» в визарде) */
  heading?: ReactNode
  play: SheetPlay
  /** инвентарь изменён; coins — монеты, высыпанные из контейнера */
  onInventory: (items: InventoryItemInstance[], coins?: Partial<Record<Currency, number>>) => void
  /** живой лист: правки хитов, состояний, кошелька и записей */
  onPatch?: SheetPatch
  /** клик по портрету в живом листе — сменить картинку */
  onPortraitClick?: () => void
  /** кадр лица и рамка своего портрета (для сцены героя) */
  face?: FaceCrop | null
  /** лист по страницам: «Лист», «Магия», «Умения», «Характер» */
  paged?: boolean
  tab?: SheetTab
  onTab?: (tab: SheetTab) => void
  /** игровая панель сохранённого героя: действия, ресурсы, ход, отдых */
  engine?: EngineView
  /** сцена героя: отдых, журнал и правка мастера */
  stage?: StageEngine
  /** итог последнего действия сервера — его броски идут в историю */
  serverLog?: Outcome | null
  /** включить или отключить умение (только своё) */
  onToggleAbility?: (grantId: string, enabled: boolean) => void
  /** отдых, журнал, правка — в «Ещё» и в меню полосы на телефоне */
  hudMore?: ReactNode
}

const STATUS_LABEL: Record<string, string> = {
  text_only: 'только текст — механика не автоматизирована',
  partial: 'частично автоматизировано — часть правила применяйте вручную',
  full: 'автоматизировано',
}

/** «1d20» / «2d6» из лога сервера → число граней */
const sidesOf = (dice: unknown) => Number(/d(\d+)/i.exec(String(dice ?? ''))?.[1]) || 0

export default function CharacterSheet({
  sheet,
  portrait,
  fallbackPortrait,
  heading,
  play,
  onInventory,
  onPatch,
  onPortraitClick,
  face = null,
  paged = false,
  tab: tabProp,
  onTab,
  engine,
  stage,
  serverLog = null,
  onToggleAbility,
  hudMore,
}: CharacterSheetProps) {
  const [ownTab, setOwnTab] = useState<SheetTab>('main')
  const tab = tabProp ?? ownTab
  const setTab = (t: SheetTab) => (onTab ? onTab(t) : setOwnTab(t))
  const shell = useAppShell()
  const hudMode = paged && shell.app
  const hudLandscape = hudMode && shell.landscape
  const live = !!onPatch

  useLayoutEffect(() => {
    if (!hudMode) return
    document.documentElement.dataset.hud = 'sheet'
    return () => {
      delete document.documentElement.dataset.hud
    }
  }, [hudMode])
  const dice = useCreatureDice()
  // история бросков: свежий — первым, держим последние 30
  const [rolls, setRolls] = useState<RollShown[]>([])
  const clearRolls = useCallback(() => setRolls([]), [])
  // атака, для которой выпала натуральная 20: её следующий урон — критический
  const [critFor, setCritFor] = useState<string | null>(null)
  const [openFeatureKey, setOpenFeatureKey] = useState<string | null>(null)
  const setOpenFeature = (f: FeatureRow | null) => setOpenFeatureKey(f?.key ?? null)
  const { items: featCatalog } = useCatalogList<Feat>('feats', sheet.feats.length > 0)

  const info = sheet.basic_info
  // способности движка: крит с 19 у Чемпиона, атак за действие у Дополнительной атаки
  const extras = sheet.extras
  const critMin = extras?.critMin ?? 20

  /* ---------- броски: 3D-кости, затем театр в духе BG3 ---------- */

  const show = (r: Omit<RollShown, 'id'>) =>
    setRolls((prev) => [{ ...r, id: (prev[0]?.id ?? 0) + 1 }, ...prev].slice(0, 30))
  const note = (total: string, label: string) => show({ label, dice: [], sides: 0, bonus: 0, total })

  // очередь показов: каждый бросок — свой «театр», по одному
  const [theater, setTheater] = useState<RollSpec[]>([])
  const theaterId = useRef(0)
  const enqueue = useCallback(
    (spec: Omit<RollSpec, 'id'>) => setTheater((q) => [...q, { ...spec, id: ++theaterId.current }]),
    [],
  )

  /**
   * Реакции после к20 — что герой может добавить к уже выпавшему:
   * вдохновение и Везунчик — ещё к20 и взять лучшую, кость превосходства — к
   * атаке, Удача темнейшего — к10 к проверке или спасброску, Удача плута —
   * превратить бросок в 20. Ресурс списывает сервер, кость бросает театр.
   */
  const d20Reactions = (kind: RollContext['kind'] | undefined): RollReaction[] => {
    const out: RollReaction[] = []
    const vitals = stage?.onVitals
    const spendRes = stage?.onSpendResource
    const res = (key: string) => engine?.sheet.resources.find((r) => r.key === key && r.current > 0)
    const isAttack = kind === 'attack' || kind === 'spell'
    const isCheck = kind === 'check' || kind === 'skill' || kind === 'init'
    const isSave = kind === 'save'

    if (vitals && (stage?.inspiration ?? 0) > 0) {
      out.push({
        key: 'inspiration',
        label: 'Вдохновение',
        hint: 'перебросить к20 и взять лучшее',
        icon: Star,
        run: async () => {
          vitals('inspiration', -1)
          const v = await dice.roll(1, 20)
          return v ? { newD20: v[0] } : null
        },
      })
    }
    if (!spendRes) return out

    const luck = res('luck')
    if (luck && (isAttack || isCheck || isSave)) {
      out.push({
        key: 'luck',
        label: 'Везунчик',
        hint: `ещё к20 — единиц удачи: ${luck.current}`,
        icon: Clover,
        run: async () => {
          if (!(await spendRes('luck', 1, 'Везунчик: дополнительная к20'))) return null
          const v = await dice.roll(1, 20)
          return v ? { newD20: v[0] } : null
        },
      })
    }

    // кость превосходства мастера боевых искусств — по классу, у черты и стиля — к6
    const sup = ['superiority', 'superiority_feat', 'superiority_style'].map(res).find(Boolean)
    if (sup && isAttack) {
      const dieVar = engine?.sheet.values['var.superiority_die']
      const sides = sup.key === 'superiority' && typeof dieVar === 'number' ? dieVar : 6
      out.push({
        key: 'superiority',
        label: 'Кость превосходства',
        hint: `+к${sides} к атаке — осталось ${sup.current}`,
        icon: Swords,
        run: async () => {
          if (!(await spendRes(sup.key, 1, 'Приём точности: кость к атаке'))) return null
          const v = await dice.roll(1, sides)
          return v ? { addDie: { sides, value: v[0] }, label: 'Кость превосходства' } : null
        },
      })
    }

    const dark = res('dark_ones_luck')
    if (dark && (isCheck || isSave)) {
      out.push({
        key: 'dark_ones_luck',
        label: 'Удача темнейшего',
        hint: '+к10 к проверке или спасброску',
        icon: Flame,
        run: async () => {
          if (!(await spendRes('dark_ones_luck', 1, 'Удача темнейшего: +к10'))) return null
          const v = await dice.roll(1, 10)
          return v ? { addDie: { sides: 10, value: v[0] }, label: 'Удача темнейшего' } : null
        },
      })
    }

    const stroke = res('stroke_of_luck')
    if (stroke && (isAttack || isCheck)) {
      out.push({
        key: 'stroke_of_luck',
        label: 'Удача',
        hint: 'считать бросок к20 равным 20',
        icon: Sparkles,
        run: async () => ((await spendRes('stroke_of_luck', 1, 'Удача: к20 становится 20')) ? { newD20: 20 } : null),
      })
    }
    return out
  }

  const rollD20 = async (label: string, bonus: number, attackKey?: string, ctx?: RollContext) => {
    // преимущество и помеха — из листа: Безрассудная атака, ярость на Силу
    const { mode, label: modeLabel } = rollMode(sheet, ctx)
    const values = await dice.roll(mode === 'normal' ? 1 : 2, 20)
    if (!values) return null
    const kept = mode === 'adv' ? Math.max(...values) : mode === 'dis' ? Math.min(...values) : values[0]
    // у атаки крит может начинаться раньше 20 (Улучшенные критические попадания)
    const crit = kept >= (attackKey ? critMin : 20)
    const tag = mode === 'adv' ? ' · преимущество' : mode === 'dis' ? ' · помеха' : ''
    show({ label: `${label}${tag}`, dice: values, sides: 20, bonus, total: kept + bonus, crit, fumble: kept === 1 })
    if (attackKey) setCritFor(crit ? attackKey : null)
    enqueue({
      title: label,
      kind: 'd20',
      dice: values.map((value) => ({ sides: 20, value })),
      mode,
      modeLabel,
      bonuses: d20Cards(sheet, ctx, bonus),
      critMin: attackKey ? critMin : 20,
      reactions: ctx?.kind === 'death' ? [] : d20Reactions(ctx?.kind),
    })
    return kept
  }

  const rollDamage = async (label: string, formula: string, attackKey: string, ctx?: RollContext) => {
    const parsed = parseDamage(formula)
    if (!parsed) return
    const crit = critFor === attackKey
    // бонусы урона по тегам атаки: Ярость +2 к силовой рукопашной
    const extra = ctx?.tags ? tagCards(sheet, 'dmgBonus', ctx.tags) : []
    const extraSum = extra.reduce((s, c) => s + c.value, 0)
    const modCard = parsed.bonus
      ? [{ label: ctx?.ability ? ABILITY_LABELS[ctx.ability].label : 'Модификатор', value: parsed.bonus, kind: 'ability' as const }]
      : []
    if (parsed.n === 0) {
      show({ label, dice: [], sides: 0, bonus: parsed.bonus + extraSum, total: Math.max(1, parsed.bonus + extraSum) })
      return
    }
    const n = crit ? parsed.n * 2 : parsed.n
    const values = await dice.roll(n, parsed.sides)
    if (!values) return
    const total = Math.max(1, values.reduce((a, b) => a + b, 0) + parsed.bonus + extraSum)
    const title = crit ? `${label} · крит!` : label
    show({ label: title, dice: values, sides: parsed.sides, bonus: parsed.bonus + extraSum, total, crit })
    setCritFor(null)
    enqueue({ title, kind: 'dice', dice: values.map((value) => ({ sides: parsed.sides, value })), mode: 'normal', bonuses: [...modCard, ...extra] })
  }

  const rollDice = async (label: string, n: number, sides: number, bonus: number) => {
    const values = await dice.roll(n, sides)
    if (!values) return null
    show({ label, dice: values, sides, bonus, total: values.reduce((a, b) => a + b, 0) + bonus })
    enqueue({
      title: label,
      kind: 'dice',
      dice: values.map((value) => ({ sides, value })),
      mode: 'normal',
      bonuses: bonus ? [{ label: 'Бонус', value: bonus, kind: 'other' }] : [],
    })
    return values
  }

  const roller: SheetRoller = { rolling: dice.rolling, critFor, rollD20, rollDamage, rollDice, note }

  /*
   * Броски сервера (Скрытая атака, отдых): 3D-кости катятся для вида, а театр
   * показывает числа сервера. Пришло одно значение к20 при преимуществе —
   * вторую кость дорисовываем случайно не выше (при помехе — не ниже).
   */
  const rollDice3d = dice.roll
  useEffect(() => {
    if (!serverLog) return
    const shown = serverLog.log.filter((l: LogEntry) => l.kind === 'roll' && Array.isArray(l.data?.rolls))
    setRolls((prev) => {
      let next = prev
      const push = (r: Omit<RollShown, 'id'>) => (next = [{ ...r, id: (next[0]?.id ?? 0) + 1 }, ...next].slice(0, 30))
      for (const l of shown) {
        const rolled = l.data!.rolls!
        const sum = rolled.reduce((a, b) => a + b, 0)
        const total = typeof l.data?.total === 'number' ? l.data.total : sum
        push({ label: `${serverLog.title}: ${l.message.split(':')[0]}`, dice: rolled, sides: sidesOf(l.data?.dice), bonus: total - sum, total })
      }
      if (shown.length === 0) push({ label: serverLog.title, dice: [], sides: 0, bonus: 0, total: '✓' })
      return next
    })
    let cancelled = false
    void (async () => {
      for (const l of shown) {
        if (cancelled) return
        const rolled = l.data!.rolls!
        const sides = sidesOf(l.data?.dice) || 6
        const notation = String(l.data?.dice ?? '')
        // сервер сам присылает режим и обе кости; у старого — догадка по нотации
        const sent = l.data?.mode
        let mode: RollMode =
          sent === 'adv' || sent === 'dis' ? sent : /kh|adv/i.test(notation) ? 'adv' : /kl|dis/i.test(notation) ? 'dis' : 'normal'
        let values = [...rolled]
        if (sides === 20 && mode !== 'normal' && values.length === 1) {
          const v = values[0]
          const other = mode === 'adv' ? 1 + Math.floor(Math.random() * v) : v + Math.floor(Math.random() * (21 - v))
          values = [v, other]
        }
        // две кости не к20 с преимуществом — показываем только оставленную
        if (mode !== 'normal' && sides !== 20 && values.length === 2) {
          values = [mode === 'adv' ? Math.max(...values) : Math.min(...values)]
        }
        if (sides !== 20 || values.length !== 2) mode = 'normal'
        // визуальный бросок: число костей и граней как у сервера
        await rollDice3d(values.length, sides).catch(() => null)
        const kept = mode === 'adv' ? Math.max(...values) : mode === 'dis' ? Math.min(...values) : null
        const sum = kept ?? values.reduce((a, b) => a + b, 0)
        const total = typeof l.data?.total === 'number' ? l.data.total : sum
        enqueue({
          title: `${serverLog.title}: ${l.message.split(':')[0]}`,
          kind: sides === 20 ? 'd20' : 'dice',
          dice: values.map((value) => ({ sides, value })),
          mode,
          bonuses: total - sum ? [{ label: serverLog.title, value: total - sum, kind: 'feature' }] : [],
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [serverLog]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- значения листа ---------- */

  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const level = info.total_level
  const pb = sheet.proficiency_bonus
  const score = (k: AbilityName) => sheet.ability_scores[k].score
  // у листа с сервера модификатор и спасбросок готовые; у черновика визарда — по таблице
  const mod = (k: AbilityName) => sheet.ability_scores[k].modifier ?? abilityMod(score(k))
  const strMod = mod('strength')
  const perAction = extras?.perAction ?? attacksPerAction(cls.name, level)
  const combat = sheet.combat
  const spell = sheet.spellcasting
  const items = sheet.inventory.items
  const hasMagic = spell.is_spellcaster || spell.spells_known.length > 0

  // оружие — по экземплярам инвентаря: оттуда картинка и универсальный хват
  const itemById = new Map(items.map((it) => [it.instance_id, it]))
  const attacks: SheetAttack[] = sheet.attacks.map((a, i) => {
    const eq = a.inventory_instance_id ? itemById.get(a.inventory_instance_id)?.equipment : null
    const modPart = /[+\-−]\d+$/.exec(a.damage)?.[0] ?? ''
    return {
      ...a,
      key: a.inventory_instance_id ?? `atk-${i}`,
      versatile: eq?.weapon?.versatile_dice ? `${eq.weapon.versatile_dice}${modPart}` : null,
      image: realImage(eq?.equipment_image_gallery),
    }
  })
  // кость безоружного удара от Боевых искусств монаха: с ней можно бить Ловкостью
  const unarmedDie = extras?.unarmedDie ?? 1
  const unarmedMod = unarmedDie > 1 ? Math.max(strMod, mod('dexterity')) : strMod
  const signedMod = unarmedMod ? (unarmedMod > 0 ? `+${unarmedMod}` : `${unarmedMod}`) : ''
  attacks.push({
    key: 'unarmed',
    name: 'Безоружный удар',
    type: 'melee',
    attack_bonus: unarmedMod + pb,
    damage: unarmedDie > 1 ? `1d${unarmedDie}${signedMod}` : String(Math.max(1, 1 + unarmedMod)),
    damage_type: 'дробящий',
    range: '5 фт.',
    properties: [],
    versatile: null,
    image: null,
  })

  const coins = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
  const purse = live ? coins : coins.filter((c) => sheet.inventory.currency[c] > 0)

  // навыки с владением — первыми: ими пользуются чаще; компетентность — двойное мастерство
  const skillRows = DEFAULT_SKILLS.map((s) => {
    const entry = sheet.skills[s.key]
    const prof = !!entry?.proficient
    const expert = prof && !!entry?.expertise
    const ability = entry?.ability ?? s.ability
    return { ...s, ability, prof, expert, bonus: entry?.modifier ?? mod(ability) + (expert ? pb * 2 : prof ? pb : 0) }
  }).sort((a, b) => Number(b.prof) - Number(a.prof) || a.label.localeCompare(b.label, 'ru'))

  // feature_source в листе — UUID; в подписи показываем название владельца
  const ownerOf = (source: string): string | null =>
    source === 'class'
      ? (info.classes[0]?.name ?? null)
      : source === 'subclass'
        ? (info.classes[0]?.subclass_name ?? null)
        : source === 'subrace'
          ? (info.subrace?.name ?? null)
          : source === 'race'
            ? info.race.name
            : source === 'background'
              ? (info.background?.name ?? null)
              : null

  // включённые состояния (идёт ярость) — подсветка ресурса того же ключа
  const activeKeys = new Set(engine ? activeStates(engine.sheet, engine.labels).map((x) => x.key) : [])

  // элементы способности по grant_id: её кнопки и её счётчики
  const actionsOf = (grantId: string) => engine?.sheet.actions.filter((a) => a.grant_id === grantId) ?? []
  const resourcesOf = (slug: string | undefined) => (slug ? (engine?.sheet.resources.filter((r) => r.declared_by === slug) ?? []) : [])

  const featureRows: FeatureRow[] = [
    ...sheet.features.map((f, i) => ({
      key: f.grant_id ?? `${f.name}-${i}`,
      source: f.source,
      title: f.name,
      // уровень получения — из служебной строки описания («3-й уровень, умение воина»)
      sub: [
        SOURCE_LABEL[f.source] ?? '',
        ownerOf(f.source),
        f.level ? `${f.level} ур.` : (/^\d+ ур\./.exec(parseAbilityText(f.description).meta[0] ?? '')?.[0] ?? ''),
      ]
        .filter(Boolean)
        .join(' · '),
      text: f.description,
      grantId: f.grant_id,
      slug: f.slug,
      disabled: f.disabled,
      status: f.implementation_status,
      active: f.active,
    })),
    ...sheet.feats.map((featId) => {
      const feat = featCatalog.find((x) => x.id === featId)
      return {
        key: featId,
        source: 'feat',
        title: feat?.feat_name ?? 'Черта',
        sub: ['черта', feat?.prerequisite ? `требование: ${feat.prerequisite}` : ''].filter(Boolean).join(' · '),
        text: cleanDescription(feat?.description),
      }
    }),
  ]

  const personaFields = [
    ['traits', 'Черты'],
    ['ideals', 'Идеалы'],
    ['bonds', 'Привязанности'],
    ['flaws', 'Слабости'],
  ] as const
  const persona = [
    ...personaFields.map(([k, label]) => [label, sheet.personality[k]] as const),
    ['История', sheet.backstory] as const,
  ].filter(([, text]) => text.trim())

  const openFeature = openFeatureKey ? (featureRows.find((f) => f.key === openFeatureKey) ?? null) : null

  /* ---------- карточки ---------- */

  const abilitiesCard = (
    <Card title="Характеристики и навыки" icon={ShieldCheck} className="cw-sheet-card--abilities">
      <div className="cw-abil-grid">
        {ABILITY_KEYS.map((k) => {
          const label = ABILITY_LABELS[k]
          const saveProf = sheet.ability_scores[k].saving_throw_proficient
          const save = sheet.ability_scores[k].save ?? mod(k) + (saveProf ? pb : 0)
          return (
            <div key={k} className={`cw-abil${saveProf ? ' is-prof' : ''}`}>
              <button
                type="button"
                className="cw-abil-check"
                onClick={() => void rollD20(`${label.label}, проверка`, mod(k), undefined, { kind: 'check', ability: k })}
                disabled={dice.rolling}
                title={`Проверка: к20 ${signed(mod(k))}`}
              >
                <i>{label.abbr}</i>
                <b>{score(k)}</b>
                <em>{signed(mod(k))}</em>
                <WhyDot req={{ path: abilityPath(k, 'score'), title: label.label, total: score(k), baseLabel: 'Базовое значение' }} />
              </button>
              <button
                type="button"
                className="cw-abil-save"
                onClick={() => void rollD20(`${label.label}, спасбросок`, save, undefined, { kind: 'save', ability: k })}
                disabled={dice.rolling}
                title={saveProf ? 'Спасбросок — владение' : 'Спасбросок'}
              >
                спас <b>{signed(save)}</b>
                <WhyDot req={{ path: abilityPath(k, 'save'), title: `Спасбросок: ${label.label}`, total: save }} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="beast-skills cw-skill-buttons cw-skill-cols">
        {skillRows.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`beast-skill${s.prof ? ' is-prof' : ''}${s.expert ? ' is-expert' : ''}`}
            onClick={() => void rollD20(s.label, s.bonus, undefined, { kind: 'skill', skill: s.key, ability: s.ability })}
            disabled={dice.rolling}
            title={s.expert ? 'Компетентность: двойной бонус мастерства' : undefined}
          >
            <span className="beast-skill-bonus">{signed(s.bonus)}</span>
            <span className="beast-skill-name">{s.label}</span>
            <span className="beast-skill-ab">{ABILITY_LABELS[s.ability].abbr}</span>
            <WhyDot req={{ path: `char.skills.${s.key}.bonus`, title: s.label, total: s.bonus }} />
          </button>
        ))}
      </div>
      <p className="cw-passive">
        <Eye aria-hidden="true" /> пассивная внимательность <b>{combat.passive_perception}</b>
      </p>
    </Card>
  )

  const combatCard = (
    <Card
      title="Бой"
      icon={Swords}
      className="cw-sheet-card--combat"
      aside={[perAction > 1 ? `атак за действие: ×${perAction}` : '', critMin < 20 ? `крит от ${critMin}` : ''].filter(Boolean).join(' · ') || null}
    >
      <div className="cw-wpns">
        {attacks.map((a) => {
          const crit = critFor === a.key
          // бонусы способностей по тегам атаки: к попаданию и к урону (Ярость +2)
          const { tags, ability } = attackTags(a, sheet)
          const ctx: RollContext = { kind: 'attack', ability, tags }
          const hit = a.attack_bonus + tagBonus(sheet, 'attackBonus', tags)
          const dmgExtra = tagBonus(sheet, 'dmgBonus', tags)
          const dmg = parseDamage(a.damage)
          const dmgText = (formula: string) => {
            const p = parseDamage(formula)
            if (!p || !dmgExtra) return formatDice(formula) ?? formula
            const b = p.bonus + dmgExtra
            return p.n ? `${p.n}к${p.sides}${b ? signed(b) : ''}` : String(Math.max(1, b))
          }
          const props = [a.range, ...a.properties].filter(Boolean).join(' · ')
          return (
            <div key={a.key} className={`cw-wpn${crit ? ' is-crit' : ''}`}>
              <WeaponArt src={a.image} icon={a.type === 'ranged' ? Crosshair : a.key === 'unarmed' ? Hand : Swords} />
              <span className="cw-wpn-body">
                <b>{a.name}</b>
                <i title={props}>{props}</i>
              </span>
              <span className="cw-wpn-dice">
                <DieButton
                  sides={20}
                  value={signed(hit)}
                  label="атака"
                  onClick={() =>
                    void rollD20(`${a.name}, попадание`, hit, a.key, {
                      ...ctx,
                      bonuses: [...d20Cards(sheet, ctx, a.attack_bonus), ...tagCards(sheet, 'attackBonus', tags)],
                    })
                  }
                  disabled={dice.rolling}
                  title="Бросок атаки: к20 + бонус"
                />
                {a.damage && (
                  <DieButton
                    sides={dmg?.sides ?? 0}
                    value={dmgText(a.damage)}
                    label={crit ? 'крит ×2' : (a.damage_type || 'урон').toLocaleLowerCase('ru')}
                    hot={crit}
                    onClick={() => void rollDamage(`${a.name}, урон`, a.damage, a.key, { kind: 'damage', ability, tags })}
                    disabled={dice.rolling}
                    title={crit ? 'Критическое попадание: кости урона удваиваются' : 'Бросок урона'}
                  />
                )}
                {a.versatile && (
                  <DieButton
                    sides={parseDamage(a.versatile)?.sides ?? 0}
                    value={dmgText(a.versatile)}
                    label="двуручно"
                    hot={crit}
                    onClick={() => void rollDamage(`${a.name}, двуручно`, a.versatile!, a.key, { kind: 'damage', ability, tags })}
                    disabled={dice.rolling}
                    title="Универсальное оружие двумя руками"
                  />
                )}
              </span>
            </div>
          )
        })}
        {spell.is_spellcaster && spell.spell_attack_bonus != null && (
          <div className="cw-wpn cw-wpn--spell">
            <WeaponArt src={null} icon={Sparkles} />
            <span className="cw-wpn-body">
              <b>Атака заклинанием</b>
              <i>Сл спасброска {spell.spell_save_dc}</i>
            </span>
            <span className="cw-wpn-dice">
              <DieButton
                sides={20}
                value={signed(spell.spell_attack_bonus)}
                label="атака"
                onClick={() =>
                  void rollD20('Атака заклинанием', spell.spell_attack_bonus!, 'spell', {
                    kind: 'spell',
                    ability: spell.spellcasting_ability ?? undefined,
                    tags: ['spell'],
                  })
                }
                disabled={dice.rolling}
              />
            </span>
          </div>
        )}
      </div>
    </Card>
  )

  const invCard = (
    <Card title="Инвентарь" icon={Backpack} className="cw-sheet-card--inv" aside={items.length ? String(items.length) : null}>
      <InventoryBoard items={items} onChange={onInventory} />
      {purse.length > 0 && (
        <div className={`cw-purse${live ? ' is-live' : ''}`}>
          {purse.map((c) => (
            <span key={c}>
              <CoinImg currency={c} size={20} />
              {onPatch ? (
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={sheet.inventory.currency[c]}
                  aria-label={`Монеты: ${c}`}
                  onChange={(e) => {
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0)
                    onPatch((ch) => ({
                      ...ch,
                      inventory: { ...ch.inventory, currency: { ...ch.inventory.currency, [c]: v } },
                    }))
                  }}
                />
              ) : (
                <b>{sheet.inventory.currency[c]}</b>
              )}
            </span>
          ))}
        </div>
      )}
    </Card>
  )

  const spellBook = hasMagic && <SpellBook spellcasting={spell} play={play} roller={roller} />

  const featureTile = (f: FeatureRow) => (
    <button
      key={f.key}
      type="button"
      className={`cw-ftile cw-feat-line--${f.source}${f.disabled ? ' is-disabled' : f.active === false ? ' is-off' : ''}${f.status ? ` is-${f.status}` : ''}`}
      onClick={() => setOpenFeature(f)}
      title={f.disabled ? 'Отключено — бонусы не действуют' : f.status ? STATUS_LABEL[f.status] : undefined}
    >
      <b>
        {f.disabled && <EyeOff className="cw-ftile-lock" aria-label="отключено" />}
        {f.title}
      </b>
      <i>
        {f.sub}
        {f.disabled ? ' · отключено' : f.active === false ? ' · не действует' : ''}
        {f.status === 'partial' && ' · частично'}
      </i>
      {f.grantId && actionsOf(f.grantId).length > 0 && (
        <span className="cw-ftile-acts" title="Действий у способности">
          <Zap aria-hidden="true" />
          {actionsOf(f.grantId).length}
        </span>
      )}
      <BookOpen className="cw-ftile-ico" aria-hidden="true" />
    </button>
  )

  const featuresCard = (
    <Card title="Умения" icon={BookOpen} className="cw-sheet-card--features" aside={String(featureRows.length)}>
      <div className="cw-ftiles">{featureRows.map(featureTile)}</div>
    </Card>
  )

  const profsCard = (
    <Card title="Владения" icon={Languages} className="cw-sheet-card--profs">
      <dl className="cw-profs">
        {(
          [
            ['Доспехи', sheet.proficiencies.armor],
            ['Оружие', sheet.proficiencies.weapons],
            ['Инструменты', sheet.proficiencies.tools],
            ['Языки', sheet.proficiencies.languages],
          ] as const
        )
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{list.join(', ')}</dd>
            </div>
          ))}
      </dl>
    </Card>
  )

  /** Что выдают способности: приёмы, особые правила, величины (кость скрытой атаки…) */
  const rulesCard = extras && (extras.maneuvers.length > 0 || extras.flags.length > 0 || extras.vars.length > 0) && (
    <Card title="Особые правила" icon={Sparkles} className="cw-sheet-card--rules">
      <dl className="cw-profs">
        {extras.vars.length > 0 && (
          <div>
            <dt>Величины</dt>
            <dd>
              <ul className="cw-rules-vars">
                {extras.vars.map((v) => (
                  <li key={v.key}>
                    <span>{v.label}</span>
                    <b>{formatDice(v.value) ?? v.value}</b>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {extras.maneuvers.length > 0 && (
          <div>
            <dt>Боевые приёмы</dt>
            <dd>{extras.maneuvers.join(', ')}</dd>
          </div>
        )}
        {extras.flags.length > 0 && (
          <div>
            <dt>Помнить за столом</dt>
            <dd>
              <ul className="cw-rules-flags">
                {extras.flags.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </Card>
  )

  /** Страница умений: группы по источнику, клик — попап с описанием */
  const featuresPage = (
    <div className="cw-fpage">
      <div className="cw-fpage-groups">
        {featureRows.length === 0 && <p className="cw-field-note">Умений пока нет.</p>}
        {SOURCE_GROUPS.map((g) => {
          const list = featureRows.filter((f) => g.sources.includes(f.source))
          if (!list.length) return null
          return (
            <section key={g.title} className="cw-fgroup">
              <h4 className="cw-fgroup-title">
                {g.title} <em>{list.length}</em>
              </h4>
              <div className="cw-ftiles">{list.map(featureTile)}</div>
            </section>
          )
        })}
      </div>
      <div className="cw-fpage-side">
        {profsCard}
        {rulesCard}
      </div>
    </div>
  )

  const personaCard = onPatch ? (
    <Card title="Характер и записи" icon={NotebookPen} className="cw-sheet-card--persona">
      <div className="cw-persona-edit">
        {personaFields.map(([key, label]) => (
          <label key={key} className="cw-field">
            <span>{label}</span>
            <textarea
              rows={3}
              value={sheet.personality[key]}
              placeholder={`${label}…`}
              onChange={(e) => onPatch((c) => ({ ...c, personality: { ...c.personality, [key]: e.target.value } }))}
            />
          </label>
        ))}
        <label className="cw-field cw-field--wide">
          <span>История</span>
          <textarea
            rows={5}
            value={sheet.backstory}
            placeholder="Откуда герой и что привело его в путь…"
            onChange={(e) => onPatch((c) => ({ ...c, backstory: e.target.value }))}
          />
        </label>
        <label className="cw-field cw-field--wide">
          <span>Заметки</span>
          <textarea
            rows={5}
            value={sheet.notes}
            placeholder="Квесты, имена, долги, подсказки мастера…"
            onChange={(e) => onPatch((c) => ({ ...c, notes: e.target.value }))}
          />
        </label>
      </div>
    </Card>
  ) : (
    persona.length > 0 && (
      <Card title="Характер" icon={UserRound} className="cw-sheet-card--persona">
        <dl className="cw-profs">
          {persona.map(([label, text]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </Card>
    )
  )

  /** Страница характера: большой портрет во весь рост и всё о внешности */
  const looks = (
    [
      ['Раса', info.subrace?.name ?? info.race.name],
      ['Предыстория', info.background?.name],
      ['Мировоззрение', info.alignment],
      ['Пол', info.gender],
      ['Возраст', info.age != null ? String(info.age) : ''],
      ['Рост', info.height],
      ['Вес', info.weight],
      ['Глаза', info.eyes],
      ['Волосы', info.hair],
      ['Кожа', info.skin],
    ] as const
  ).filter(([, v]) => v && String(v).trim())

  const storyPage = (
    <div className="cw-story">
      <figure className="cw-story-art">
        <HeroPortrait own={portrait} fallback={fallbackPortrait} />
        {onPortraitClick && (
          <button type="button" className="cw-portrait-edit" onClick={onPortraitClick} title="Сменить портрет">
            <Camera aria-hidden="true" />
          </button>
        )}
        {looks.length > 0 && (
          <figcaption className="cw-story-looks">
            {looks.map(([label, value]) => (
              <span key={label}>
                <i>{label}</i>
                <b>{value}</b>
              </span>
            ))}
          </figcaption>
        )}
      </figure>
      <div className="cw-story-text">{personaCard}</div>
    </div>
  )

  /** Шапка итога визарда: портрет целиком и главные числа строкой */
  const abbr = alignmentAbbr(info.alignment ?? '')
  const flatHero = (
    <header className="cw-sheet-hero">
      <span className="cw-sheet-portrait">
        <HeroPortrait own={portrait} fallback={fallbackPortrait} />
        {abbr && <span className="cw-hero-align">{abbr}</span>}
      </span>
      <div className="cw-sheet-id">
        <h2 className="cw-sheet-name gold-text">{info.name}</h2>
        <p className="cw-sheet-who">
          {[info.subrace?.name ?? info.race.name, `${cls.name} ${level} ур.`, cls.subclass_name].filter(Boolean).join(' · ')}
        </p>
        {(info.background || info.alignment) && (
          <p className="cw-sheet-sub">
            {[info.background?.name && `предыстория: ${info.background.name}`, info.alignment].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="cw-sheet-stats">
          <span className="cw-stat cw-stat--ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{combat.armor_class}</b>
            <i>КД</i>
          </span>
          <span className="cw-stat cw-stat--hp" title="Максимум хитов">
            <Heart aria-hidden="true" />
            <b>{combat.hit_points.max}</b>
            <i>хиты</i>
          </span>
          <button
            type="button"
            className="cw-stat cw-stat--roll"
            onClick={() => void rollD20('Инициатива', combat.initiative, undefined, { kind: 'init' })}
            disabled={dice.rolling}
            title="Бросить инициативу"
          >
            <Zap aria-hidden="true" />
            <b>{signed(combat.initiative)}</b>
            <i>инициатива</i>
          </button>
          <span className="cw-stat">
            <Footprints aria-hidden="true" />
            <b>{combat.speed}</b>
            <i>фт. скорость</i>
          </span>
          <span className="cw-stat">
            <Award aria-hidden="true" />
            <b>+{pb}</b>
            <i>мастерство</i>
          </span>
          <span className="cw-stat">
            <Dices aria-hidden="true" />
            <b>{formatDice(combat.hit_dice.total)}</b>
            <i>кости хитов</i>
          </span>
        </div>
      </div>
    </header>
  )

  /* ---------- раскладка ---------- */

  type TabRow = { id: SheetTab; label: string; icon: LucideIcon; badge?: number; alert?: number }
  const deskTabs: TabRow[] = [
    { id: 'main', label: 'Лист', icon: Swords },
    ...(hasMagic ? [{ id: 'magic' as const, label: 'Магия', icon: Sparkles, badge: spell.spells_known.length }] : []),
    { id: 'features', label: 'Умения', icon: BookOpen, badge: featureRows.length, alert: engine?.sheet.pending_decisions.length },
    { id: 'story', label: 'Характер', icon: UserRound },
  ]
  const hudTabs: TabRow[] = [
    ...(!hudLandscape ? [{ id: 'hero' as const, label: 'Герой', icon: UserRound }] : []),
    { id: 'main', label: 'Бой', icon: Swords },
    { id: 'bag', label: 'Сумка', icon: Backpack, badge: items.length || undefined },
    ...(hasMagic ? [{ id: 'magic' as const, label: 'Магия', icon: Sparkles, badge: spell.spells_known.length }] : []),
    { id: 'features', label: 'Умения', icon: BookOpen, badge: featureRows.length, alert: engine?.sheet.pending_decisions.length },
    { id: 'more', label: 'Ещё', icon: MoreHorizontal },
  ]
  const tabs = hudMode ? hudTabs : deskTabs
  const rawTab = tab === 'story' && hudMode ? 'more' : tab === 'more' && !hudMode ? 'story' : tab === 'bag' || tab === 'hero' ? (hudMode ? tab : 'main') : tab
  const current = tabs.some((t) => t.id === rawTab) ? rawTab : 'main'

  const hudCrop = portrait ? (face ?? DEFAULT_FACE) : FALLBACK_FACE
  const hudRail = (
    <aside className="cw-hud-rail">
      <button
        type="button"
        className="cw-hud-face"
        onClick={onPortraitClick}
        disabled={!onPortraitClick}
        title={onPortraitClick ? 'Сменить портрет' : info.name}
      >
        <FaceAvatar src={portrait ?? fallbackPortrait} crop={hudCrop} />
      </button>
      <div className="cw-hud-stats">
        {ABILITY_KEYS.map((k) => {
          const label = ABILITY_LABELS[k]
          return (
            <button
              key={k}
              type="button"
              className="cw-hud-abil"
              onClick={() => void rollD20(`${label.label}, проверка`, mod(k), undefined, { kind: 'check', ability: k })}
              disabled={dice.rolling}
              title={`Проверка: к20 ${signed(mod(k))}`}
            >
              <i>{label.abbr}</i>
              <b>{signed(mod(k))}</b>
              <em>{score(k)}</em>
            </button>
          )
        })}
      </div>
      <p className="cw-hud-passive">
        <Eye aria-hidden="true" /> {combat.passive_perception}
      </p>
    </aside>
  )

  const resources = engine && (
    <ResourceBand
      resources={engine.sheet.resources}
      activeKeys={activeKeys}
      onOpen={(slug) => setOpenFeature(featureRows.find((f) => f.slug === slug) ?? null)}
    />
  )

  const tabButtons = (rows: TabRow[], compact?: boolean) => (
    <nav className={compact ? 'cw-hud-tabs' : 'cw-tabs'} role="tablist" aria-label="Страницы листа">
      {rows.map(({ id, label, icon: Icon, badge, alert }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={current === id}
          className={`${compact ? 'cw-hud-tab' : 'cw-tab'}${current === id ? ' is-on' : ''}`}
          onClick={() => setTab(id)}
        >
          <Icon aria-hidden="true" /> {label}
          {badge ? <em>{badge}</em> : null}
          {alert ? (
            <em className="is-alert" title="Нерешённые выборы">
              !{alert}
            </em>
          ) : null}
        </button>
      ))}
    </nav>
  )

  const hudPane =
    current === 'hero' ? (
      <div className="cw-hud-hero">
        <button
          type="button"
          className="cw-hud-hero-art"
          onClick={onPortraitClick}
          disabled={!onPortraitClick}
          title={onPortraitClick ? 'Сменить портрет' : info.name}
        >
          <FaceAvatar src={portrait ?? fallbackPortrait} crop={hudCrop} />
        </button>
        {abilitiesCard}
      </div>
    ) : current === 'main' ? (
      <>
        {engine && <EnginePanel engine={engine} />}
        {combatCard}
      </>
    ) : current === 'bag' ? (
      invCard
    ) : current === 'magic' ? (
      spellBook
    ) : current === 'features' ? (
      featuresPage
    ) : (
      <>
        {hudMore && <div className="cw-hud-extras">{hudMore}</div>}
        {storyPage}
      </>
    )

  return (
    <WhyProvider breakdown={sheet.breakdown} bases={sheet.bases} names={sheet.sourceNames}>
    <div className={`cw-step cw-sheet${paged ? ' is-paged' : ''}${hudMode ? ' is-hud' : ''}`}>
      {heading}

      {hudMode ? (
        <div className={`cw-hud${hudLandscape ? ' is-land' : ' is-port'}`}>
          <HudBar sheet={sheet} roller={roller} stage={stage} extras={hudMore} />
          <div className="cw-hud-body">
            {hudLandscape && hudRail}
            <div className="cw-hud-main">
              {resources}
              <div key={current} className="cw-hud-pane" role="tabpanel">
                {hudPane}
              </div>
            </div>
          </div>
          {tabButtons(hudTabs, true)}
        </div>
      ) : paged ? (
        <>
          <HeroStage
            sheet={sheet}
            portrait={portrait}
            face={face}
            fallbackPortrait={fallbackPortrait}
            onPortraitClick={onPortraitClick}
            roller={roller}
            stage={stage}
          />
          {resources}
          {tabButtons(deskTabs)}
          <div key={current} className={`cw-page cw-page--${current}`} role="tabpanel">
            {current === 'main' && (
              <>
                {engine && <EnginePanel engine={engine} />}
                {abilitiesCard}
                {combatCard}
                {invCard}
              </>
            )}
            {current === 'magic' && spellBook}
            {current === 'features' && featuresPage}
            {current === 'story' && storyPage}
          </div>
        </>
      ) : (
        <>
          {flatHero}
          <div className="cw-sheet-grid">
            {combatCard}
            {abilitiesCard}
            {invCard}
            {spellBook && (
              <Card title="Магия" icon={Sparkles} className="cw-sheet-card--magic">
                {spellBook}
              </Card>
            )}
            {featuresCard}
            {profsCard}
            {personaCard}
          </div>
        </>
      )}

      <RollLog rolls={rolls} onClear={clearRolls} />
      {theater[0] && <RollTheater key={theater[0].id} spec={theater[0]} onDone={() => setTheater((q) => q.slice(1))} />}
      {openFeature && (
        <SheetModal
          title={openFeature.title}
          kicker={openFeature.sub}
          tone={openFeature.source}
          visual={<BookOpen className="cw-smodal-glyph" aria-hidden="true" />}
          onClose={() => setOpenFeature(null)}
          actions={
            <>
              {onToggleAbility && openFeature.grantId && (
                <label className={`cw-ftoggle${openFeature.disabled ? '' : ' is-on'}`} title="Отключённое умение остаётся в списке, но его бонусы и действия не работают">
                  <input
                    type="checkbox"
                    checked={!openFeature.disabled}
                    onChange={(e) => onToggleAbility(openFeature.grantId!, e.target.checked)}
                  />
                  <span className="cw-ftoggle-track" aria-hidden="true">
                    <span className="cw-ftoggle-knob">{openFeature.disabled ? <EyeOff /> : <Eye />}</span>
                  </span>
                  <span>{openFeature.disabled ? 'Умение отключено' : 'Умение действует'}</span>
                </label>
              )}
              <button type="button" className="cs-btn cw-next" onClick={() => setOpenFeature(null)}>
                Закрыть
              </button>
            </>
          }
        >
          {openFeature.status && openFeature.status !== 'full' && !openFeature.disabled && (
            <p className={`cw-field-note cw-fstatus is-${openFeature.status}`}>{STATUS_LABEL[openFeature.status] ?? openFeature.status}</p>
          )}
          {openFeature.disabled ? (
            <p className="cw-field-note cw-fstatus is-off">Отключено: бонусы и действия умения не работают, пока его не включить.</p>
          ) : (
            openFeature.active === false && (
              <p className="cw-field-note cw-fstatus is-off">Сейчас не действует: условие умения не выполнено.</p>
            )
          )}
          {engine && !openFeature.disabled && resourcesOf(openFeature.slug).length > 0 && (
            <div className="cw-fcard-res">
              <ResourceBand resources={resourcesOf(openFeature.slug)} activeKeys={activeKeys} />
            </div>
          )}
          {engine && !openFeature.disabled && openFeature.grantId && actionsOf(openFeature.grantId).length > 0 && (
            <div className="eng-actions cw-fcard-acts">
              {actionsOf(openFeature.grantId).map((a) => (
                <ActionButton
                  key={a.key}
                  a={a}
                  // поп-ап действия откроется поверх — карточку закрываем
                  engine={{ ...engine, onAction: (x) => (setOpenFeature(null), engine.onAction(x)) }}
                  showAbility={false}
                />
              ))}
            </div>
          )}
          <FeatureText row={openFeature} />
        </SheetModal>
      )}
    </div>
    </WhyProvider>
  )
}
