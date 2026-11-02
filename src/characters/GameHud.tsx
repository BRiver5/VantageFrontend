/**
 * Живой лист на телефоне — экран героя в духе мобильных RPG. Только в
 * горизонтальном положении: на вертикальном экране вместо него просьба
 * повернуть устройство.
 *
 * На самом экране — то, что нужно за столом постоянно: фигура героя, хиты, КД,
 * характеристики, атаки, ресурсы и ячейки. Всё остальное открывается окнами с
 * панели справа (бой, навыки, сумка, магия, умения, герой), а служебное —
 * круглыми кнопками в шапке и меню за шевроном.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  Backpack,
  Bell,
  BookOpen,
  ChevronRight,
  Coffee,
  Delete,
  Dices,
  Expand,
  Footprints,
  Heart,
  Home,
  Library,
  ListChecks,
  Minus,
  Moon,
  PawPrint,
  Plus,
  ScrollText,
  ShieldCheck,
  ShieldPlus,
  Skull,
  Sparkles,
  Star,
  Swords,
  TriangleAlert,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DieImage, hitDieType } from '../dice/diceAssets'
import { formatDice } from '../equipment'
import { abilityMod } from '../create/dnd5e'
import { Corners } from '../ornaments'
import { ABILITY_KEYS, ABILITY_LABELS } from '../types/character'
import type { SheetResource, SheetView } from '../types/character'
import { DamageTypePicker } from './DamageTypePicker'
import { ArmorShield, WhyArea, type StageEngine } from './HeroStage'
import { FaceAvatar } from './FacePortrait'
import { DEFAULT_FACE, type FaceCrop } from './portrait'
import type { SheetRoller } from './sheetPlay'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

/** Сколько ресурсов помещается на дуге вокруг героя; остальные — в окне «Бой» */
const ARC_LIMIT = 5

export type HudTab = 'actions' | 'skills' | 'bag' | 'magic' | 'features' | 'hero'

const RAIL: { id: HudTab; label: string; icon: LucideIcon }[] = [
  { id: 'actions', label: 'Бой', icon: Swords },
  { id: 'skills', label: 'Навыки', icon: ShieldCheck },
  { id: 'bag', label: 'Сумка', icon: Backpack },
  { id: 'magic', label: 'Магия', icon: Sparkles },
  { id: 'features', label: 'Умения', icon: BookOpen },
  { id: 'hero', label: 'Герой', icon: UserRound },
]

/** Что страница героя отдаёт экрану: уведомления, выборы, меню и отдых */
/** Что добавляет комната к экрану героя: свои окна в панели, пункты меню и журнал */
export interface HudExtra {
  windows: { id: string; label: string; icon: LucideIcon; badge?: number; body: ReactNode }[]
  menu?: ReactNode
  /** вместо истории своих бросков — общий журнал комнаты */
  rollLog?: ReactNode
  rollCount?: number
}

export interface HudControls {
  /** арт мира за героем */
  background: string | null
  notices: ReactNode[]
  /** меняется при новом уведомлении: окно уведомлений открывается само */
  noticeKey: string
  decisions: ReactNode
  decisionCount: number
  onJournal?: () => void
  onLongRest?: () => void
  /** «Сохранено», «Просмотр»: строка в меню */
  status?: ReactNode
  /** пункты меню за шевроном: новый уровень, правка, видимость */
  menu?: ReactNode
  /** куда ведёт первый пункт меню; по умолчанию — к списку персонажей */
  backTo?: { to: string; label: string }
  /** окна и пункты комнаты */
  extra?: HudExtra
}

/* ---------- просьба повернуть экран ---------- */

export function RotateGate({ coarse }: { coarse: boolean }) {
  useEffect(() => {
    document.documentElement.dataset.rotate = '1'
    return () => {
      delete document.documentElement.dataset.rotate
    }
  }, [])
  return (
    <div className="hud-rotate" role="status">
      <svg className="hud-rotate-sigil" viewBox="0 0 200 200" aria-hidden="true">
        <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
        <polygon points="100,22 167,61 167,139 100,178 33,139 33,61" />
        <polygon points="100,6 167,139 33,139" />
        <polygon points="100,194 33,61 167,61" />
      </svg>
      <svg className="hud-rotate-icon" viewBox="0 0 120 120" aria-hidden="true">
        <path className="hud-rotate-arc" d="M28 34 A46 46 0 0 1 92 34" />
        <path className="hud-rotate-arrow" d="M84 24 L93 35 L80 38" />
        <g className="hud-rotate-phone">
          <rect x="42" y="30" width="36" height="66" rx="6" />
          <path d="M54 37 H66" />
          <circle cx="60" cy="88" r="2.4" />
        </g>
      </svg>
      <h2 className="gold-text">{coarse ? 'Поверните устройство' : 'Расширьте окно'}</h2>
      <p>Лист героя создан для горизонтального экрана — так всё важное видно сразу, без прокрутки.</p>
      {coarse && <p className="hud-rotate-hint">Не поворачивается? Проверьте, включён ли автоповорот экрана.</p>}
      <Link to="/characters" className="hud-rotate-back">
        К персонажам
      </Link>
    </div>
  )
}

/* ---------- мелкие кирпичи ---------- */

/** Круглая кнопка шапки: значок, подпись и счётчик */
function RoundButton({
  icon: Icon,
  label,
  badge,
  alert,
  on,
  onClick,
}: {
  icon: LucideIcon
  label: string
  badge?: number
  alert?: boolean
  on?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`ghud-round${on ? ' is-on' : ''}${alert ? ' is-alert' : ''}`} onClick={onClick} aria-label={label} aria-expanded={on}>
      <span className="ghud-round-ring">
        <Icon aria-hidden="true" />
        {badge ? <em>{badge}</em> : null}
      </span>
      <i>{label}</i>
    </button>
  )
}

/** Окно поверх экрана: панель справа остаётся, между окнами можно переходить сразу */
export function HudWindow({
  id,
  title,
  icon: Icon,
  aside,
  onClose,
  children,
}: {
  id: string
  title: string
  icon: LucideIcon
  aside?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <section className={`hud-win hud-win--${id}`} role="dialog" aria-label={title}>
      <Corners size={22} gold />
      <header className="hud-win-head">
        <span className="hud-win-sign">
          <Icon aria-hidden="true" />
        </span>
        <h2 className="gold-text">{title}</h2>
        {aside && <span className="hud-win-aside">{aside}</span>}
        <button type="button" className="hud-win-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="hud-win-body">{children}</div>
    </section>
  )
}

/** Разделы окна — вертикальными вкладками слева, вместо длинной прокрутки */
export function HudSplit({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  onChange: (key: string) => void
  children: ReactNode
}) {
  return (
    <div className="hud-split">
      <nav className="hud-split-tabs" aria-label="Разделы">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={active === t.key ? 'is-on' : ''} aria-pressed={active === t.key} onClick={() => onChange(t.key)}>
            <span>{t.label}</span>
            {t.count != null && <em>{t.count}</em>}
          </button>
        ))}
      </nav>
      <div key={active} className="hud-split-pane">
        {children}
      </div>
    </div>
  )
}

/** Ресурс на дуге: кольцо заряда и число */
function ResourceOrb({
  r,
  angle,
  active,
  onOpen,
}: {
  r: SheetResource
  angle: number
  active: boolean
  onOpen?: () => void
}) {
  const unlimited = r.max >= 99
  const ratio = unlimited ? 1 : r.max > 0 ? Math.max(0, Math.min(1, r.current / r.max)) : 0
  const len = 2 * Math.PI * 30
  const rad = (angle * Math.PI) / 180
  return (
    <button
      type="button"
      className={`ghud-orb${r.current <= 0 && !unlimited ? ' is-empty' : ''}${active ? ' is-active' : ''}`}
      style={{ '--x': Math.cos(rad).toFixed(3), '--y': Math.sin(rad).toFixed(3) } as CSSProperties}
      onClick={onOpen}
      aria-label={`${r.label}: ${unlimited ? 'без ограничений' : `${r.current} из ${r.max}`}`}
    >
      <span className="ghud-orb-dial">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle className="ghud-orb-track" cx="36" cy="36" r="30" />
          <circle className="ghud-orb-fill" cx="36" cy="36" r="30" style={{ strokeDasharray: len, strokeDashoffset: len * (1 - ratio) }} />
        </svg>
        <b>{unlimited ? '∞' : r.current}</b>
      </span>
      <i>{r.label}</i>
    </button>
  )
}

/** Фигура героя во весь рост; свой портрет с кадром — запасной вариант, если картинка битая */
function HeroFigure({ src, face, onOpen }: { src: string | null; face: FaceCrop | null; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  return (
    <button type="button" className="ghud-figure" onClick={onOpen} aria-label="Открыть окно героя">
      {src && !broken ? (
        <img src={src} alt="" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <FaceAvatar src={null} crop={face ?? DEFAULT_FACE} className="ghud-figure-face" />
      )}
    </button>
  )
}

/* ---------- хиты ---------- */

/** Окно хитов: свой набор цифр — системная клавиатура закрыла бы половину экрана */
function HpDialog({
  sheet,
  roller,
  stage,
  onClose,
}: {
  sheet: SheetView
  roller: SheetRoller
  stage?: StageEngine
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [dmgType, setDmgType] = useState('')
  const combat = sheet.combat
  const form = stage?.form ?? null
  const hp = form ? { current: form.hp, max: form.max, temp: combat.hit_points.temp } : combat.hit_points
  const vitals = stage?.onVitals
  const busy = !!stage?.busy
  const dying = !form && combat.hit_points.current === 0
  const n = Number(amount) || 0

  const press = (d: string) => setAmount((a) => (a + d).replace(/^0+/, '').slice(0, 4))
  const apply = (op: 'damage' | 'heal' | 'temp') => {
    if (!n) return
    vitals?.(op, n, op === 'damage' ? { damageType: dmgType || null } : undefined)
    setAmount('')
  }
  const setDeath = (kind: 'successes' | 'failures', v: number) =>
    vitals?.('death_save', Math.max(0, Math.min(3, v)), { success: kind === 'successes' })
  const rollDeathSave = async () => {
    const die = await roller.rollD20('Спасбросок от смерти', 0)
    if (die == null || !vitals) return
    const ds = combat.death_saves
    if (die === 20) vitals('heal', 1)
    else if (die === 1) setDeath('failures', ds.failures + 2)
    else if (die >= 10) setDeath('successes', ds.successes + 1)
    else setDeath('failures', ds.failures + 1)
  }

  return (
    <div className="hud-dialog-layer" onClick={onClose}>
      <div className="hud-hp" role="dialog" aria-label="Хиты" onClick={(e) => e.stopPropagation()}>
        <Corners size={18} gold />
        <button type="button" className="hud-win-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>

        <div className="hud-hp-now">
          <span className="hud-hp-caption">{form ? form.name : 'Хиты'}</span>
          <b className="gold-text">{hp.current}</b>
          <i>из {hp.max}</i>
          {hp.temp > 0 && <em>+{hp.temp} временных</em>}
          {form && (
            <span className="hud-hp-form">
              <PawPrint aria-hidden="true" /> свои {combat.hit_points.current}/{combat.hit_points.max}
              {form.onRevert && (
                <button type="button" className="cw-mini-btn" onClick={form.onRevert} disabled={busy}>
                  выйти
                </button>
              )}
            </span>
          )}
          {stage?.onHpJournal && (
            <button type="button" className="hud-hp-log" onClick={stage.onHpJournal}>
              <ScrollText aria-hidden="true" /> журнал хитов
            </button>
          )}
        </div>

        {dying && stage ? (
          <div className="hud-hp-death">
            <Skull aria-hidden="true" />
            <p>Спасброски от смерти</p>
            {(['successes', 'failures'] as const).map((kind) => (
              <div key={kind} className={`hud-hp-pips is-${kind}`}>
                <span>{kind === 'successes' ? 'успехи' : 'провалы'}</span>
                {[1, 2, 3].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={combat.death_saves[kind] >= v ? 'is-on' : ''}
                    onClick={() => setDeath(kind, combat.death_saves[kind] === v ? v - 1 : v)}
                    disabled={!vitals || busy}
                    aria-label={`${kind === 'successes' ? 'успехи' : 'провалы'}: ${v}`}
                  />
                ))}
              </div>
            ))}
            {vitals && (
              <button type="button" className="cs-btn" onClick={() => void rollDeathSave()} disabled={roller.rolling || busy}>
                Бросить спасбросок
              </button>
            )}
          </div>
        ) : vitals ? (
          <>
            <div className="hud-hp-pad">
              <output className={`hud-hp-amount${amount ? '' : ' is-empty'}`} aria-label="Сколько хитов">
                {amount || 'сколько?'}
              </output>
              <div className="hud-hp-keys">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button key={d} type="button" onClick={() => press(d)}>
                    {d}
                  </button>
                ))}
                <button type="button" onClick={() => setAmount('')} aria-label="Очистить">
                  <X aria-hidden="true" />
                </button>
                <button type="button" onClick={() => press('0')}>
                  0
                </button>
                <button type="button" onClick={() => setAmount((a) => a.slice(0, -1))} aria-label="Стереть цифру">
                  <Delete aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="hud-hp-acts">
              <button type="button" className="hud-hp-act is-dmg" disabled={busy || !n} onClick={() => apply('damage')}>
                <Swords aria-hidden="true" /> Урон
              </button>
              {stage?.damageTypes && stage.damageTypes.length > 0 && (
                <DamageTypePicker types={stage.damageTypes} value={dmgType} onChange={setDmgType} />
              )}
              <button type="button" className="hud-hp-act is-heal" disabled={busy || !n} onClick={() => apply('heal')}>
                <Heart aria-hidden="true" /> Лечение
              </button>
              <button type="button" className="hud-hp-act is-temp" disabled={busy || !n} onClick={() => apply('temp')}>
                <ShieldPlus aria-hidden="true" /> Временные
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

/* ---------- экран ---------- */

type Pop = 'notices' | 'decisions' | 'rolls' | 'rest' | null

export function GameHud({
  sheet,
  roller,
  stage,
  portrait,
  face,
  fallbackPortrait,
  controls,
  hotbar,
  hotbarMore,
  resources,
  activeKeys,
  activeLabels,
  onOpenAbility,
  slots,
  rollLog,
  rollCount,
  windows,
  tab,
  onTab,
}: {
  sheet: SheetView
  roller: SheetRoller
  stage?: StageEngine
  portrait: string | null
  face: FaceCrop | null
  fallbackPortrait: string | null
  controls?: HudControls
  /** самые нужные атаки — всегда на экране */
  hotbar: ReactNode
  /** сколько атак не поместилось: они в окне «Бой» */
  hotbarMore: number
  resources: SheetResource[]
  activeKeys: Set<string>
  /** включённые состояния и эффекты: ярость, благословение */
  activeLabels: string[]
  onOpenAbility: (slug: string) => void
  slots: { circle: number; max: number; used: number }[]
  rollLog: ReactNode
  rollCount: number
  windows: Partial<Record<HudTab, ReactNode>>
  tab: HudTab | null
  onTab: (t: HudTab | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  // окно комнаты («Партия», «Стол»): живёт отдельно от вкладок листа
  const [extraTab, setExtraTab] = useState<string | null>(null)
  const extra = controls?.extra
  const extraMeta = extra?.windows.find((w) => w.id === extraTab) ?? null
  const [hpOpen, setHpOpen] = useState(false)
  const [inspOpen, setInspOpen] = useState(false)
  const [pop, setPop] = useState<Pop>(null)
  const togglePop = (p: Exclude<Pop, null>) => setPop((cur) => (cur === p ? null : p))

  // новое уведомление не должно пройти незамеченным: окно открывается само
  const noticeKey = controls?.noticeKey ?? ''
  const seenNotice = useRef('')
  useEffect(() => {
    if (noticeKey && noticeKey !== seenNotice.current) setPop('notices')
    seenNotice.current = noticeKey
  }, [noticeKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.cw-modal-layer, .jr-layer')) return
      setMenuOpen(false)
      setHpOpen(false)
      setInspOpen(false)
      setPop(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const info = sheet.basic_info
  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const combat = sheet.combat
  const form = stage?.form ?? null
  const hp = form ? { current: form.hp, max: form.max, temp: combat.hit_points.temp } : combat.hit_points
  const ratio = hp.max > 0 ? Math.min(1, hp.current / hp.max) : 0
  const tone = hp.current === 0 ? 'down' : ratio <= 0.3 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'
  const inspiration = stage?.inspiration ?? (combat.inspiration ? 1 : 0)
  const vitals = stage?.onVitals
  const busy = !!stage?.busy
  const hitDie = cls.hit_die ?? (Number(/[dк](\d+)/i.exec(combat.hit_dice.total)?.[1]) || 8)
  const race = info.subrace?.name ?? info.race.name
  const classes = info.classes.map((c) => (info.classes.length > 1 ? `${c.name} ${c.level}` : c.name)).join(' / ')
  const noticeCount = controls?.notices.length ?? 0
  const decisionCount = controls?.decisionCount ?? 0
  const canRest = !!stage?.onShortRest || !!controls?.onLongRest
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  const arc = resources.slice(0, ARC_LIMIT)
  const arcSpan = arc.length > 1 ? Math.min(112, (arc.length - 1) * 30) : 0
  const windowMeta = tab ? RAIL.find((r) => r.id === tab) : null

  return (
    <div className={`ghud${windows.magic ? '' : ' no-magic'}`}>
      {controls?.background && <span className="ghud-world" style={{ backgroundImage: `url("${controls.background}")` }} aria-hidden="true" />}
      <span className="ghud-vignette" aria-hidden="true" />

      {/* ---------- шапка: меню, герой и круглые кнопки ---------- */}
      <header className="ghud-head">
        <button type="button" className="ghud-round ghud-chevron" onClick={() => setMenuOpen(true)} aria-label="Меню: переходы и настройки" aria-expanded={menuOpen}>
          <span className="ghud-round-ring">
            <ChevronRight aria-hidden="true" />
          </span>
          <i>Меню</i>
        </button>
        <div className="ghud-who">
          <span className="ghud-level" title="Уровень">
            <b>{info.total_level}</b>
          </span>
          <span className="ghud-who-text">
            <b className="gold-text">{info.name}</b>
            <i>{[race, classes, cls.subclass_name].filter(Boolean).join(' · ')}</i>
          </span>
        </div>
        <div className="ghud-rounds">
          {controls && (
            <RoundButton icon={ListChecks} label="Выборы" badge={decisionCount} alert={decisionCount > 0} on={pop === 'decisions'} onClick={() => togglePop('decisions')} />
          )}
          {controls && <RoundButton icon={Bell} label="События" badge={noticeCount} alert={noticeCount > 0} on={pop === 'notices'} onClick={() => togglePop('notices')} />}
          {controls?.onJournal && <RoundButton icon={ScrollText} label="Журнал" onClick={controls.onJournal} />}
          <RoundButton icon={Dices} label="Броски" badge={extra?.rollCount ?? rollCount} on={pop === 'rolls'} onClick={() => togglePop('rolls')} />
          {canRest && <RoundButton icon={Moon} label="Отдых" on={pop === 'rest'} onClick={() => togglePop('rest')} />}
        </div>
      </header>

      {/* ---------- сцена ---------- */}
      <div className="ghud-stage">
        <section className="ghud-left" aria-label="Хиты и характеристики">
          <div className="ghud-vitals">
            <button type="button" className={`cw-hphex ghud-hp is-${tone}`} style={{ '--fill': `${ratio * 100}%` } as CSSProperties} onClick={() => setHpOpen(true)} aria-label={`Хиты: ${hp.current} из ${hp.max}. Изменить`}>
              <span className="cw-hphex-in">
                <span className="cw-hphex-liquid" />
              </span>
              <span className="cw-hphex-value">
                {hp.current === 0 && !form && <Skull aria-hidden="true" />}
                <b key={hp.current}>{hp.current}</b>
                <i>из {hp.max}</i>
              </span>
              {hp.temp > 0 && <span className="cw-hphex-temp">+{hp.temp}</span>}
            </button>
            <WhyArea path="char.ac" title="Класс доспеха" total={combat.armor_class} baseLabel="10 + Ловкость" className="ghud-ac">
              <ArmorShield ac={combat.armor_class} />
            </WhyArea>
            <button
              type="button"
              className="ghud-hd"
              onClick={stage?.onShortRest}
              disabled={!stage?.onShortRest || busy || combat.hit_dice.remaining <= 0}
              aria-label={`Кости хитов: ${combat.hit_dice.remaining} из ${info.total_level}. Короткий отдых`}
            >
              <DieImage type={hitDieType(hitDie)} size={40} />
              <b>
                {combat.hit_dice.remaining}/{info.total_level}
              </b>
              <i>{formatDice(combat.hit_dice.total)}</i>
            </button>
          </div>

          <div className="ghud-emblems">
            <button type="button" className="ghud-emblem is-roll" onClick={() => void roller.rollD20('Инициатива', combat.initiative, undefined, { kind: 'init' })} disabled={roller.rolling} aria-label={`Инициатива ${signed(combat.initiative)}: бросить`}>
              <Zap aria-hidden="true" />
              <b>{signed(combat.initiative)}</b>
              <i>иниц.</i>
            </button>
            <WhyArea path="char.speed.walk" title="Скорость" total={combat.speed} baseLabel="Раса" className="ghud-emblem">
              <Footprints aria-hidden="true" />
              <b>{combat.speed}</b>
              <i>скор.</i>
            </WhyArea>
            <WhyArea path="char.pb" title="Бонус мастерства" total={sheet.proficiency_bonus} baseLabel="По уровню" className="ghud-emblem">
              <Award aria-hidden="true" />
              <b>+{sheet.proficiency_bonus}</b>
              <i>мастер.</i>
            </WhyArea>
            <div className="ghud-insp-wrap">
              <button type="button" className={`ghud-emblem${inspiration > 0 ? ' is-lit' : ''}`} onClick={() => vitals && setInspOpen((v) => !v)} aria-label={`Вдохновение: ${inspiration}`} aria-expanded={inspOpen}>
                <Star aria-hidden="true" />
                <b>{inspiration}</b>
                <i>вдохн.</i>
              </button>
              {inspOpen && vitals && (
                <span className="ghud-insp-pop">
                  <button type="button" onClick={() => vitals('inspiration', -1)} disabled={inspiration <= 0 || busy} aria-label="Потратить вдохновение">
                    <Minus aria-hidden="true" />
                  </button>
                  <b>{inspiration}</b>
                  <button type="button" onClick={() => vitals('inspiration', 1)} disabled={busy} aria-label="Получить вдохновение">
                    <Plus aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="ghud-abils">
            {ABILITY_KEYS.map((k) => {
              const label = ABILITY_LABELS[k]
              const a = sheet.ability_scores[k]
              const mod = a.modifier ?? abilityMod(a.score)
              return (
                <button
                  key={k}
                  type="button"
                  className={`ghud-abil${a.saving_throw_proficient ? ' is-prof' : ''}`}
                  onClick={() => void roller.rollD20(`${label.label}, проверка`, mod, undefined, { kind: 'check', ability: k })}
                  disabled={roller.rolling}
                  aria-label={`${label.label} ${a.score}: бросить проверку ${signed(mod)}`}
                >
                  <i>{label.abbr}</i>
                  <b>{signed(mod)}</b>
                  <em>{a.score}</em>
                </button>
              )
            })}
          </div>
        </section>

        <section className="ghud-center">
          <span className="ghud-aura" aria-hidden="true" />
          <svg className="ghud-sigil" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="80" />
            <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
            <polygon points="100,20 169,139 31,139" />
            <polygon points="100,180 31,61 169,61" />
          </svg>
          <span className="ghud-floor" aria-hidden="true" />
          <HeroFigure src={portrait ?? fallbackPortrait} face={face} onOpen={() => onTab('hero')} />

          {(activeLabels.length > 0 || combat.conditions.length > 0) && (
            <div className="ghud-states" aria-label="Состояния и эффекты">
              {combat.conditions.map((c) => (
                <span key={c} className="is-bad">
                  <TriangleAlert aria-hidden="true" /> {c}
                </span>
              ))}
              {activeLabels.map((l) => (
                <button key={l} type="button" onClick={() => onTab('actions')}>
                  <Zap aria-hidden="true" /> {l}
                </button>
              ))}
            </div>
          )}

          {arc.length > 0 && (
            <div className="ghud-arc" role="list" aria-label="Ресурсы класса">
              {arc.map((r, i) => (
                <ResourceOrb
                  key={r.key}
                  r={r}
                  angle={arc.length > 1 ? -arcSpan / 2 + (arcSpan * i) / (arc.length - 1) : 0}
                  active={r.active ?? activeKeys.has(r.key)}
                  onOpen={() => onOpenAbility(r.declared_by)}
                />
              ))}
            </div>
          )}

          {slots.length > 0 && (
            <button type="button" className="ghud-slots" onClick={() => onTab('magic')} aria-label="Ячейки заклинаний: открыть магию">
              {slots.map((s) => (
                <span key={s.circle} className="ghud-slot">
                  <i>{ROMAN[s.circle] ?? s.circle}</i>
                  {s.max <= 4 && slots.length <= 4 ? (
                    Array.from({ length: s.max }, (_, n) => <u key={n} className={n < s.max - s.used ? 'is-on' : ''} />)
                  ) : (
                    <b>{s.max - s.used}</b>
                  )}
                </span>
              ))}
            </button>
          )}
        </section>

        <section className="ghud-right" aria-label="Атаки">
          <div className="ghud-hotbar">{hotbar}</div>
          {hotbarMore > 0 && (
            <button type="button" className="ghud-more" onClick={() => onTab('actions')}>
              ещё {hotbarMore} <ChevronRight aria-hidden="true" />
            </button>
          )}
        </section>
      </div>

      {/* ---------- панель разделов ---------- */}
      <nav className="ghud-rail" aria-label="Разделы героя">
        {RAIL.filter((r) => windows[r.id]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={tab === id && !extraMeta ? 'is-on' : ''}
            aria-pressed={tab === id && !extraMeta}
            onClick={() => {
              setExtraTab(null)
              onTab(tab === id && !extraMeta ? null : id)
            }}
          >
            <span className="ghud-rail-sign">
              <Icon aria-hidden="true" />
            </span>
            <i>{label}</i>
          </button>
        ))}
        {extra?.windows.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            className={extraTab === id ? 'is-on' : ''}
            aria-pressed={extraTab === id}
            onClick={() => {
              onTab(null)
              setExtraTab(extraTab === id ? null : id)
            }}
          >
            <span className="ghud-rail-sign">
              <Icon aria-hidden="true" />
              {badge ? <em>{badge}</em> : null}
            </span>
            <i>{label}</i>
          </button>
        ))}
      </nav>

      {extraMeta && (
        <HudWindow key={`x-${extraMeta.id}`} id={extraMeta.id} title={extraMeta.label} icon={extraMeta.icon} onClose={() => setExtraTab(null)}>
          {extraMeta.body}
        </HudWindow>
      )}

      {windowMeta && tab && !extraMeta && (
        <HudWindow key={tab} id={tab} title={windowMeta.label} icon={windowMeta.icon} onClose={() => onTab(null)}>
          {windows[tab]}
        </HudWindow>
      )}

      {/* ---------- всплывающее из шапки ---------- */}
      {pop && (
        <>
          <button type="button" className="hud-scrim" aria-label="Закрыть" onClick={() => setPop(null)} />
          <div className={`hud-pop hud-pop--${pop}`} role="dialog">
            {pop === 'decisions' && (
              <>
                <h3 className="hud-pop-title">
                  <ListChecks aria-hidden="true" /> Нужно решить
                </h3>
                {decisionCount > 0 ? controls?.decisions : <p className="hud-pop-empty">Все выборы сделаны. Когда умение потребует решения, оно появится здесь.</p>}
              </>
            )}
            {pop === 'notices' && (
              <>
                <h3 className="hud-pop-title">
                  <Bell aria-hidden="true" /> События
                </h3>
                {noticeCount > 0 ? controls?.notices : <p className="hud-pop-empty">Пока тихо: ни ошибок, ни предупреждений.</p>}
              </>
            )}
            {pop === 'rolls' && (
              <>
                <h3 className="hud-pop-title">
                  <Dices aria-hidden="true" /> Последние броски
                </h3>
                {(extra?.rollCount ?? rollCount) > 0 ? (extra?.rollLog ?? rollLog) : <p className="hud-pop-empty">Бросков ещё не было. Нажмите на характеристику или кость атаки.</p>}
              </>
            )}
            {pop === 'rest' && (
              <>
                <h3 className="hud-pop-title">
                  <Moon aria-hidden="true" /> Привал
                </h3>
                <div className="hud-rest">
                  <button
                    type="button"
                    disabled={!stage?.onShortRest || busy}
                    onClick={() => {
                      setPop(null)
                      stage?.onShortRest?.()
                    }}
                  >
                    <Coffee aria-hidden="true" />
                    <b>Короткий отдых</b>
                    <i>кости хитов и ресурсы короткого отдыха</i>
                  </button>
                  <button
                    type="button"
                    disabled={!controls?.onLongRest || busy}
                    onClick={() => {
                      setPop(null)
                      controls?.onLongRest?.()
                    }}
                  >
                    <Moon aria-hidden="true" />
                    <b>Продолжительный отдых</b>
                    <i>хиты, ячейки, ресурсы и половина костей хитов</i>
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {hpOpen && <HpDialog sheet={sheet} roller={roller} stage={stage} onClose={() => setHpOpen(false)} />}

      {/* ---------- меню за шевроном ---------- */}
      {menuOpen && (
        <div className="hud-menu-layer" onClick={() => setMenuOpen(false)}>
          <aside className="hud-menu" aria-label="Меню" onClick={(e) => e.stopPropagation()}>
            <header>
              <b className="gold-text">Меню</b>
              <button type="button" className="hud-win-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="hud-menu-list">
              <Link to={controls?.backTo?.to ?? '/characters'} className="hud-menu-item">
                <Users aria-hidden="true" /> {controls?.backTo?.label ?? 'К персонажам'}
              </Link>
              {controls?.menu}
              {extra?.menu}
              {canFullscreen && (
                <button
                  type="button"
                  className="hud-menu-item"
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen()
                    else void document.documentElement.requestFullscreen().catch(() => {})
                    setMenuOpen(false)
                  }}
                >
                  <Expand aria-hidden="true" /> На весь экран
                </button>
              )}
              <Link to="/classes" className="hud-menu-item">
                <Library aria-hidden="true" /> Кодекс
              </Link>
              <Link to="/" className="hud-menu-item">
                <Home aria-hidden="true" /> Главная
              </Link>
            </div>
            {controls?.status && <footer>{controls.status}</footer>}
          </aside>
        </div>
      )}
    </div>
  )
}
