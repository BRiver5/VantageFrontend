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
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  Backpack,
  BookOpen,
  Camera,
  ChevronDown,
  Crosshair,
  Dices,
  Eye,
  Footprints,
  Hand,
  Heart,
  Languages,
  NotebookPen,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
  Zap,
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
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../types/character'
import type { AbilityName, AttackEntry, InventoryItemInstance, LogEntry, SheetView } from '../types/character'
import { abilityMod } from '../create/dnd5e'
import { ChoicePortrait } from '../create/steps/ui'
import { alignmentAbbr } from '../create/steps/AlignmentChart'
import { HeroStage } from './HeroStage'
import { InventoryBoard } from './InventoryBoard'
import { SheetModal } from './SheetModal'
import { SpellBook } from './SpellBook'
import type { FaceCrop } from './portrait'
import type { SheetPatch, SheetPlay, SheetRoller } from './sheetPlay'
import { EnginePanel, type EngineView } from './EnginePanel'
import { abilityPath, whyText } from './sheetView'
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
  other: 'умение',
}

/** Порядок групп на странице умений */
const SOURCE_GROUPS: { title: string; sources: string[] }[] = [
  { title: 'Класс', sources: ['class'] },
  { title: 'Подкласс', sources: ['subclass'] },
  { title: 'Раса', sources: ['race', 'subrace'] },
  { title: 'Предыстория', sources: ['background'] },
  { title: 'Черты', sources: ['feat'] },
  { title: 'Прочее', sources: ['other'] },
]

/* ---------- мелкие кирпичи ---------- */

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
  /** умение движка: можно включить или отключить */
  grantId?: string
  status?: string
  active?: boolean
}

/** Страницы листа: самое нужное за столом — на первой */
export type SheetTab = 'main' | 'magic' | 'features' | 'story'

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
}

const STATUS_LABEL: Record<string, string> = {
  text_only: 'только текст — механика не автоматизирована',
  partial: 'автоматизировано частично',
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
}: CharacterSheetProps) {
  const [ownTab, setOwnTab] = useState<SheetTab>('main')
  const tab = tabProp ?? ownTab
  const setTab = (t: SheetTab) => (onTab ? onTab(t) : setOwnTab(t))
  const live = !!onPatch
  const dice = useCreatureDice()
  // история бросков: свежий — первым, держим последние 30
  const [rolls, setRolls] = useState<RollShown[]>([])
  const clearRolls = useCallback(() => setRolls([]), [])
  // атака, для которой выпала натуральная 20: её следующий урон — критический
  const [critFor, setCritFor] = useState<string | null>(null)
  const [openFeature, setOpenFeature] = useState<FeatureRow | null>(null)
  const { items: featCatalog } = useCatalogList<Feat>('feats', sheet.feats.length > 0)

  const info = sheet.basic_info

  /* ---------- броски ---------- */

  const show = (r: Omit<RollShown, 'id'>) =>
    setRolls((prev) => [{ ...r, id: (prev[0]?.id ?? 0) + 1 }, ...prev].slice(0, 30))
  const note = (total: string, label: string) => show({ label, dice: [], sides: 0, bonus: 0, total })

  const rollD20 = async (label: string, bonus: number, attackKey?: string) => {
    const values = await dice.roll(1, 20)
    if (!values) return null
    const die = values[0]
    show({ label, dice: [die], sides: 20, bonus, total: die + bonus, crit: die === 20, fumble: die === 1 })
    if (attackKey) setCritFor(die === 20 ? attackKey : null)
    return die
  }

  const rollDamage = async (label: string, formula: string, attackKey: string) => {
    const parsed = parseDamage(formula)
    if (!parsed) return
    const crit = critFor === attackKey
    if (parsed.n === 0) {
      show({ label, dice: [], sides: 0, bonus: parsed.bonus, total: Math.max(1, parsed.bonus) })
      return
    }
    const n = crit ? parsed.n * 2 : parsed.n
    const values = await dice.roll(n, parsed.sides)
    if (!values) return
    const total = Math.max(1, values.reduce((a, b) => a + b, 0) + parsed.bonus)
    show({ label: crit ? `${label} · крит!` : label, dice: values, sides: parsed.sides, bonus: parsed.bonus, total, crit })
    setCritFor(null)
  }

  const rollDice = async (label: string, n: number, sides: number, bonus: number) => {
    const values = await dice.roll(n, sides)
    if (!values) return null
    show({ label, dice: values, sides, bonus, total: values.reduce((a, b) => a + b, 0) + bonus })
    return values
  }

  const roller: SheetRoller = { rolling: dice.rolling, critFor, rollD20, rollDamage, rollDice, note }

  // броски сервера (действия, отдых) — в ту же историю; кубики уже брошены там
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
  }, [serverLog])

  /* ---------- значения листа ---------- */

  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const level = info.total_level
  const pb = sheet.proficiency_bonus
  const score = (k: AbilityName) => sheet.ability_scores[k].score
  // у листа с сервера модификатор и спасбросок готовые; у черновика визарда — по таблице
  const mod = (k: AbilityName) => sheet.ability_scores[k].modifier ?? abilityMod(score(k))
  const why = (path: string) => whyText(sheet.breakdown, path)
  const strMod = mod('strength')
  const perAction = attacksPerAction(cls.name, level)
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
  attacks.push({
    key: 'unarmed',
    name: 'Безоружный удар',
    type: 'melee',
    attack_bonus: strMod + pb,
    damage: String(Math.max(1, 1 + strMod)),
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

  const featureRows: FeatureRow[] = [
    ...sheet.features.map((f, i) => ({
      key: f.grant_id ?? `${f.name}-${i}`,
      source: f.source,
      title: f.name,
      sub: [SOURCE_LABEL[f.source] ?? '', ownerOf(f.source), f.level ? `${f.level} ур.` : ''].filter(Boolean).join(' · '),
      text: f.description,
      grantId: f.grant_id,
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

  /* ---------- карточки ---------- */

  const abilitiesCard = (
    <Card title="Характеристики и навыки" icon={ShieldCheck} className="cw-sheet-card--abilities">
      <div className="cw-abil-grid">
        {ABILITY_KEYS.map((k) => {
          const label = ABILITY_LABELS[k]
          const saveProf = sheet.ability_scores[k].saving_throw_proficient
          const save = sheet.ability_scores[k].save ?? mod(k) + (saveProf ? pb : 0)
          const scoreWhy = why(abilityPath(k, 'score'))
          const saveWhy = why(abilityPath(k, 'save'))
          return (
            <div key={k} className={`cw-abil${saveProf ? ' is-prof' : ''}`}>
              <button
                type="button"
                className={`cw-abil-check${scoreWhy ? ' has-why' : ''}`}
                onClick={() => void rollD20(`${label.label}, проверка`, mod(k))}
                disabled={dice.rolling}
                title={[`Проверка: к20 ${signed(mod(k))}`, scoreWhy].filter(Boolean).join('\n')}
              >
                <i>{label.abbr}</i>
                <b>{score(k)}</b>
                <em>{signed(mod(k))}</em>
              </button>
              <button
                type="button"
                className={`cw-abil-save${saveWhy ? ' has-why' : ''}`}
                onClick={() => void rollD20(`${label.label}, спасбросок`, save)}
                disabled={dice.rolling}
                title={[saveProf ? 'Спасбросок — владение' : 'Спасбросок', saveWhy].filter(Boolean).join('\n')}
              >
                спас <b>{signed(save)}</b>
              </button>
            </div>
          )
        })}
      </div>
      <div className="beast-skills cw-skill-buttons cw-skill-cols">
        {skillRows.map((s) => {
          const skillWhy = why(`char.skills.${s.key}.bonus`)
          return (
          <button
            key={s.key}
            type="button"
            className={`beast-skill${s.prof ? ' is-prof' : ''}${s.expert ? ' is-expert' : ''}${skillWhy ? ' has-why' : ''}`}
            onClick={() => void rollD20(s.label, s.bonus)}
            disabled={dice.rolling}
            title={[s.expert ? 'Компетентность: двойной бонус мастерства' : '', skillWhy].filter(Boolean).join('\n') || undefined}
          >
            <span className="beast-skill-bonus">{signed(s.bonus)}</span>
            <span className="beast-skill-name">{s.label}</span>
            <span className="beast-skill-ab">{ABILITY_LABELS[s.ability].abbr}</span>
          </button>
          )
        })}
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
      aside={perAction > 1 ? `атак за действие: ×${perAction}` : null}
    >
      <div className="cw-wpns">
        {attacks.map((a) => {
          const crit = critFor === a.key
          const dmg = parseDamage(a.damage)
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
                  value={signed(a.attack_bonus)}
                  label="атака"
                  onClick={() => void rollD20(`${a.name}, попадание`, a.attack_bonus, a.key)}
                  disabled={dice.rolling}
                  title="Бросок атаки: к20 + бонус"
                />
                {a.damage && (
                  <DieButton
                    sides={dmg?.sides ?? 0}
                    value={formatDice(a.damage) ?? a.damage}
                    label={crit ? 'крит ×2' : (a.damage_type || 'урон').toLocaleLowerCase('ru')}
                    hot={crit}
                    onClick={() => void rollDamage(`${a.name}, урон`, a.damage, a.key)}
                    disabled={dice.rolling}
                    title={crit ? 'Критическое попадание: кости урона удваиваются' : 'Бросок урона'}
                  />
                )}
                {a.versatile && (
                  <DieButton
                    sides={parseDamage(a.versatile)?.sides ?? 0}
                    value={formatDice(a.versatile)}
                    label="двуручно"
                    hot={crit}
                    onClick={() => void rollDamage(`${a.name}, двуручно`, a.versatile!, a.key)}
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
                onClick={() => void rollD20('Атака заклинанием', spell.spell_attack_bonus!)}
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
      className={`cw-ftile cw-feat-line--${f.source}${f.active === false ? ' is-off' : ''}${f.status ? ` is-${f.status}` : ''}`}
      onClick={() => setOpenFeature(f)}
      title={f.status ? STATUS_LABEL[f.status] : undefined}
    >
      <b>{f.title}</b>
      <i>
        {f.sub}
        {f.active === false && ' · неактивно'}
      </i>
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
      {profsCard}
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
            onClick={() => void rollD20('Инициатива', combat.initiative)}
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

  const tabs: { id: SheetTab; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: 'main', label: 'Лист', icon: Swords },
    ...(hasMagic ? [{ id: 'magic' as const, label: 'Магия', icon: Sparkles, badge: spell.spells_known.length }] : []),
    { id: 'features', label: 'Умения', icon: BookOpen, badge: featureRows.length },
    { id: 'story', label: 'Характер', icon: UserRound },
  ]
  const current = tabs.some((t) => t.id === tab) ? tab : 'main'

  return (
    <div className={`cw-step cw-sheet${paged ? ' is-paged' : ''}`}>
      {heading}

      {paged ? (
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
          <nav className="cw-tabs" role="tablist" aria-label="Страницы листа">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={current === id}
                className={`cw-tab${current === id ? ' is-on' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon aria-hidden="true" /> {label}
                {badge ? <em>{badge}</em> : null}
              </button>
            ))}
          </nav>
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
                <button
                  type="button"
                  className="cs-btn cs-btn--ghost"
                  onClick={() => {
                    onToggleAbility(openFeature.grantId!, openFeature.active === false)
                    setOpenFeature(null)
                  }}
                >
                  {openFeature.active === false ? 'Включить' : 'Отключить'}
                </button>
              )}
              <button type="button" className="cs-btn cw-next" onClick={() => setOpenFeature(null)}>
                Закрыть
              </button>
            </>
          }
        >
          {openFeature.status && (
            <p className={`cw-field-note cw-fstatus is-${openFeature.status}`}>{STATUS_LABEL[openFeature.status] ?? openFeature.status}</p>
          )}
          {openFeature.text ? <RichText text={openFeature.text} /> : <p className="cw-field-note">Описания нет.</p>}
        </SheetModal>
      )}
    </div>
  )
}
