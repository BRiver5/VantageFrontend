/**
 * Сцена героя — шапка сохранённого листа в духе страницы существа в бестиарии.
 *
 * По центру крупный портрет (в шестиугольнике, круге или целиком) на
 * вращающейся печати и имя под ним; ниже, во всю ширину, — лента «раса ·
 * класс · подкласс · уровень». Вокруг портрета — числа, которыми живут за
 * столом: слева щит КД, шестигранник хитов, налитый ровно настолько, сколько
 * хитов осталось, и кости хитов; справа — инициатива, скорость, мастерство и
 * вдохновение счётчиком. Урон, лечение и временные хиты вносятся рядом с
 * шестигранником, всё это пишется в журнал хитов; на нуле шестигранник
 * превращается в спасброски от смерти.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  Camera,
  Coffee,
  Dices,
  Footprints,
  Heart,
  Minus,
  Moon,
  Plus,
  ScrollText,
  ShieldPlus,
  Skull,
  Star,
  Swords,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DieImage, hitDieType } from '../dice/diceAssets'
import { abilityMod } from '../create/dnd5e'
import type { CharacterCreate } from '../types/character'
import { FaceAvatar } from './FacePortrait'
import type { HpLog, HpLogKind } from './hpLog'
import { DEFAULT_FACE, FALLBACK_FACE, type FaceCrop } from './portrait'
import type { SheetPatch, SheetRoller } from './sheetPlay'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Состояния PHB — отмечаются на сцене */
const CONDITIONS = [
  'Без сознания',
  'Испуганный',
  'Истощённый',
  'Невидимый',
  'Недееспособный',
  'Оглохший',
  'Окаменевший',
  'Опутанный',
  'Ослеплённый',
  'Отравленный',
  'Очарованный',
  'Ошеломлённый',
  'Парализованный',
  'Распластанный',
  'Схваченный',
]

const LOG_KIND: Record<HpLogKind, { label: string; icon: LucideIcon }> = {
  dmg: { label: 'Урон', icon: Swords },
  heal: { label: 'Лечение', icon: Heart },
  temp: { label: 'Временные хиты', icon: ShieldPlus },
  hd: { label: 'Кость хитов', icon: Dices },
  rest: { label: 'Долгий отдых', icon: Moon },
  death: { label: 'Спасбросок от смерти', icon: Skull },
}

const clock = (ms: number) => {
  const d = new Date(ms)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  return today ? time : `${d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}, ${time}`
}

/** Портрет на печати: рамка по выбору игрока; арт расы — целиком, как в бестиарии */
function HeroArt({ src, crop, onEdit }: { src: string | null; crop: FaceCrop; onEdit?: () => void }) {
  const [broken, setBroken] = useState(false)
  const full = crop.shape === 'full'
  return (
    <div className={`cw-art cw-art--${crop.shape}`}>
      <span className="beast-art-aura" aria-hidden="true" />
      <svg className="beast-art-sigil cw-art-sigil" viewBox="0 0 200 200" aria-hidden="true">
        <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
        <polygon points="100,22 167,61 167,139 100,178 33,139 33,61" />
        <polygon points="100,6 167,139 33,139" />
        <polygon points="100,194 33,61 167,61" />
      </svg>
      {full ? (
        <>
          <span className="beast-art-floor" aria-hidden="true" />
          {src && !broken ? (
            <img className="cw-art-full" src={src} alt="" onError={() => setBroken(true)} />
          ) : (
            <FaceAvatar src={null} crop={DEFAULT_FACE} className="cw-art-face" />
          )}
        </>
      ) : (
        <FaceAvatar src={src} crop={crop} className="cw-art-face" />
      )}
      {onEdit && (
        <button type="button" className="cw-art-edit" onClick={onEdit} title="Сменить портрет и рамку">
          <Camera aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Щит КД — тот же, что у существ в бестиарии; блик бежит мягкой полосой по форме щита */
function ArmorShield({ ac }: { ac: number }) {
  return (
    <span className="beast-shield cw-orb-shield">
      <svg viewBox="0 0 100 116" aria-hidden="true">
        <defs>
          <linearGradient id="cw-shield-edge" x1="0" y1="0" x2="100" y2="116" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7c828b" />
            <stop offset="45%" stopColor="#cdd3db" />
            <stop offset="55%" stopColor="#f1f4f8" />
            <stop offset="100%" stopColor="#8b919a" />
          </linearGradient>
          <linearGradient id="cw-shield-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#262a32" />
            <stop offset="100%" stopColor="#0d0e11" />
          </linearGradient>
        </defs>
        <path
          d="M50 4 L92 18 V54 C92 84 72 102 50 112 C28 102 8 84 8 54 V18 Z"
          fill="url(#cw-shield-body)"
          stroke="url(#cw-shield-edge)"
          strokeWidth="2.4"
        />
        <path
          d="M50 13 L83 24 V54 C83 78 67 93 50 102 C33 93 17 78 17 54 V24 Z"
          fill="none"
          stroke="url(#cw-shield-edge)"
          strokeWidth="0.8"
          opacity="0.55"
        />
      </svg>
      <span className="beast-shield-value">
        <b>{ac}</b>
        <i>КД</i>
      </span>
    </span>
  )
}

const LOG_WIDTH = 340

/**
 * Журнал хитов — всплывает под кнопкой «журнал» поверх всей страницы: окно
 * выносится в body и держится у кнопки при прокрутке и смене размера окна.
 */
function HpLogMenu({ log, anchor, onClose }: { log: HpLog; anchor: HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const width = Math.min(LOG_WIDTH, window.innerWidth - 24)
      // по центру под кнопкой, но не за краями экрана
      const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12)
      setPos({ top: r.bottom + 8, left, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (!ref.current?.contains(el) && !el.closest('.cw-hphex-log')) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!pos) return null
  return createPortal(
    <div
      ref={ref}
      className="cw-hplog"
      role="dialog"
      aria-label="Журнал хитов"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `min(380px, calc(100vh - ${pos.top + 16}px))` }}
    >
      <header className="cw-hplog-head">
        <ScrollText aria-hidden="true" />
        <b>Журнал хитов</b>
        {log.entries.length > 0 && (
          <button type="button" onClick={log.clear} title="Очистить журнал" aria-label="Очистить журнал">
            <Trash2 aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      {log.entries.length === 0 ? (
        <p className="cw-hplog-empty">Пока пусто — урон, лечение и отдых появятся здесь.</p>
      ) : (
        <ol className="cw-hplog-list">
          {log.entries.map((e) => {
            const { label, icon: Icon } = LOG_KIND[e.kind]
            const up = e.kind !== 'dmg'
            return (
              <li key={e.id} className={`cw-hplog-row is-${e.kind}`}>
                <span className="cw-hplog-ico">
                  <Icon aria-hidden="true" />
                </span>
                <span className="cw-hplog-what">
                  <b>{label}</b>
                  <i>
                    {e.kind === 'temp' ? 'врем. ' : ''}
                    {e.from} → {e.to}
                    {e.note ? ` · ${e.note}` : ''}
                  </i>
                </span>
                <span className="cw-hplog-delta">
                  {up ? '+' : '−'}
                  {e.amount}
                </span>
                <time className="cw-hplog-time">{clock(e.at)}</time>
              </li>
            )
          })}
        </ol>
      )}
    </div>,
    document.body,
  )
}

export function HeroStage({
  sheet,
  portrait,
  face,
  fallbackPortrait,
  onPortraitClick,
  roller,
  onPatch,
  onLongRest,
  hpLog,
  inspiration,
  onInspiration,
}: {
  sheet: CharacterCreate
  portrait: string | null
  face: FaceCrop | null
  fallbackPortrait: string | null
  onPortraitClick?: () => void
  roller: SheetRoller
  onPatch?: SheetPatch
  onLongRest: () => void
  hpLog: HpLog
  /** сколько вдохновений накоплено */
  inspiration: number
  onInspiration?: (n: number) => void
}) {
  const [amount, setAmount] = useState('')
  const [condOpen, setCondOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const logBtnRef = useRef<HTMLButtonElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const info = sheet.basic_info
  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const level = info.total_level
  const combat = sheet.combat
  const hp = combat.hit_points
  const live = !!onPatch
  const conMod = abilityMod(sheet.ability_scores.constitution.score)
  const hitDie = cls.hit_die ?? (Number(/[dк](\d+)/i.exec(combat.hit_dice.total)?.[1]) || 8)
  const ratio = hp.max > 0 ? Math.min(1, hp.current / hp.max) : 0
  const tone = hp.current === 0 ? 'down' : ratio <= 0.3 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'
  const dying = hp.current === 0

  const setCombat = (fn: (c: CharacterCreate['combat']) => Partial<CharacterCreate['combat']>) =>
    onPatch?.((c) => ({ ...c, combat: { ...c.combat, ...fn(c.combat) } }))

  /** Урон съедает сначала временные хиты */
  const takeDamage = (n: number) => {
    const fromTemp = Math.min(hp.temp, n)
    const to = Math.max(0, hp.current - (n - fromTemp))
    setCombat((c) => {
      const absorbed = Math.min(c.hit_points.temp, n)
      return {
        hit_points: { ...c.hit_points, temp: c.hit_points.temp - absorbed, current: Math.max(0, c.hit_points.current - (n - absorbed)) },
      }
    })
    hpLog.push({ kind: 'dmg', amount: n, from: hp.current, to, note: fromTemp ? `врем. поглотили ${fromTemp}` : undefined })
    roller.note(`−${n}`, 'Получен урон')
  }
  /** Лечение не выше максимума; с нуля — спасброски от смерти с чистого листа */
  const heal = (n: number) => {
    setCombat((c) => ({
      hit_points: { ...c.hit_points, current: Math.min(c.hit_points.max, c.hit_points.current + n) },
      death_saves: c.hit_points.current === 0 ? { successes: 0, failures: 0 } : c.death_saves,
    }))
    hpLog.push({ kind: 'heal', amount: n, from: hp.current, to: Math.min(hp.max, hp.current + n) })
    roller.note(`+${n}`, 'Лечение')
  }
  /** Временные хиты не складываются — остаются большие */
  const giveTemp = (n: number) => {
    setCombat((c) => ({ hit_points: { ...c.hit_points, temp: Math.max(c.hit_points.temp, n) } }))
    hpLog.push({ kind: 'temp', amount: n, from: hp.temp, to: Math.max(hp.temp, n), note: hp.temp >= n ? 'не складываются' : undefined })
    roller.note(`+${n}`, 'Временные хиты')
  }
  /** Пустое поле — подсказать, куда вписать число */
  const apply = (fn: (n: number) => void) => {
    const n = Math.abs(parseInt(amount, 10))
    if (!n) {
      amountRef.current?.focus()
      return
    }
    fn(n)
    setAmount('')
  }

  const setDeath = (kind: 'successes' | 'failures', n: number) =>
    setCombat((c) => ({ death_saves: { ...c.death_saves, [kind]: Math.max(0, Math.min(3, n)) } }))

  /** Спасбросок от смерти: 20 — встаёт с 1 хитом, 1 — два провала, 10+ — успех */
  const rollDeathSave = async () => {
    const die = await roller.rollD20('Спасбросок от смерти', 0)
    if (die == null) return
    if (die === 20) {
      setCombat((c) => ({ hit_points: { ...c.hit_points, current: 1 }, death_saves: { successes: 0, failures: 0 } }))
      hpLog.push({ kind: 'death', amount: 1, from: 0, to: 1, note: 'натуральная 20' })
      roller.note('1', 'Натуральная 20 — герой приходит в себя')
      return
    }
    setCombat((c) => {
      const ds = c.death_saves
      if (die === 1) return { death_saves: { ...ds, failures: Math.min(3, ds.failures + 2) } }
      if (die >= 10) return { death_saves: { ...ds, successes: Math.min(3, ds.successes + 1) } }
      return { death_saves: { ...ds, failures: Math.min(3, ds.failures + 1) } }
    })
  }

  /** Короткий отдых: кость хитов + ТЕЛ к хитам */
  const spendHitDie = async () => {
    if (combat.hit_dice.remaining <= 0) return roller.note('—', 'Кости хитов закончились')
    const values = await roller.rollDice('Кость хитов', 1, hitDie, conMod)
    if (!values) return
    const gain = Math.max(0, values[0] + conMod)
    setCombat((c) => ({
      hit_dice: { ...c.hit_dice, remaining: Math.max(0, c.hit_dice.remaining - 1) },
      hit_points: { ...c.hit_points, current: Math.min(c.hit_points.max, c.hit_points.current + gain) },
    }))
    hpLog.push({ kind: 'hd', amount: gain, from: hp.current, to: Math.min(hp.max, hp.current + gain), note: `к${hitDie}: ${values[0]} ${signed(conMod)}` })
  }

  const toggleCondition = (name: string) =>
    setCombat((c) => ({
      conditions: c.conditions.includes(name) ? c.conditions.filter((x) => x !== name) : [...c.conditions, name],
    }))

  const spendInspiration = () => {
    if (!onInspiration || inspiration <= 0) return
    onInspiration(inspiration - 1)
    roller.note('★', 'Вдохновение потрачено — бросок с преимуществом')
  }

  const crop = portrait ? (face ?? DEFAULT_FACE) : FALLBACK_FACE
  const race = info.subrace?.name ?? info.race.name

  return (
    <header className={`cw-hstage is-${tone}`}>
      {/* ---------- слева: оборона и хиты ---------- */}
      <div className="cw-hstage-side cw-hstage-left">
        <div className="cw-orb cw-orb--ac" style={{ '--arc': 0 } as CSSProperties}>
          <span className="cw-orb-text">
            <b>Класс доспеха</b>
            <i>{combat.shield ? 'со щитом' : 'без щита'}</i>
          </span>
          <ArmorShield ac={combat.armor_class} />
        </div>

        <div className="cw-orb cw-orb--hp" style={{ '--arc': 1 } as CSSProperties}>
          {live && (
            <form
              className="cw-hpctl"
              onSubmit={(e) => {
                e.preventDefault()
                apply(takeDamage)
              }}
            >
              <label className="cw-hpctl-field">
                <span className="cw-hpctl-cap">хиты</span>
                <input
                  ref={amountRef}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={amount}
                  placeholder="—"
                  aria-label="Сколько хитов"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <span className="cw-hpseg" role="group" aria-label="Что сделать с хитами">
                <button type="submit" className="cw-hpseg-btn is-dmg" title="Нанести урон (Enter)" aria-label="Нанести урон">
                  <Swords aria-hidden="true" />
                </button>
                <button type="button" className="cw-hpseg-btn is-heal" onClick={() => apply(heal)} title="Вылечить" aria-label="Вылечить">
                  <Heart aria-hidden="true" />
                </button>
                <button type="button" className="cw-hpseg-btn is-temp" onClick={() => apply(giveTemp)} title="Временные хиты" aria-label="Временные хиты">
                  <ShieldPlus aria-hidden="true" />
                </button>
              </span>
            </form>
          )}

          <div className="cw-hpwrap">
            <div className={`cw-hphex is-${tone}`} style={{ '--fill': `${ratio * 100}%` } as CSSProperties}>
              <span className="cw-hphex-in">
                <span className="cw-hphex-liquid" />
              </span>
              {dying && live ? (
                <span className="cw-hphex-death">
                  <Skull aria-hidden="true" />
                  {(['successes', 'failures'] as const).map((kind) => (
                    <span key={kind} className={`cw-hphex-pips is-${kind}`}>
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={combat.death_saves[kind] >= n ? 'is-on' : ''}
                          onClick={() => setDeath(kind, combat.death_saves[kind] === n ? n - 1 : n)}
                          aria-label={`${kind === 'successes' ? 'успехи' : 'провалы'}: ${n}`}
                        />
                      ))}
                    </span>
                  ))}
                  <button type="button" className="cw-hphex-roll" onClick={() => void rollDeathSave()} disabled={roller.rolling}>
                    спасбросок
                  </button>
                </span>
              ) : (
                <span className="cw-hphex-value">
                  <b key={hp.current}>{hp.current}</b>
                  <i>из {hp.max}</i>
                </span>
              )}
              {hp.temp > 0 && (
                <span className="cw-hphex-temp" title="Временные хиты">
                  +{hp.temp}
                </span>
              )}
            </div>
            <button
              ref={logBtnRef}
              type="button"
              className={`cw-hphex-log${logOpen ? ' is-on' : ''}`}
              onClick={() => setLogOpen((v) => !v)}
              aria-expanded={logOpen}
              title="Журнал хитов"
            >
              <ScrollText aria-hidden="true" /> журнал
              {hpLog.entries.length > 0 && <em>{hpLog.entries.length}</em>}
            </button>
            {logOpen && <HpLogMenu log={hpLog} anchor={logBtnRef.current} onClose={() => setLogOpen(false)} />}
          </div>
        </div>

        <div className="cw-orb cw-orb--hd" style={{ '--arc': 0 } as CSSProperties}>
          <span className="cw-orb-text">
            <b>Кости хитов</b>
            <i>
              {combat.hit_dice.remaining} из {level} · к{hitDie}
            </i>
          </span>
          <button
            type="button"
            className="cw-hd-die"
            onClick={() => void spendHitDie()}
            disabled={!live || roller.rolling || combat.hit_dice.remaining <= 0}
            title={`Короткий отдых: к${hitDie} ${signed(conMod)} к хитам`}
          >
            <DieImage type={hitDieType(hitDie)} size={46} />
            <Coffee className="cw-hd-die-ico" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ---------- центр: портрет и имя ---------- */}
      <div className="cw-hstage-center">
        <HeroArt src={portrait ?? fallbackPortrait} crop={crop} onEdit={onPortraitClick} />
        <h1 className="cw-plate-name gold-text">{info.name}</h1>
      </div>

      {/* ---------- справа: ход, движение, мастерство, вдохновение ---------- */}
      <div className="cw-hstage-side cw-hstage-right">
        <button
          type="button"
          className="cw-orb cw-orb--r is-roll"
          style={{ '--arc': 0 } as CSSProperties}
          onClick={() => void roller.rollD20('Инициатива', combat.initiative)}
          disabled={roller.rolling}
          title="Бросить инициативу"
        >
          <span className="hex-badge cw-orb-hex">
            <span className="hex-badge-inner">
              <Zap aria-hidden="true" />
              <b>{signed(combat.initiative)}</b>
            </span>
          </span>
          <span className="cw-orb-text">
            <b>Инициатива</b>
            <i>нажмите — бросок</i>
          </span>
        </button>
        <div className="cw-orb cw-orb--r" style={{ '--arc': 1 } as CSSProperties}>
          <span className="hex-badge cw-orb-hex">
            <span className="hex-badge-inner">
              <Footprints aria-hidden="true" />
              <b>{combat.speed}</b>
            </span>
          </span>
          <span className="cw-orb-text">
            <b>Скорость</b>
            <i>{combat.speed} фт. за ход</i>
          </span>
        </div>
        <div className="cw-orb cw-orb--r" style={{ '--arc': 1 } as CSSProperties}>
          <span className="hex-badge cw-orb-hex">
            <span className="hex-badge-inner">
              <Award aria-hidden="true" />
              <b>+{sheet.proficiency_bonus}</b>
            </span>
          </span>
          <span className="cw-orb-text">
            <b>Мастерство</b>
            <i>бонус владения</i>
          </span>
        </div>
        <div className={`cw-orb cw-orb--r cw-orb--insp${inspiration > 0 ? ' is-on' : ''}`} style={{ '--arc': 0 } as CSSProperties}>
          <span className="hex-badge cw-orb-hex">
            <span className="hex-badge-inner">
              <Star aria-hidden="true" />
              <b>{inspiration}</b>
            </span>
          </span>
          <span className="cw-orb-text">
            <b>Вдохновение</b>
            {onInspiration ? (
              <span className="cw-insp-ctl">
                <button type="button" onClick={spendInspiration} disabled={inspiration <= 0} title="Потратить вдохновение" aria-label="Потратить вдохновение">
                  <Minus aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onInspiration(Math.min(99, inspiration + 1))}
                  title="Получить вдохновение"
                  aria-label="Получить вдохновение"
                >
                  <Plus aria-hidden="true" />
                </button>
              </span>
            ) : (
              <i>{inspiration > 0 ? 'есть' : 'нет'}</i>
            )}
          </span>
        </div>

        {live && (
          <div className="cw-hstage-tools">
            <span className="cw-cond-wrap">
              <button
                type="button"
                className={`cw-mini-btn${condOpen ? ' is-on' : ''}`}
                onClick={() => setCondOpen((v) => !v)}
                aria-expanded={condOpen}
              >
                <TriangleAlert aria-hidden="true" /> состояния{combat.conditions.length ? ` · ${combat.conditions.length}` : ''}
              </button>
              {condOpen && (
                <span className="cw-cond-pop" role="dialog" aria-label="Состояния">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`cw-cond${combat.conditions.includes(c) ? ' is-on' : ''}`}
                      onClick={() => toggleCondition(c)}
                      aria-pressed={combat.conditions.includes(c)}
                    >
                      {c}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <button type="button" className="cw-mini-btn" onClick={onLongRest} title="Хиты, ячейки и половина костей хитов">
              <Moon aria-hidden="true" /> долгий отдых
            </button>
          </div>
        )}
      </div>

      {/* ---------- лента под сценой: раса · класс · подкласс · уровень ---------- */}
      <div className="cw-hstage-foot">
        <div className="cw-ribbon">
          <span className="cw-ribbon-seg">{race}</span>
          <span className="cw-ribbon-dot" aria-hidden="true" />
          <span className="cw-ribbon-seg cw-ribbon-cls">
            {cls.name}
            {cls.subclass_name && <em>{cls.subclass_name}</em>}
          </span>
          <span className="hex-badge cw-ribbon-lvl" title="Уровень">
            <span className="hex-badge-inner">
              <b>{level}</b>
              <i>ур.</i>
            </span>
          </span>
        </div>
        {combat.conditions.length > 0 && (
          <div className="cw-hstage-conds">
            {combat.conditions.map((c) => (
              <button key={c} type="button" onClick={() => toggleCondition(c)} disabled={!live} title="Снять состояние">
                <TriangleAlert aria-hidden="true" /> {c}
                {live && <X aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
