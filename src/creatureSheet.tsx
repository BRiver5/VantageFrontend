import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Anchor,
  ArrowDown,
  ArrowDownToLine,
  Axe,
  BatteryLow,
  Biohazard,
  Brain,
  CircleSlash,
  Dices,
  Droplets,
  EarOff,
  Eye,
  EyeOff,
  Feather,
  Fingerprint,
  Flame,
  FlaskConical,
  Footprints,
  Ghost,
  Hammer,
  Hand,
  Heart,
  Hexagon,
  Languages,
  Link2,
  Minus,
  Moon,
  Mountain,
  Orbit,
  Plus,
  Radar,
  Ruler,
  ShieldCheck,
  ShieldHalf,
  HeartCrack,
  Skull,
  Snowflake,
  Sparkles,
  Sun,
  Sword,
  TreePine,
  Volume2,
  Waves,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Creature } from './api'
import { Corners } from './ornaments'
import { abilitiesFromSkills } from './skills'
import { ABILITY_LABELS } from './types/character'
import { useDice } from './dice/diceControl'
import knightUrl from './assets/sillhouette.png'

/* ---------- Кубики ---------- */

const d = (sides: number) => 1 + Math.floor(Math.random() * sides)

/** больше костей сцена не разложит читаемо (у великанов бывает 30к20 хитов) */
const MAX_3D_DICE = 20

/**
 * Бросок общими 3D-костями приложения. Если сцена не поднялась (нет WebGL) —
 * бросаем тихо, чтобы кнопки не превращались в мёртвые.
 */
function useCreatureDice() {
  const { roll: roll3d, rolling } = useDice()
  const roll = useCallback(
    async (n: number, sides: number): Promise<number[] | null> => {
      if (rolling) return null
      if (n <= MAX_3D_DICE) {
        try {
          return await roll3d(`${n}d${sides}`)
        } catch {
          /* тихий бросок ниже */
        }
      }
      return Array.from({ length: n }, () => d(sides))
    },
    [roll3d, rolling],
  )
  return { roll, rolling }
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

const abilityMod = (v: number) => Math.floor((v - 10) / 2)

/** «8 к 8 + 16» → { n: 8, sides: 8, bonus: 16 } */
function parseDice(formula: string | null | undefined) {
  const m = formula?.match(/(\d+)\s*[кkd]\s*(\d+)(?:\s*([+\-−])\s*(\d+))?/i)
  if (!m) return null
  const bonus = m[3] ? (m[3] === '+' ? 1 : -1) * Number(m[4]) : 0
  return { n: Number(m[1]), sides: Number(m[2]), bonus }
}

/* ============================================================
   Характеристики — «роза ветров» шестиугольником
   ============================================================ */

const ABILITIES = [
  { key: 'strenght', save: 'strength', short: 'СИЛ', name: 'Сила' },
  { key: 'dexterity', save: 'dexterity', short: 'ЛОВ', name: 'Ловкость' },
  { key: 'constitution', save: 'constitution', short: 'ТЕЛ', name: 'Телосложение' },
  { key: 'intelligence', save: 'intelligence', short: 'ИНТ', name: 'Интеллект' },
  { key: 'wisdom', save: 'wisdom', short: 'МДР', name: 'Мудрость' },
  { key: 'charisma', save: 'charisma', short: 'ХАР', name: 'Харизма' },
] as const

const VB = 320
const C = VB / 2
const R = 100
const LABEL_R = 138

function polar(i: number, r: number): [number, number] {
  const a = ((-90 + 60 * i) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

const ring = (r: number) => ABILITIES.map((_, i) => polar(i, r).join(',')).join(' ')

type Roll = { id: number; ability: string; kind: 'проверка' | 'спасбросок'; die: number; bonus: number }

function AbilityRose({ c }: { c: Creature }) {
  const scores = ABILITIES.map((a) => (c[a.key] as number | null) ?? 10)
  const saves = c.saving_throws ?? {}
  const max = Math.max(20, ...scores)
  const [selected, setSelected] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [roll, setRoll] = useState<Roll | null>(null)

  const active = hovered ?? selected
  const a = ABILITIES[active]
  const score = scores[active]
  const checkBonus = abilityMod(score)
  const saveBonus = saves[a.save] ?? checkBonus
  const hasSaveProf = saves[a.save] != null

  const data = scores.map((s, i) => polar(i, (R * s) / max).join(',')).join(' ')

  const dice = useCreatureDice()
  const doRoll = async (kind: Roll['kind']) => {
    const ability = a.name
    const bonus = kind === 'проверка' ? checkBonus : saveBonus
    const values = await dice.roll(1, 20)
    if (values) setRoll((prev) => ({ id: (prev?.id ?? 0) + 1, ability, kind, die: values[0], bonus }))
  }

  return (
    <div className="beast-rose">
      <div className="beast-rose-chart" onMouseLeave={() => setHovered(null)}>
        <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true">
          <defs>
            <radialGradient id="rose-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f6e7b6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#c49a3c" stopOpacity="0.16" />
            </radialGradient>
          </defs>
          {[1, 0.75, 0.5, 0.25].map((k) => (
            <polygon key={k} className="beast-rose-ring" points={ring(R * k)} />
          ))}
          {ABILITIES.map((_, i) => {
            const [x, y] = polar(i, R)
            return (
              <line
                key={i}
                className={`beast-rose-axis${i === active ? ' is-active' : ''}`}
                x1={C}
                y1={C}
                x2={x}
                y2={y}
              />
            )
          })}
          <polygon className="beast-rose-data" points={data} />
          {scores.map((s, i) => {
            const [x, y] = polar(i, (R * s) / max)
            return <circle key={i} className={`beast-rose-dot${i === active ? ' is-active' : ''}`} cx={x} cy={y} r={i === active ? 4.5 : 3} />
          })}
        </svg>

        {ABILITIES.map((ab, i) => {
          const [x, y] = polar(i, LABEL_R)
          const prof = saves[ab.save] != null
          return (
            <button
              key={ab.key}
              type="button"
              className={`beast-rose-node${i === active ? ' is-active' : ''}${prof ? ' is-prof' : ''}`}
              style={{ left: `${(x / VB) * 100}%`, top: `${(y / VB) * 100}%` } as CSSProperties}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
              title={`${ab.name}${prof ? ' · владение спасброском' : ''}`}
            >
              <span className="beast-rose-node-inner">
                <b>{scores[i]}</b>
                <i>{ab.short} {signed(abilityMod(scores[i]))}</i>
              </span>
            </button>
          )
        })}
      </div>

      <div className="beast-rose-readout">
        <div className="beast-rose-readout-head">
          <span className="beast-rose-readout-name">{a.name}</span>
          <span className="beast-rose-readout-score">{score}</span>
        </div>
        <div className="beast-rose-actions">
          <button type="button" className="beast-roll-btn" onClick={() => void doRoll('проверка')} disabled={dice.rolling}>
            <Dices aria-hidden="true" /> проверка <b>{signed(checkBonus)}</b>
          </button>
          <button
            type="button"
            className={`beast-roll-btn${hasSaveProf ? ' is-prof' : ''}`}
            onClick={() => void doRoll('спасбросок')}
            disabled={dice.rolling}
          >
            <Dices aria-hidden="true" /> спасбросок <b>{signed(saveBonus)}</b>
          </button>
        </div>
        {roll && (
          <p
            key={roll.id}
            className={`beast-roll-result${roll.die === 20 ? ' is-crit' : roll.die === 1 ? ' is-fumble' : ''}`}
          >
            <span>{roll.ability}, {roll.kind}:</span> к20 <b>{roll.die}</b> {signed(roll.bonus)} ={' '}
            <strong>{roll.die + roll.bonus}</strong>
          </p>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   Оборона — броня, хиты, движение
   ============================================================ */

function ArmorCard({ ac, source }: { ac: number; source: string | null }) {
  const [attack, setAttack] = useState(5)
  const need = Math.max(2, Math.min(20, ac - attack))
  const chance = Math.round(((21 - need) / 20) * 100)
  return (
    <div className="beast-def-card beast-armor">
      <div className="beast-shield">
        <svg viewBox="0 0 100 116" aria-hidden="true">
          <defs>
            <linearGradient id="shield-edge" x1="0" y1="0" x2="100" y2="116" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7c828b" />
              <stop offset="45%" stopColor="#cdd3db" />
              <stop offset="55%" stopColor="#f1f4f8" />
              <stop offset="100%" stopColor="#8b919a" />
            </linearGradient>
            <linearGradient id="shield-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#262a32" />
              <stop offset="100%" stopColor="#0d0e11" />
            </linearGradient>
          </defs>
          <path
            className="beast-shield-body"
            d="M50 4 L92 18 V54 C92 84 72 102 50 112 C28 102 8 84 8 54 V18 Z"
            fill="url(#shield-body)"
            stroke="url(#shield-edge)"
            strokeWidth="2.4"
          />
          <path
            d="M50 13 L83 24 V54 C83 78 67 93 50 102 C33 93 17 78 17 54 V24 Z"
            fill="none"
            stroke="url(#shield-edge)"
            strokeWidth="0.8"
            opacity="0.55"
          />
        </svg>
        <span className="beast-shield-value">
          <b>{ac}</b>
          <i>КД</i>
        </span>
      </div>
      <div className="beast-def-body">
        <span className="beast-def-label">Класс доспеха</span>
        {source && <span className="beast-def-note">{source}</span>}
        <div className="beast-hit-calc">
          <span className="beast-hit-calc-label">ваша атака</span>
          <span className="beast-stepper">
            <button type="button" onClick={() => setAttack((v) => Math.max(-5, v - 1))} aria-label="меньше">
              <Minus aria-hidden="true" />
            </button>
            <b>{signed(attack)}</b>
            <button type="button" onClick={() => setAttack((v) => Math.min(20, v + 1))} aria-label="больше">
              <Plus aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="beast-hit-bar" style={{ '--pct': `${chance}%` } as CSSProperties}>
          <span />
        </div>
        <span className="beast-def-note">
          попадание на <b>{need}+</b> · {chance}%
        </span>
      </div>
    </div>
  )
}

function HitPointsCard({ hp, formula }: { hp: number; formula: string | null }) {
  const dice = parseDice(formula)
  const min = dice ? Math.max(1, dice.n + dice.bonus) : hp
  const top = dice ? dice.n * dice.sides + dice.bonus : hp
  const [rolled, setRolled] = useState<number | null>(null)
  const [rollId, setRollId] = useState(0)
  const value = rolled ?? hp
  const pct = top > min ? 18 + ((value - min) / (top - min)) * 72 : 70

  const roller = useCreatureDice()
  const roll = async () => {
    if (!dice) return
    const values = await roller.roll(dice.n, dice.sides)
    if (!values) return
    setRolled(Math.max(1, values.reduce((s, v) => s + v, dice.bonus)))
    setRollId((n) => n + 1)
  }

  return (
    <div className="beast-def-card beast-hp">
      <div className="beast-vial" style={{ '--fill': `${pct}%` } as CSSProperties}>
        <span className="beast-vial-inner">
          <span className="beast-vial-liquid" />
        </span>
        <span className="beast-vial-value">
          <b key={rollId}>{value}</b>
          <i>хиты</i>
        </span>
      </div>
      <div className="beast-def-body">
        <span className="beast-def-label">Хиты</span>
        {formula && <span className="beast-def-note">{formula.trim()}</span>}
        {dice && (
          <>
            <span className="beast-def-note">
              от {min} до {top} · в среднем {hp}
            </span>
            <button type="button" className="beast-roll-btn" onClick={() => void roll()} disabled={roller.rolling}>
              <Dices aria-hidden="true" /> бросить хиты
            </button>
            {rolled != null && (
              <button type="button" className="beast-def-reset" onClick={() => setRolled(null)}>
                сбросить к среднему
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MovementCard({ c }: { c: Creature }) {
  const rows: [LucideIcon, string, number | null][] = [
    [Footprints, 'ходьба', c.speed],
    [Feather, 'полёт', c.flight_speed],
    [Waves, 'плавание', c.swim_speed],
    [Mountain, 'лазание', c.climb_speed],
    [ArrowDown, 'копание', c.burrow_speed],
  ]
  const list = rows.filter(([, , v]) => v)
  if (!list.length) return null
  const fastest = Math.max(...list.map(([, , v]) => v as number))
  return (
    <div className="beast-def-card beast-move">
      <span className="beast-def-label">Скорость</span>
      {list.map(([Icon, label, v]) => (
        <div key={label} className="beast-move-row">
          <Icon aria-hidden="true" />
          <span className="beast-move-label">{label}</span>
          <span className="beast-move-track">
            <span style={{ width: `${((v as number) / fastest) * 100}%` }} />
          </span>
          <b>{v} фт.</b>
        </div>
      ))}
    </div>
  )
}

/* ============================================================
   Сцена существа
   ============================================================ */

/** Арт мира кампании, растворяющийся за верхом страницы */
export function WorldBackdrop({ art }: { art: string }) {
  return (
    <div className="beast-world" aria-hidden="true">
      <span className="beast-world-bg" style={{ backgroundImage: `url("${art}")` }} />
    </div>
  )
}

function UniqueMark({ npc }: { npc: boolean }) {
  return (
    <span className="beast-unique" tabIndex={0} aria-label="Уникальный персонаж">
      <Fingerprint aria-hidden="true" />
      <span className="beast-unique-tip" role="tooltip">
        <b>Уникальный персонаж</b>
        {npc
          ? 'Именной НПС: в мире он один, со своей историей и ролью в сюжете — это не типовое существо.'
          : 'Существует в единственном экземпляре — это не типовое существо, а конкретная личность.'}
      </span>
    </span>
  )
}

export function CreatureStage({
  c,
  image,
  kicker,
  cr,
  chips,
}: {
  c: Creature
  image: string | null
  kicker: string
  cr: string
  chips: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  return (
    <header className="beast-stage">
      <aside className="beast-stage-left">
        <ArmorCard ac={c.ac} source={c.ac_source} />
        <HitPointsCard hp={c.hp} formula={c.hp_formula} />
        <MovementCard c={c} />
      </aside>

      <div className="beast-stage-center">
        <div className="beast-art">
          <span className="beast-art-aura" aria-hidden="true" />
          <svg className="beast-art-sigil" viewBox="0 0 200 200" aria-hidden="true">
            <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
            <polygon points="100,22 167,61 167,139 100,178 33,139 33,61" />
            <polygon points="100,6 167,139 33,139" />
            <polygon points="100,194 33,61 167,61" />
          </svg>
          <span className="beast-art-floor" aria-hidden="true" />
          {/* арты с dnd.su — на белом листе, а CORS не даёт обработать пиксели:
              почти белое уводим в прозрачность, родную альфу PNG сохраняем */}
          <svg className="beast-art-defs" aria-hidden="true">
            <filter id="beast-key" colorInterpolationFilters="sRGB">
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -8 -8 -8 0 23.6"
                result="key"
              />
              <feComposite in="key" in2="SourceGraphic" operator="in" />
            </filter>
          </svg>
          {image && !broken ? (
            <img
              src={image}
              alt={c.name}
              style={{ viewTransitionName: 'class-hero-img' } as CSSProperties}
              onError={() => setBroken(true)}
            />
          ) : (
            <Skull className="beast-art-fallback" aria-hidden="true" />
          )}
        </div>

        <div className="beast-nameplate">
          <span className="hex-badge beast-cr" title="показатель опасности">
            <span className="hex-badge-inner">
              <b>{cr}</b>
              <i>ПО</i>
            </span>
          </span>
          <div className="beast-nameplate-text">
            <div className="beast-name-row">
              <h1 className="book-title gold-text" style={{ viewTransitionName: 'class-hero-title' } as CSSProperties}>
                {c.name}
              </h1>
              {c.is_unique && <UniqueMark npc={c.is_npc} />}
            </div>
            <span className="beast-kicker">{kicker}</span>
          </div>
        </div>
        <div className="card-chips beast-chips">{chips}</div>
      </div>

      <aside className="beast-stage-right">
        <AbilityRose c={c} />
      </aside>
    </header>
  )
}

/* ============================================================
   Свойства существа — доска под сценой
   ============================================================ */

const DAMAGE_ICONS: [string, LucideIcon][] = [
  ['огон', Flame],
  ['холод', Snowflake],
  ['яд', Biohazard],
  ['кислот', Droplets],
  ['электрич', Zap],
  ['звук', Volume2],
  ['некрот', Skull],
  ['излучен', Sun],
  ['психич', Brain],
  ['силов', Hexagon],
  ['дробящ', Hammer],
  ['колющ', Sword],
  ['рубящ', Axe],
]

const CONDITION_ICONS: [string, LucideIcon][] = [
  ['отравлен', FlaskConical],
  ['очарован', Heart],
  ['испуг', Ghost],
  ['истощен', BatteryLow],
  ['паралич', Anchor],
  ['сбивание', ArrowDownToLine],
  ['окаменен', Mountain],
  ['ослеплен', EyeOff],
  ['захват', Hand],
  ['опутан', Link2],
  ['глухот', EarOff],
  ['бессознат', Moon],
  ['ошеломлен', Orbit],
]

const iconFor = (table: [string, LucideIcon][], text: string) =>
  table.find(([stem]) => text.toLocaleLowerCase('ru').includes(stem))?.[1]

/** «рубящий от немагических атак» → чип «рубящий» + сноска «от немагических атак»;
 *  «кроме нанесённых посеребрённым оружием» — только сноска */
function splitDamage(list: string[] | null | undefined) {
  const tags: { label: string; Icon: LucideIcon }[] = []
  const notes = new Set<string>()
  for (const raw of list ?? []) {
    const text = raw.trim()
    const Icon = iconFor(DAMAGE_ICONS, text)
    if (!Icon) {
      notes.add(text)
      continue
    }
    const [head, ...rest] = text.split(/\s+(?=от\s|\()/)
    tags.push({ label: head, Icon })
    if (rest.length) notes.add(rest.join(' '))
  }
  return { tags, notes: [...notes] }
}

const cleanCondition = (s: string) => s.replace(/\s*\?+\s*$/, '').trim()

type BoardRoll = { id: number; label: string; bonus: number; die: number }

function RollToast({ roll, onDone }: { roll: BoardRoll | null; onDone: () => void }) {
  useEffect(() => {
    if (!roll) return
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [roll, onDone])
  if (!roll) return null
  const crit = roll.die === 20 ? ' is-crit' : roll.die === 1 ? ' is-fumble' : ''
  return (
    <div key={roll.id} className={`beast-toast${crit}`} role="status">
      <Dices aria-hidden="true" />
      <span className="beast-toast-label">{roll.label}</span>
      <span className="beast-toast-math">
        к20 <b>{roll.die}</b> {signed(roll.bonus)}
      </span>
      <strong>{roll.die + roll.bonus}</strong>
    </div>
  )
}

function BoardCard({
  title,
  icon: Icon,
  wide,
  className = '',
  children,
}: {
  title: string
  icon: LucideIcon
  wide?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`beast-card${wide ? ' beast-card--wide' : ''} ${className}`}>
      <Corners size={18} />
      <h3 className="beast-card-title">
        <Icon aria-hidden="true" /> {title}
      </h3>
      {children}
    </section>
  )
}

function DamageBand({
  kind,
  title,
  icon: Icon,
  list,
}: {
  kind: 'immune' | 'resist' | 'vuln'
  title: string
  icon: LucideIcon
  list: string[] | null | undefined
}) {
  const { tags, notes } = splitDamage(list)
  if (!tags.length && !notes.length) return null
  return (
    <div className={`beast-dmg-band beast-dmg-band--${kind}`}>
      <span className="beast-dmg-band-head">
        <Icon aria-hidden="true" /> {title}
      </span>
      <div className="beast-dmg-tags">
        {tags.map(({ label, Icon: TagIcon }) => (
          <span key={label} className="beast-dmg-tag" title={label}>
            <TagIcon aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
      {notes.length > 0 && <p className="beast-dmg-note">{notes.join('; ')}</p>}
    </div>
  )
}

const SENSE_COLORS = ['#e3c46e', '#a8afba', '#c878dc']

function SensesSonar({ senses }: { senses: { label: string; ft: number; Icon: LucideIcon }[] }) {
  const max = Math.max(...senses.map((s) => s.ft))
  return (
    <div className="beast-sonar">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="beast-sonar-grid" cx="60" cy="60" r="56" />
        <circle className="beast-sonar-grid" cx="60" cy="60" r="28" />
        <line className="beast-sonar-grid" x1="4" y1="60" x2="116" y2="60" />
        <line className="beast-sonar-grid" x1="60" y1="4" x2="60" y2="116" />
        {senses.map((s, i) => (
          <circle
            key={s.label}
            className="beast-sonar-ring"
            cx="60"
            cy="60"
            r={(56 * s.ft) / max}
            style={{ stroke: SENSE_COLORS[i], fill: `${SENSE_COLORS[i]}14`, animationDelay: `${i * 0.25}s` }}
          />
        ))}
        <g className="beast-sonar-sweep">
          <path d="M60 60 L60 4 A56 56 0 0 1 99.6 20.4 Z" />
        </g>
        <circle cx="60" cy="60" r="2.5" fill="#f6e7b6" />
      </svg>
      <ul className="beast-sonar-legend">
        {senses.map((s, i) => (
          <li key={s.label} style={{ '--c': SENSE_COLORS[i] } as CSSProperties}>
            <s.Icon aria-hidden="true" />
            <span>{s.label}</span>
            <b>{s.ft} фт.</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- Размер: существо рядом с рыцарем в 1,75 м ---------- */

const KNIGHT_M = 1.75

/** Типичный рост по категориям DMG; `m` — точка для сравнения на графике */
const SIZES = [
  { key: 'tiny', ru: 'Крошечный', m: 0.6, min: 0.15, max: 0.6, range: 'до 0,6 м', space: '2,5 × 2,5 фт.' },
  { key: 'small', ru: 'Маленький', m: 1.1, min: 0.6, max: 1.2, range: '0,6–1,2 м', space: '5 × 5 фт.' },
  { key: 'medium', ru: 'Средний', m: 1.8, min: 1.2, max: 2.4, range: '1,2–2,4 м', space: '5 × 5 фт.' },
  { key: 'large', ru: 'Большой', m: 3.6, min: 2.4, max: 4.9, range: '2,4–4,9 м', space: '10 × 10 фт.' },
  { key: 'huge', ru: 'Огромный', m: 7.3, min: 4.9, max: 9.8, range: '4,9–9,8 м', space: '15 × 15 фт.' },
  { key: 'gargantuan', ru: 'Громадный', m: 13, min: 9.8, max: 30, range: 'от 9,8 м', space: '20 × 20 фт. и больше' },
] as const

/**
 * Средний рост рас (PHB, VGtM, MPMM и книги сеттингов). Ищем ОСНОВУ внутри
 * уточнения в скобках («щитовая дварфийка», «человек иллюсканец»), поэтому
 * составные расы стоят раньше своих «корней»: полуэльф → эльф, хобгоблин → гоблин.
 */
const RACE_HEIGHTS: [stem: string, race: string, m: number][] = [
  ['полуэльф', 'полуэльф', 1.72],
  ['полуорк', 'полуорк', 1.85],
  ['полурослик', 'полурослик', 0.9],
  ['халфлинг', 'полурослик', 0.9],
  ['хобгоблин', 'хобгоблин', 1.75],
  // «гоблиноид» — и гоблин, и хобгоблин, и багбир: рост берём по категории
  ['гоблиноид', '', 0],
  ['багбир', 'багбир', 2.1],
  ['драконорожд', 'драконорождённый', 1.95],
  ['дуэргар', 'дуэргар', 1.3],
  ['дерро', 'дерро', 1.1],
  ['дроу', 'дроу', 1.6],
  ['эладрин', 'эладрин', 1.7],
  ['эльф', 'эльф', 1.7],
  ['дварф', 'дварф', 1.35],
  ['гном', 'гном', 1.0],
  ['гоблин', 'гоблин', 1.0],
  ['орк', 'орк', 1.9],
  ['орчих', 'орк', 1.9],
  ['человек', 'человек', 1.75],
  // народы людей Фаэруна иногда пишут без слова «человек»
  ['чульт', 'человек', 1.75],
  ['иллюск', 'человек', 1.75],
  ['иллуск', 'человек', 1.75],
  ['турами', 'человек', 1.75],
  ['чондатан', 'человек', 1.75],
  ['голиаф', 'голиаф', 2.3],
  ['фирболг', 'фирболг', 2.3],
  ['локсодон', 'локсодон', 2.2],
  ['кентавр', 'кентавр', 2.1],
  ['минотавр', 'минотавр', 2.0],
  ['леонин', 'леонин', 2.0],
  ['ведалкен', 'ведалкен', 1.85],
  ['гит', 'гит', 1.85],
  ['кован', 'кованый', 1.85],
  ['табакси', 'табакси', 1.8],
  ['людоящер', 'людоящер', 1.8],
  ['тифлинг', 'тифлинг', 1.75],
  ['аасимар', 'аасимар', 1.75],
  ['дженази', 'дженази', 1.75],
  ['юань-ти', 'юань-ти', 1.75],
  ['калаштар', 'калаштар', 1.75],
  ['шифтер', 'шифтер', 1.75],
  ['чейнджлинг', 'чейнджлинг', 1.75],
  ['дампир', 'дампир', 1.75],
  ['возрождён', 'возрождённый', 1.75],
  ['ведьмовск', 'ведьмовская кровь', 1.75],
  ['симик', 'гибрид симиков', 1.75],
  ['тортл', 'тортл', 1.7],
  ['тритон', 'тритон', 1.6],
  ['совлин', 'совлин', 1.6],
  ['локата', 'локата', 1.6],
  ['сатир', 'сатир', 1.6],
  ['ааракокр', 'ааракокра', 1.5],
  ['кенку', 'кенку', 1.5],
  ['зайцегон', 'зайцегон', 1.3],
  ['вердан', 'вердан', 1.2],
  ['кендер', 'кендер', 1.0],
  ['фэйри', 'фэйри', 0.9],
  ['грунг', 'грунг', 0.9],
  ['кобольд', 'кобольд', 0.8],
  // народы бестиария, у которых нет игровой расы
  ['сахуагин', 'сахуагин', 1.9],
  ['мерфолк', 'мерфолк', 1.8],
  ['гнолл', 'гнолл', 2.1],
  ['кваггот', 'кваггот', 2.1],
  ['гифф', 'гифф', 2.1],
  ['три-крин', 'три-крин', 2.0],
  ['троглодит', 'троглодит', 1.6],
  ['гримлок', 'гримлок', 1.6],
  ['куо-тоа', 'куо-тоа', 1.5],
  ['жаболюд', 'жаболюд', 1.3],
  ['ксварт', 'ксварт', 0.9],
  ['гриппли', 'гриппли', 0.6],
]

function raceHeight(creatureType: string | null | undefined) {
  const note = creatureType?.match(/\(([^)]*)\)/)?.[1].toLocaleLowerCase('ru')
  if (!note) return null
  const hit = RACE_HEIGHTS.find(([stem]) => note.includes(stem))
  return hit && hit[2] ? { race: hit[1], m: hit[2] } : null
}

const fmtM = (m: number) => `${String(Math.round(m * 100) / 100).replace('.', ',')} м`

function SizeCard({
  size,
  creatureType,
  image,
  name,
}: {
  size: string | null
  creatureType: string | null
  image: string | null
  name: string
}) {
  const [broken, setBroken] = useState(false)
  const info = SIZES.find((s) => s.key === size?.trim().toLowerCase())
  if (!info) return null

  // рост расы уточняет точку внутри категории, но не выводит из неё:
  // «Средний гном» не ниже 1,2 м, «Маленький человек» (ребёнок) не выше 1,2 м
  const race = raceHeight(creatureType)
  const height = race ? Math.min(info.max, Math.max(info.min, race.m)) : info.m

  const top = Math.max(height, KNIGHT_M) * 1.15
  const step = [0.25, 0.5, 1, 2, 5].find((s) => top / s <= 6) ?? 5
  const ticks = Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step)
  const pct = (m: number) => `${(m / top) * 100}%`

  return (
    <BoardCard title="Размер" icon={Ruler} className="beast-card--size">
      <div className="beast-size-chart">
        {ticks.map((t) => (
          <span key={t} className="beast-size-tick" style={{ bottom: pct(t) }}>
            <i>{fmtM(t)}</i>
          </span>
        ))}
        {/* масштаб задаёт только высота: широкий арт может уйти за край графика */}
        <div className="beast-size-stage">
          <div className="beast-size-figure beast-size-figure--monster" style={{ height: pct(height) }}>
            <span className="beast-size-mark">≈ {fmtM(height)}</span>
            {image && !broken ? (
              <img src={image} alt={name} onError={() => setBroken(true)} />
            ) : (
              <Skull className="beast-size-fallback" aria-hidden="true" />
            )}
          </div>
          <div className="beast-size-figure beast-size-figure--knight" style={{ height: pct(KNIGHT_M) }}>
            <span className="beast-size-mark beast-size-mark--knight">{fmtM(KNIGHT_M)}</span>
            <span className="beast-size-knight" style={{ '--knight': `url("${knightUrl}")` } as CSSProperties} />
          </div>
        </div>
        <span className="beast-size-ground" />
      </div>
      <p className="beast-size-caption">
        <b>{info.ru}</b>
        <span>
          {race ? `${race.race} — в среднем ${fmtM(race.m)}` : `обычно ${info.range}`} · занимает {info.space}
        </span>
      </p>
    </BoardCard>
  )
}

export function CreatureBoard({ c, image }: { c: Creature; image: string | null }) {
  const [roll, setRoll] = useState<BoardRoll | null>(null)
  const clearRoll = useCallback(() => setRoll(null), [])
  const dice = useCreatureDice()
  const rollD20 = async (label: string, bonus: number) => {
    const values = await dice.roll(1, 20)
    if (values) setRoll((prev) => ({ id: (prev?.id ?? 0) + 1, label, bonus, die: values[0] }))
  }

  const saves = c.saving_throws ?? {}
  const skills = Object.entries(c.skills ?? {})
  const hasDamage = !!(c.damage_imunities?.length || c.damage_resistances?.length || c.damage_vulnerabilities?.length)
  const conditions = (c.condition_imunities ?? []).map(cleanCondition).filter(Boolean)
  const senses = [
    c.night_vision ? { label: 'тёмное зрение', ft: c.night_vision, Icon: Moon } : null,
    c.blind_vision ? { label: 'слепое зрение', ft: c.blind_vision, Icon: Radar } : null,
    c.true_vision ? { label: 'истинное зрение', ft: c.true_vision, Icon: Eye } : null,
  ].filter((s): s is NonNullable<typeof s> => !!s)
  const languages = c.languages?.filter(Boolean) ?? []
  const habitat = c.area_of_living?.filter(Boolean) ?? []

  return (
    <div className="beast-board">
      <BoardCard title="Спасброски" icon={ShieldCheck} className="beast-card--saves">
        <div className="beast-saves">
          {ABILITIES.map((a) => {
            const score = (c[a.key] as number | null) ?? 10
            const prof = saves[a.save] != null
            const bonus = saves[a.save] ?? abilityMod(score)
            return (
              <button
                key={a.key}
                type="button"
                className={`beast-save${prof ? ' is-prof' : ''}`}
                onClick={() => void rollD20(`${a.name}, спасбросок`, bonus)}
                disabled={dice.rolling}
                title={prof ? `${a.name} — владение` : a.name}
              >
                <span className="beast-save-inner">
                  <b>{signed(bonus)}</b>
                  <i>{a.short}</i>
                </span>
              </button>
            )
          })}
        </div>
      </BoardCard>

      {skills.length > 0 && (
        <BoardCard title="Навыки" icon={Sparkles} className="beast-card--skills">
          <div className="beast-skills">
            {skills.map(([name, bonus]) => {
              const ability = abilitiesFromSkills([name])[0]
              return (
                <button
                  key={name}
                  type="button"
                  className="beast-skill"
                  onClick={() => void rollD20(name, bonus)}
                  disabled={dice.rolling}
                >
                  <span className="beast-skill-bonus">{signed(bonus)}</span>
                  <span className="beast-skill-name">{name}</span>
                  {ability && <span className="beast-skill-ab">{ABILITY_LABELS[ability].abbr}</span>}
                </button>
              )
            })}
          </div>
        </BoardCard>
      )}

      <SizeCard size={c.size} creatureType={c.creature_type} image={image} name={c.name} />

      {hasDamage && (
        <BoardCard title="Урон" icon={Flame} wide className="beast-card--damage">
          <div className="beast-dmg">
            <DamageBand kind="immune" title="Иммунитет" icon={ShieldCheck} list={c.damage_imunities} />
            <DamageBand kind="resist" title="Сопротивление" icon={ShieldHalf} list={c.damage_resistances} />
            <DamageBand kind="vuln" title="Уязвимость" icon={HeartCrack} list={c.damage_vulnerabilities} />
          </div>
        </BoardCard>
      )}

      {conditions.length > 0 && (
        <BoardCard title="Иммунитет к состояниям" icon={CircleSlash}>
          <div className="beast-conds">
            {conditions.map((name) => {
              const Icon = iconFor(CONDITION_ICONS, name) ?? CircleSlash
              return (
                <span key={name} className="beast-cond" title={`не подвержено: ${name}`}>
                  <span className="beast-cond-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  {name}
                </span>
              )
            })}
          </div>
        </BoardCard>
      )}

      {senses.length > 0 && (
        <BoardCard title="Чувства" icon={Eye}>
          <SensesSonar senses={senses} />
        </BoardCard>
      )}

      {(languages.length > 0 || habitat.length > 0) && (
        <BoardCard title={languages.length ? 'Языки' : 'Среда обитания'} icon={languages.length ? Languages : TreePine}>
          {languages.length > 0 && (
            <div className="beast-langs">
              {languages.map((l) => (
                <span key={l} className="beast-lang">{l}</span>
              ))}
            </div>
          )}
          {languages.length > 0 && habitat.length > 0 && (
            <h3 className="beast-card-title beast-card-title--sub">
              <TreePine aria-hidden="true" /> Среда обитания
            </h3>
          )}
          {habitat.length > 0 && (
            <div className="beast-langs">
              {habitat.map((h) => (
                <span key={h} className="beast-lang">{h}</span>
              ))}
            </div>
          )}
        </BoardCard>
      )}

      <RollToast roll={roll} onDone={clearRoll} />
    </div>
  )
}
