/**
 * Последний шаг — итог. Лист собирается тем же buildCharacter, что и при
 * создании, поэтому здесь ровно то, что уйдёт на сервер.
 *
 * Раскладка по частоте использования за столом: шапка с главными числами →
 * бой (экономия хода, действия класса, атаки с бросками попадания и урона) →
 * характеристики и спасброски → навыки → инвентарь сеткой → магия, умения,
 * владения и характер. Всё, что бросается, бросается кликом — общими 3D-костями.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  Backpack,
  BookOpen,
  ChevronDown,
  Circle,
  Crosshair,
  Dices,
  Eye,
  Footprints,
  Hand,
  Heart,
  Languages,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  Triangle,
  UserRound,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cleanDescription, realImage } from '../../api'
import type { Feat } from '../../api'
import { CoinImg } from '../../coins'
import { useCreatureDice } from '../../creatureSheet'
import { categoryIcon, formatDice } from '../../equipment'
import { useEquipmentIndex } from '../../equipmentIndex'
import { useEquipmentDrawer } from '../../equipmentDrawer'
import { useCatalogList } from '../useCatalog'
import { Corners } from '../../ornaments'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'
import type { AbilityName, AttackEntry, InventoryItemInstance } from '../../types/character'
import type { FeatureEntry } from '../../classArticle'
import { abilityMod } from '../dnd5e'
import { buildCharacter } from '../deriveCharacter'
import type { StepProps } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import { ChoicePortrait, StepHeader } from './ui'
import { alignmentAbbr } from './AlignmentChart'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/* ---------- бросок и всплывающий результат ---------- */

interface RollShown {
  id: number
  label: string
  /** выпавшие кости и бонус; total — итог */
  dice: number[]
  sides: number
  bonus: number
  total: number
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

/* ---------- действия: экономия хода и классовые умения ---------- */

type ActionKind = 'action' | 'bonus' | 'reaction' | 'free'

const ACTION_KIND: Record<ActionKind, { label: string; icon: LucideIcon }> = {
  action: { label: 'действие', icon: Circle },
  bonus: { label: 'бонусное действие', icon: Triangle },
  reaction: { label: 'реакция', icon: RotateCcw },
  free: { label: 'без затрат действия', icon: Zap },
}

/** Ключевые игровые действия классов (PHB) — с какого уровня и чем тратятся */
const CLASS_ACTIONS: Record<string, { name: string; level: number; kind: ActionKind }[]> = {
  Варвар: [
    { name: 'Ярость', level: 1, kind: 'bonus' },
    { name: 'Безрассудная атака', level: 2, kind: 'free' },
  ],
  Воин: [
    { name: 'Второе дыхание', level: 1, kind: 'bonus' },
    { name: 'Всплеск действий', level: 2, kind: 'free' },
  ],
  Плут: [
    { name: 'Скрытая атака', level: 1, kind: 'free' },
    { name: 'Хитрое действие', level: 2, kind: 'bonus' },
    { name: 'Невероятное уклонение', level: 5, kind: 'reaction' },
  ],
  Монах: [
    { name: 'Удар боевых искусств', level: 1, kind: 'bonus' },
    { name: 'Шквал ударов', level: 2, kind: 'bonus' },
    { name: 'Отражение снарядов', level: 3, kind: 'reaction' },
  ],
  Паладин: [
    { name: 'Божественное чувство', level: 1, kind: 'action' },
    { name: 'Наложение рук', level: 1, kind: 'action' },
    { name: 'Божественная кара', level: 2, kind: 'free' },
  ],
  Жрец: [{ name: 'Божественный канал', level: 2, kind: 'action' }],
  Друид: [{ name: 'Дикий облик', level: 2, kind: 'action' }],
  Бард: [{ name: 'Вдохновение барда', level: 1, kind: 'bonus' }],
  Чародей: [{ name: 'Метамагия', level: 3, kind: 'free' }],
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

function InventoryCell({ item, onOpen }: { item: InventoryItemInstance; onOpen: (id: string) => void }) {
  const [broken, setBroken] = useState(false)
  const eq = item.equipment
  const src = realImage(eq?.equipment_image_gallery)
  const Icon = categoryIcon(eq?.category)
  const name = eq?.equipment_name ?? 'Предмет'
  return (
    <button
      type="button"
      className={`cw-inv-cell${item.equipped ? ' is-equipped' : ''}`}
      title={`${name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}${item.equipped ? ' · надето' : ''}`}
      onClick={() => eq?.id && onOpen(eq.id)}
      disabled={!eq?.id}
    >
      {src && !broken ? (
        <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon aria-hidden="true" />
      )}
      {item.quantity > 1 && <i className="cw-inv-qty">{item.quantity}</i>}
      {item.equipped && <Shield className="cw-inv-worn" aria-label="надето" />}
    </button>
  )
}

interface HintData {
  title: string
  sub: string
  text: string
  rect: DOMRect
}

/** Окно с описанием умения рядом с пунктом списка (справа, если есть место) */
function FeatureHint({ hint, onEnter, onLeave }: { hint: HintData; onEnter: () => void; onLeave: () => void }) {
  const width = Math.min(380, window.innerWidth - 24)
  const right = hint.rect.right + 10 + width < window.innerWidth
  const left = right ? hint.rect.right + 10 : Math.max(12, hint.rect.left - 10 - width)
  const top = Math.min(Math.max(12, hint.rect.top - 8), window.innerHeight - 260)
  return createPortal(
    <div
      className="cw-hint-pop"
      style={{ left, top, width }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      role="tooltip"
    >
      <b className="gold-text">{hint.title}</b>
      <i>{hint.sub}</i>
      <p>{hint.text || 'Описания нет — допишите его в листе персонажа.'}</p>
    </div>,
    document.body,
  )
}

type SheetAttack = Pick<AttackEntry, 'name' | 'type' | 'attack_bonus' | 'damage' | 'damage_type' | 'range' | 'properties'> & {
  key: string
  versatile: string | null
}

/* ---------- шаг ---------- */

export default function ReviewStep({
  draft,
  bundle,
  subclassFeatures,
}: StepProps & { bundle: ClassBundle | null; subclassFeatures: FeatureEntry[] }) {
  const equipmentIndex = useEquipmentIndex()
  const sheet = useMemo(
    () =>
      buildCharacter({
        draft,
        classFeatures: bundle?.features ?? [],
        subclassFeatures,
        equipmentIndex,
      }),
    [draft, bundle, subclassFeatures, equipmentIndex],
  )

  const dice = useCreatureDice()
  // история бросков: свежий — первым, держим последние 30
  const [rolls, setRolls] = useState<RollShown[]>([])
  const clearRolls = useCallback(() => setRolls([]), [])
  // атака, для которой выпала натуральная 20: её следующий урон — критический
  const [critFor, setCritFor] = useState<string | null>(null)

  // описание умения при наведении: прячем с задержкой, чтобы мышь успела зайти в окно
  const [hint, setHint] = useState<HintData | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepHint = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])
  const hideHint = useCallback(() => {
    keepHint()
    hideTimer.current = setTimeout(() => setHint(null), 160)
  }, [keepHint])
  const showHint = (el: HTMLElement, data: Omit<HintData, 'rect'>) => {
    keepHint()
    setHint({ ...data, rect: el.getBoundingClientRect() })
  }
  useEffect(() => keepHint, [keepHint])
  const { items: featCatalog } = useCatalogList<Feat>('feats', sheet.feats.length > 0)
  const drawer = useEquipmentDrawer()

  const show = (r: Omit<RollShown, 'id'>) =>
    setRolls((prev) => [{ ...r, id: (prev[0]?.id ?? 0) + 1 }, ...prev].slice(0, 30))

  const rollD20 = async (label: string, bonus: number, attackKey?: string) => {
    const values = await dice.roll(1, 20)
    if (!values) return
    const die = values[0]
    show({ label, dice: [die], sides: 20, bonus, total: die + bonus, crit: die === 20, fumble: die === 1 })
    if (attackKey) setCritFor(die === 20 ? attackKey : null)
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
    show({
      label: crit ? `${label} · крит!` : label,
      dice: values,
      sides: parsed.sides,
      bonus: parsed.bonus,
      total,
      crit,
    })
    setCritFor(null)
  }

  /* ---------- производные ---------- */

  const info = sheet.basic_info
  const cls = info.classes[0]
  const level = info.total_level
  const pb = sheet.proficiency_bonus
  const score = (k: AbilityName) => sheet.ability_scores[k].score
  const mod = (k: AbilityName) => abilityMod(score(k))
  const strMod = mod('strength')
  const abbr = alignmentAbbr(info.alignment ?? '')
  const ownPortrait = draft.avatarUrl.trim()
  const perAction = attacksPerAction(cls.name, level)
  const classActions = (CLASS_ACTIONS[cls.name] ?? []).filter((a) => a.level <= level)

  // оружие — по экземплярам инвентаря: оттуда берём универсальный хват
  const itemById = new Map(sheet.inventory.items.map((it) => [it.instance_id, it]))
  const attacks: SheetAttack[] = sheet.attacks.map((a, i) => {
    const w = a.inventory_instance_id ? itemById.get(a.inventory_instance_id)?.equipment?.weapon : null
    const modPart = /[+\-−]\d+$/.exec(a.damage)?.[0] ?? ''
    return {
      ...a,
      key: a.inventory_instance_id ?? `atk-${i}`,
      versatile: w?.versatile_dice ? `${w.versatile_dice}${modPart}` : null,
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
  })

  const spell = sheet.spellcasting
  const slots = Object.entries(spell.spell_slots).sort((a, b) => Number(a[0]) - Number(b[0]))
  const items = sheet.inventory.items
  const invCells = Math.max(21, Math.ceil(items.length / 7) * 7)
  const purse = (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((c) => sheet.inventory.currency[c] > 0)

  // навыки с владением — первыми: ими пользуются чаще
  const skillRows = DEFAULT_SKILLS.map((s) => {
    const prof = !!sheet.skills[s.key]?.proficient
    return { ...s, prof, bonus: mod(s.ability) + (prof ? pb : 0) }
  }).sort((a, b) => Number(b.prof) - Number(a.prof) || a.label.localeCompare(b.label, 'ru'))

  const persona = (
    [
      ['Черты', sheet.personality.traits],
      ['Идеалы', sheet.personality.ideals],
      ['Привязанности', sheet.personality.bonds],
      ['Слабости', sheet.personality.flaws],
      ['История', sheet.backstory],
    ] as const
  ).filter(([, text]) => text.trim())

  return (
    <div className="cw-step cw-sheet">
      <StepHeader title="Герой готов" />

      {/* ---------- шапка: кто это и главные числа ---------- */}
      <header className="cw-sheet-hero">
        <span className="cw-sheet-portrait">
          {ownPortrait ? (
            <img src={ownPortrait} alt="" />
          ) : (
            <ChoicePortrait src={realImage(draft.race?.image_gallery)} icon={UserRound} />
          )}
          {abbr && <span className="cw-hero-align">{abbr}</span>}
        </span>
        <div className="cw-sheet-id">
          <h2 className="cw-sheet-name gold-text">{info.name}</h2>
          <p className="cw-sheet-who">
            {[info.subrace?.name ?? info.race.name, `${cls.name} ${level} ур.`, cls.subclass_name]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {(info.background || info.alignment) && (
            <p className="cw-sheet-sub">
              {[info.background?.name && `предыстория: ${info.background.name}`, info.alignment]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="cw-sheet-stats">
            <span className="cw-stat cw-stat--ac" title="Класс доспеха">
              <Shield aria-hidden="true" />
              <b>{sheet.combat.armor_class}</b>
              <i>КД</i>
            </span>
            <span className="cw-stat cw-stat--hp" title="Максимум хитов">
              <Heart aria-hidden="true" />
              <b>{sheet.combat.hit_points.max}</b>
              <i>хиты</i>
            </span>
            <button
              type="button"
              className="cw-stat cw-stat--roll"
              onClick={() => void rollD20('Инициатива', sheet.combat.initiative)}
              disabled={dice.rolling}
              title="Бросить инициативу"
            >
              <Zap aria-hidden="true" />
              <b>{signed(sheet.combat.initiative)}</b>
              <i>инициатива</i>
            </button>
            <span className="cw-stat">
              <Footprints aria-hidden="true" />
              <b>{sheet.combat.speed}</b>
              <i>фт. скорость</i>
            </span>
            <span className="cw-stat">
              <Award aria-hidden="true" />
              <b>+{pb}</b>
              <i>мастерство</i>
            </span>
            <span className="cw-stat">
              <Eye aria-hidden="true" />
              <b>{sheet.combat.passive_perception}</b>
              <i>пасс. внимат.</i>
            </span>
            <span className="cw-stat">
              <Dices aria-hidden="true" />
              <b>{formatDice(sheet.combat.hit_dice.total)}</b>
              <i>кости хитов</i>
            </span>
          </div>
        </div>
      </header>

      <div className="cw-sheet-grid">
        {/* ---------- бой ---------- */}
        <Card
          title="Бой"
          icon={Swords}
          className="cw-sheet-card--combat"
          aside={perAction > 1 ? `атак за действие: ×${perAction}` : null}
        >
          <div className="cw-economy" aria-label="Экономия хода">
            {(['action', 'bonus', 'reaction'] as const).map((k) => {
              const { label, icon: Icon } = ACTION_KIND[k]
              return (
                <span key={k} className={`cw-eco cw-eco--${k}`} title={label}>
                  <Icon aria-hidden="true" /> {label}
                </span>
              )
            })}
            <span className="cw-eco cw-eco--move" title="Перемещение за ход">
              <Footprints aria-hidden="true" /> {sheet.combat.speed} фт.
            </span>
            {perAction > 1 && (
              <span className="cw-eco cw-eco--extra" title="Дополнительная атака">
                {Array.from({ length: perAction }, (_, i) => (
                  <Swords key={i} aria-hidden="true" />
                ))}
                за действие
              </span>
            )}
          </div>

          {classActions.length > 0 && (
            <div className="cw-class-actions">
              {classActions.map((a) => {
                const { label, icon: Icon } = ACTION_KIND[a.kind]
                return (
                  <span key={a.name} className={`cw-cact cw-eco--${a.kind}`} title={label}>
                    <Icon aria-hidden="true" /> {a.name}
                  </span>
                )
              })}
            </div>
          )}

          <div className="cw-attacks">
            {attacks.map((a) => {
              const Icon = a.type === 'ranged' ? Crosshair : a.key === 'unarmed' ? Hand : Swords
              const crit = critFor === a.key
              return (
                <div key={a.key} className={`cw-atk${crit ? ' is-crit' : ''}`}>
                  <span className="cw-atk-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="cw-atk-name">
                    <b>{a.name}</b>
                    <i>{[a.range, ...a.properties].filter(Boolean).join(' · ')}</i>
                  </span>
                  <span className="cw-atk-btns">
                    <button
                      type="button"
                      className="cw-atk-btn cw-atk-btn--hit"
                      onClick={() => void rollD20(`${a.name}, попадание`, a.attack_bonus, a.key)}
                      disabled={dice.rolling}
                      title="Бросок атаки: к20 + бонус"
                    >
                      <Dices aria-hidden="true" />
                      <b>{signed(a.attack_bonus)}</b>
                      <i>попадание</i>
                    </button>
                    <button
                      type="button"
                      className="cw-atk-btn cw-atk-btn--dmg"
                      onClick={() => void rollDamage(`${a.name}, урон`, a.damage, a.key)}
                      disabled={dice.rolling}
                      title={crit ? 'Критическое попадание: кости урона удваиваются' : 'Бросок урона'}
                    >
                      <b>{formatDice(a.damage) ?? a.damage}</b>
                      <i>{crit ? 'крит ×2' : (a.damage_type || 'урон').toLocaleLowerCase('ru')}</i>
                    </button>
                    {a.versatile && (
                      <button
                        type="button"
                        className="cw-atk-btn cw-atk-btn--dmg"
                        onClick={() => void rollDamage(`${a.name}, двуручно`, a.versatile!, a.key)}
                        disabled={dice.rolling}
                        title="Универсальное оружие двумя руками"
                      >
                        <b>{formatDice(a.versatile)}</b>
                        <i>двуручно</i>
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
            {spell.is_spellcaster && spell.spell_attack_bonus != null && (
              <div className="cw-atk cw-atk--spell">
                <span className="cw-atk-icon">
                  <Sparkles aria-hidden="true" />
                </span>
                <span className="cw-atk-name">
                  <b>Атака заклинанием</b>
                  <i>Сл спасброска {spell.spell_save_dc}</i>
                </span>
                <span className="cw-atk-btns">
                  <button
                    type="button"
                    className="cw-atk-btn cw-atk-btn--hit"
                    onClick={() => void rollD20('Атака заклинанием', spell.spell_attack_bonus!)}
                    disabled={dice.rolling}
                  >
                    <Dices aria-hidden="true" />
                    <b>{signed(spell.spell_attack_bonus)}</b>
                    <i>попадание</i>
                  </button>
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* ---------- характеристики и спасброски ---------- */}
        <Card title="Характеристики" icon={ShieldCheck} className="cw-sheet-card--abilities">
          <div className="cw-abil-grid">
            {ABILITY_KEYS.map((k) => {
              const label = ABILITY_LABELS[k]
              const saveProf = sheet.ability_scores[k].saving_throw_proficient
              const save = mod(k) + (saveProf ? pb : 0)
              return (
                <div key={k} className={`cw-abil${saveProf ? ' is-prof' : ''}`}>
                  <button
                    type="button"
                    className="cw-abil-check"
                    onClick={() => void rollD20(`${label.label}, проверка`, mod(k))}
                    disabled={dice.rolling}
                    title={`Проверка: к20 ${signed(mod(k))}`}
                  >
                    <i>{label.abbr}</i>
                    <b>{score(k)}</b>
                    <em>{signed(mod(k))}</em>
                  </button>
                  <button
                    type="button"
                    className="cw-abil-save"
                    onClick={() => void rollD20(`${label.label}, спасбросок`, save)}
                    disabled={dice.rolling}
                    title={saveProf ? 'Спасбросок — владение' : 'Спасбросок'}
                  >
                    спас <b>{signed(save)}</b>
                  </button>
                </div>
              )
            })}
          </div>
        </Card>

        {/* ---------- навыки ---------- */}
        <Card title="Навыки" icon={Sparkles} className="cw-sheet-card--skills">
          <div className="beast-skills cw-skill-buttons">
            {skillRows.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`beast-skill${s.prof ? ' is-prof' : ''}`}
                onClick={() => void rollD20(s.label, s.bonus)}
                disabled={dice.rolling}
              >
                <span className="beast-skill-bonus">{signed(s.bonus)}</span>
                <span className="beast-skill-name">{s.label}</span>
                <span className="beast-skill-ab">{ABILITY_LABELS[s.ability].abbr}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* ---------- инвентарь ---------- */}
        <Card
          title="Инвентарь"
          icon={Backpack}
          className="cw-sheet-card--inv"
          aside={items.length ? `${items.length} предм.` : null}
        >
          <div className="cw-inv-grid">
            {Array.from({ length: invCells }, (_, i) =>
              items[i] ? (
                <InventoryCell key={items[i].instance_id} item={items[i]} onOpen={drawer.open} />
              ) : (
                <span key={`empty-${i}`} className="cw-inv-cell is-empty" />
              ),
            )}
          </div>
          {purse.length > 0 && (
            <div className="cw-purse">
              {purse.map((c) => (
                <span key={c}>
                  <CoinImg currency={c} size={20} />
                  <b>{sheet.inventory.currency[c]}</b>
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* ---------- магия ---------- */}
        {spell.is_spellcaster && (
          <Card
            title="Магия"
            icon={Sparkles}
            className="cw-sheet-card--magic"
            aside={spell.spellcasting_ability ? ABILITY_LABELS[spell.spellcasting_ability].abbr : null}
          >
            <div className="cw-magic-stats">
              <span>
                <b>{spell.spell_save_dc}</b>
                <i>Сл спасброска</i>
              </span>
              <span>
                <b>{signed(spell.spell_attack_bonus ?? 0)}</b>
                <i>атака</i>
              </span>
              {spell.prepared_spells_max != null && (
                <span>
                  <b>{spell.prepared_spells_max}</b>
                  <i>готовить</i>
                </span>
              )}
            </div>
            {slots.length > 0 && (
              <div className="cw-slots">
                {slots.map(([circle, slot]) => (
                  <span key={circle} className="cw-slot" title={`${circle} круг: ${slot.max} ячеек`}>
                    <i>{circle}</i>
                    {Array.from({ length: slot.max }, (_, j) => (
                      <span key={j} className="cw-slot-gem" />
                    ))}
                  </span>
                ))}
              </div>
            )}
            {spell.spells_known.length > 0 && (
              <div className="cw-spell-list">
                {[...spell.spells_known]
                  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ru'))
                  .map((s) => (
                    <span key={`${s.level}-${s.name}`} className="cw-spell-chip">
                      <i>{s.level === 0 ? '◈' : s.level}</i> {s.name}
                    </span>
                  ))}
              </div>
            )}
          </Card>
        )}

        {/* ---------- умения и черты ---------- */}
        <Card
          title="Умения"
          icon={BookOpen}
          className="cw-sheet-card--features"
          aside={String(sheet.features.length + sheet.feats.length)}
        >
          <ul className="cw-feat-list">
            {sheet.features.map((f, i) => {
              const data = {
                title: f.name,
                sub: [SOURCE_LABEL[f.source] ?? '', f.feature_source, f.level ? `${f.level} ур.` : '']
                  .filter(Boolean)
                  .join(' · '),
                text: f.description,
              }
              return (
                <li key={`${f.name}-${i}`} className={`cw-feat-line cw-feat-line--${f.source}`}>
                  <button
                    type="button"
                    onMouseEnter={(e) => showHint(e.currentTarget, data)}
                    onMouseLeave={hideHint}
                    onFocus={(e) => showHint(e.currentTarget, data)}
                    onBlur={hideHint}
                    onClick={(e) => (hint?.title === f.name ? setHint(null) : showHint(e.currentTarget, data))}
                  >
                    <b>{f.name}</b>
                    <i>{f.level ? `${f.level} ур.` : ''}</i>
                  </button>
                </li>
              )
            })}
            {sheet.feats.map((featId) => {
              const feat = featCatalog.find((x) => x.id === featId)
              const name = feat?.feat_name ?? 'Черта'
              const data = {
                title: name,
                sub: ['черта', feat?.prerequisite ? `требование: ${feat.prerequisite}` : ''].filter(Boolean).join(' · '),
                text: cleanDescription(feat?.description),
              }
              return (
                <li key={featId} className="cw-feat-line cw-feat-line--feat">
                  <button
                    type="button"
                    onMouseEnter={(e) => showHint(e.currentTarget, data)}
                    onMouseLeave={hideHint}
                    onFocus={(e) => showHint(e.currentTarget, data)}
                    onBlur={hideHint}
                    onClick={(e) => (hint?.title === name ? setHint(null) : showHint(e.currentTarget, data))}
                  >
                    <b>{name}</b>
                    <i>черта</i>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* ---------- владения и языки ---------- */}
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

        {/* ---------- характер ---------- */}
        {persona.length > 0 && (
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
        )}
      </div>

      <RollLog rolls={rolls} onClear={clearRolls} />
      {hint && <FeatureHint hint={hint} onEnter={keepHint} onLeave={hideHint} />}
    </div>
  )
}
