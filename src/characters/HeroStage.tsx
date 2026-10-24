/**
 * Сцена героя — шапка сохранённого листа в духе страницы существа в бестиарии.
 *
 * По центру крупный портрет (в шестиугольнике, круге или целиком) на
 * вращающейся печати и имя под ним; ниже, во всю ширину, — лента «раса ·
 * класс · подкласс · уровень». Вокруг портрета — числа, которыми живут за
 * столом: слева щит КД, шестигранник хитов, налитый ровно настолько, сколько
 * хитов осталось, и кости хитов; справа — инициатива, скорость, мастерство и
 * вдохновение. Все числа — с сервера; у тех, что сложены из вкладов, в
 * подсказке расшифровка «откуда число».
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Award,
  Camera,
  Coffee,
  Footprints,
  Heart,
  Minus,
  PawPrint,
  Plus,
  ScrollText,
  ShieldPlus,
  Skull,
  Star,
  Swords,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { DieImage, hitDieType } from '../dice/diceAssets'
import { formatDice } from '../equipment'
import type { SheetView } from '../types/character'
import { FaceAvatar } from './FacePortrait'
import { DEFAULT_FACE, FALLBACK_FACE, type FaceCrop } from './portrait'
import type { SheetRoller } from './sheetPlay'
import type { VitalsOp } from '../api'
import { useWhy, WhyDot } from './WhyPopover'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

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

/**
 * Что сцена умеет у сохранённого героя. Хиты, временные хиты, спасброски от
 * смерти и вдохновение хранит сервер: правки идут через движок (`onVitals`) —
 * урон учитывает сопротивления и облик, всё попадает в журнал и отменяется.
 */
export interface StageEngine {
  busy: boolean
  /** вдохновение — число (char.inspiration) */
  inspiration: number
  /** урон, лечение, временные хиты, вдохновение, спасброски — только у своего героя */
  onVitals?: (op: VitalsOp, amount: number, opts?: { damageType?: string | null; success?: boolean }) => void
  /** типы урона для меню (английский ключ → подпись) */
  damageTypes?: { value: string; label: string }[]
  /** короткий отдых: окно выбора костей хитов */
  onShortRest?: () => void
  /** журнал хитов: урон, лечение, отдых */
  onHpJournal?: () => void
  /** активный облик (дикий облик): его хиты, имя и выход */
  form?: { name: string; hp: number; max: number; onRevert?: () => void } | null
}

/** Кликабельное число с расшифровкой; без вкладов — просто блок */
function WhyArea({
  path,
  title,
  total,
  baseLabel,
  className,
  style,
  children,
}: {
  path: string
  title: string
  total?: number | string
  baseLabel?: string
  className: string
  style?: CSSProperties
  children: ReactNode
}) {
  const why = useWhy()
  if (!why.has(path)) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={`${className} is-why`}
      style={style}
      onClick={(e) => why.open(e.currentTarget, { path, title, total, baseLabel })}
      title="Откуда это число"
    >
      {children}
    </button>
  )
}

export function HeroStage({
  sheet,
  portrait,
  face,
  fallbackPortrait,
  onPortraitClick,
  roller,
  stage,
}: {
  sheet: SheetView
  portrait: string | null
  face: FaceCrop | null
  fallbackPortrait: string | null
  onPortraitClick?: () => void
  roller: SheetRoller
  stage?: StageEngine
}) {
  const [amount, setAmount] = useState('')
  const [dmgType, setDmgType] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
  const why = useWhy()

  const info = sheet.basic_info
  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const level = info.total_level
  const combat = sheet.combat
  const form = stage?.form ?? null
  // в облике шестигранник показывает хиты зверя, свои — мелко под ним
  const hp = form ? { current: form.hp, max: form.max, temp: combat.hit_points.temp } : combat.hit_points
  const vitals = stage?.onVitals
  const busy = !!stage?.busy
  const inspiration = stage?.inspiration ?? (combat.inspiration ? 1 : 0)
  const hitDie = cls.hit_die ?? (Number(/[dк](\d+)/i.exec(combat.hit_dice.total)?.[1]) || 8)
  const ratio = hp.max > 0 ? Math.min(1, hp.current / hp.max) : 0
  const tone = hp.current === 0 ? 'down' : ratio <= 0.3 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'
  const dying = !form && combat.hit_points.current === 0

  /* ---------- урон, лечение, временные хиты ---------- */

  const apply = (op: 'damage' | 'heal' | 'temp') => {
    const n = Math.abs(parseInt(amount, 10))
    if (!n) {
      amountRef.current?.focus()
      return
    }
    vitals?.(op, n, op === 'damage' ? { damageType: dmgType || null } : undefined)
    setAmount('')
  }

  const setDeath = (kind: 'successes' | 'failures', n: number) =>
    vitals?.('death_save', Math.max(0, Math.min(3, n)), { success: kind === 'successes' })

  /** Спасбросок от смерти: 20 — встаёт с 1 хитом, 1 — два провала, 10+ — успех */
  const rollDeathSave = async () => {
    const die = await roller.rollD20('Спасбросок от смерти', 0)
    if (die == null || !vitals) return
    const ds = combat.death_saves
    if (die === 20) vitals('heal', 1)
    else if (die === 1) setDeath('failures', ds.failures + 2)
    else if (die >= 10) setDeath('successes', ds.successes + 1)
    else setDeath('failures', ds.failures + 1)
  }

  const crop = portrait ? (face ?? DEFAULT_FACE) : FALLBACK_FACE
  const race = info.subrace?.name ?? info.race.name

  return (
    <header className={`cw-hstage is-${tone}${form ? ' is-form' : ''}`}>
      {/* ---------- слева: оборона и хиты ---------- */}
      <div className="cw-hstage-side cw-hstage-left">
        <WhyArea path="char.ac" title="Класс доспеха" total={combat.armor_class} baseLabel="10 + Ловкость" className="cw-orb cw-orb--ac" style={{ '--arc': 0 } as CSSProperties}>
          <span className="cw-orb-text">
            <b>Класс доспеха</b>
            <i>{combat.shield ? 'со щитом' : 'без щита'}</i>
          </span>
          <ArmorShield ac={combat.armor_class} />
        </WhyArea>

        <div className="cw-orb cw-orb--hp" style={{ '--arc': 1 } as CSSProperties}>
          {vitals && (
            <form
              className="cw-hpctl"
              onSubmit={(e) => {
                e.preventDefault()
                apply('damage')
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
              <span className="cw-hpseg" role="group" aria-label="Хиты">
                <button type="submit" className="cw-hpseg-btn is-dmg" title="Нанести урон (Enter)" aria-label="Нанести урон" disabled={busy}>
                  <Swords aria-hidden="true" />
                </button>
                <button type="button" className="cw-hpseg-btn is-heal" onClick={() => apply('heal')} title="Вылечить" aria-label="Вылечить" disabled={busy}>
                  <Heart aria-hidden="true" />
                </button>
                <button type="button" className="cw-hpseg-btn is-temp" onClick={() => apply('temp')} title="Временные хиты" aria-label="Временные хиты" disabled={busy}>
                  <ShieldPlus aria-hidden="true" />
                </button>
              </span>
              {stage?.damageTypes && stage.damageTypes.length > 0 && (
                <select
                  className="cw-hpctl-type"
                  value={dmgType}
                  onChange={(e) => setDmgType(e.target.value)}
                  aria-label="Тип урона"
                  title="Тип урона: сопротивления и иммунитеты учтутся"
                >
                  <option value="">тип урона</option>
                  {stage.damageTypes.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
            </form>
          )}

          <div className="cw-hpwrap">
            <div className={`cw-hphex is-${tone}`} style={{ '--fill': `${ratio * 100}%` } as CSSProperties}>
              <span className="cw-hphex-in">
                <span className="cw-hphex-liquid" />
              </span>
              {dying && stage ? (
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
                          disabled={!vitals || busy}
                          aria-label={`${kind === 'successes' ? 'успехи' : 'провалы'}: ${n}`}
                        />
                      ))}
                    </span>
                  ))}
                  {vitals && (
                    <button type="button" className="cw-hphex-roll" onClick={() => void rollDeathSave()} disabled={roller.rolling || busy}>
                      спасбросок
                    </button>
                  )}
                </span>
              ) : (
                <span className="cw-hphex-value">
                  <b key={hp.current}>{hp.current}</b>
                  {!form && why.has('char.hp.max') ? (
                    <button
                      type="button"
                      className="cw-hphex-max is-why"
                      onClick={(e) => why.open(e.currentTarget, { path: 'char.hp.max', title: 'Максимум хитов', total: hp.max, baseLabel: 'Кости хитов' })}
                      title="Откуда это число"
                    >
                      из {hp.max}
                    </button>
                  ) : (
                    <i>из {hp.max}</i>
                  )}
                </span>
              )}
              {hp.temp > 0 && (
                <span className="cw-hphex-temp" title="Временные хиты">
                  +{hp.temp}
                </span>
              )}
            </div>
            {form && (
              <span className="cw-hphex-own" title="Свои хиты — вернутся, когда облик спадёт">
                <PawPrint aria-hidden="true" /> {form.name} · свои {combat.hit_points.current}/{combat.hit_points.max}
              </span>
            )}
            {stage?.onHpJournal && (
              <button type="button" className="cw-hphex-log" onClick={stage.onHpJournal} title="Журнал хитов: урон, лечение, отдых">
                <ScrollText aria-hidden="true" /> журнал хитов
              </button>
            )}
          </div>
        </div>

        <div className="cw-orb cw-orb--hd" style={{ '--arc': 0 } as CSSProperties}>
          <span className="cw-orb-text">
            <b>Кости хитов</b>
            <i>
              {combat.hit_dice.remaining} из {level} · {formatDice(combat.hit_dice.total)}
            </i>
          </span>
          <button
            type="button"
            className="cw-hd-die"
            onClick={stage?.onShortRest}
            disabled={!stage?.onShortRest || busy || combat.hit_dice.remaining <= 0}
            title="Короткий отдых: потратить кости хитов"
          >
            <DieImage type={hitDieType(hitDie)} size={46} />
            <Coffee className="cw-hd-die-ico" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ---------- центр: портрет и имя ---------- */}
      <div className="cw-hstage-center">
        <HeroArt src={portrait ?? fallbackPortrait} crop={crop} onEdit={form ? undefined : onPortraitClick} />
        {form && (
          <span className="cw-form-badge">
            <PawPrint aria-hidden="true" /> Дикий облик: {form.name}
            {form.onRevert && (
              <button type="button" className="cw-mini-btn" onClick={form.onRevert} disabled={busy}>
                выйти
              </button>
            )}
          </span>
        )}
        <h1 className="cw-plate-name gold-text">{info.name}</h1>
      </div>

      {/* ---------- справа: ход, движение, мастерство, вдохновение ---------- */}
      <div className="cw-hstage-side cw-hstage-right">
        <button
          type="button"
          className="cw-orb cw-orb--r is-roll"
          style={{ '--arc': 0 } as CSSProperties}
          onClick={() => void roller.rollD20('Инициатива', combat.initiative, undefined, { kind: 'init' })}
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
          <WhyDot req={{ path: 'char.init', title: 'Инициатива', total: combat.initiative, baseLabel: 'Ловкость' }} />
        </button>
        <WhyArea path="char.speed.walk" title="Скорость" total={combat.speed} baseLabel="Раса" className="cw-orb cw-orb--r" style={{ '--arc': 1 } as CSSProperties}>
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
        </WhyArea>
        <WhyArea path="char.pb" title="Бонус мастерства" total={sheet.proficiency_bonus} baseLabel="По уровню" className="cw-orb cw-orb--r" style={{ '--arc': 1 } as CSSProperties}>
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
        </WhyArea>
        <div className={`cw-orb cw-orb--r cw-orb--insp${inspiration > 0 ? ' is-on' : ''}`} style={{ '--arc': 0 } as CSSProperties}>
          <span className="hex-badge cw-orb-hex">
            <span className="hex-badge-inner">
              <Star aria-hidden="true" />
              <b>{inspiration}</b>
            </span>
          </span>
          <span className="cw-orb-text">
            <b>Вдохновение</b>
            {vitals ? (
              <span className="cw-insp-ctl">
                <button
                  type="button"
                  onClick={() => vitals('inspiration', -1)}
                  disabled={inspiration <= 0 || busy}
                  title="Потратить вдохновение"
                  aria-label="Потратить вдохновение"
                >
                  <Minus aria-hidden="true" />
                </button>
                <button type="button" onClick={() => vitals('inspiration', 1)} disabled={busy} title="Получить вдохновение" aria-label="Получить вдохновение">
                  <Plus aria-hidden="true" />
                </button>
              </span>
            ) : (
              <i>{inspiration > 0 ? 'есть' : 'нет'}</i>
            )}
          </span>
        </div>
      </div>

      {/* ---------- лента под сценой: раса · класс · подкласс · уровень ---------- */}
      <div className="cw-hstage-foot">
        <div className="cw-ribbon">
          <span className="cw-ribbon-seg">{race}</span>
          <span className="cw-ribbon-dot" aria-hidden="true" />
          {info.classes.map((c, i) => (
            <span key={`${c.source ?? c.name}-${i}`} className="cw-ribbon-seg cw-ribbon-cls">
              {c.name}
              {info.classes.length > 1 && ` ${c.level}`}
              {c.subclass_name && <em>{c.subclass_name}</em>}
            </span>
          ))}
          <span className="hex-badge cw-ribbon-lvl" title="Уровень">
            <span className="hex-badge-inner">
              <b>{level}</b>
              <i>ур.</i>
            </span>
          </span>
        </div>
        {combat.conditions.length > 0 && (
          <div className="cw-hstage-conds" aria-label="Состояния">
            {combat.conditions.map((c) => (
              <span key={c} className="cw-hstage-cond">
                <TriangleAlert aria-hidden="true" /> {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
