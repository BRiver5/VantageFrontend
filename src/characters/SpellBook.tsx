/**
 * Книга заклинаний листа. Сверху — магические числа и ячейки: у каждого круга
 * своё созвездие, ячейка — звезда, потраченная гаснет. Ниже — карточки
 * заклинаний по кругам; клик
 * открывает попап с описанием, и уже там заклинание сотворяется: заговор —
 * свободно, расовое — раз до отдыха, остальное — ячейкой выбранного круга
 * (можно и выше — усиленное), ритуал — без ячейки.
 */
import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { BookOpen, Dices, Eye, Hourglass, Sparkles, Star, Target, Timer, Wand2 } from 'lucide-react'
import type { Spell } from '../api'
import { useCatalogList } from '../create/useCatalog'
import { FactChip } from '../create/steps/ui'
import { normSpellName } from '../spellIndex'
import { SpellSchoolMark, spellSchoolIcon } from '../spellSchools'
import { RichText } from '../terms/terms'
import { ABILITY_LABELS } from '../types/character'
import type { Spellcasting } from '../types/character'
import { SheetModal } from './SheetModal'
import type { SheetPlay, SheetRoller } from './sheetPlay'

type Known = Spellcasting['spells_known'][number]

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const circleName = (n: number) => (n === 0 ? 'Заговоры' : `${n} круг`)

/** Дарованное ли заклинание: snapshot отмечает расу или подкласс */
function grantedOrigin(sp: Known): 'race' | 'subclass' | null {
  const g = (sp.snapshot as { granted?: string } | null)?.granted
  return g === 'race' || g === 'subclass' ? g : null
}

/* ---------- созвездия ячеек ---------- */

/**
 * Узор созвездия для каждого круга (в долях поля 100 × 60): ковш, зигзаг,
 * корона, арка, ромб… Ячеек меньше, чем точек, — берутся первые, и фигура
 * растягивается на всё поле. Ромб пятого круга замыкается.
 */
const SKY: Record<number, [number, number][]> = {
  1: [[10, 46], [32, 30], [56, 36], [86, 12]],
  2: [[10, 14], [36, 44], [62, 18], [90, 44]],
  3: [[10, 40], [30, 14], [54, 32], [88, 10]],
  4: [[12, 48], [26, 16], [64, 10], [88, 40]],
  5: [[50, 6], [88, 30], [50, 54], [12, 30]],
  6: [[14, 48], [50, 10], [86, 48], [50, 32]],
  7: [[10, 28], [36, 10], [62, 46], [90, 26]],
  8: [[20, 44], [70, 14], [44, 22], [90, 50]],
  9: [[50, 30], [16, 12], [84, 12], [50, 56]],
}
const CLOSED = new Set([5])
// пыль на фоне — у каждого круга своя, неподвижная
const DUST: [number, number][] = [[6, 8], [22, 54], [44, 4], [70, 56], [94, 6], [80, 30], [4, 34], [60, 8]]

const STAR = 'M0,-7 C0.9,-1.4 1.4,-0.9 7,0 C1.4,0.9 0.9,1.4 0,7 C-0.9,1.4 -1.4,0.9 -7,0 C-1.4,-0.9 -0.9,-1.4 0,-7 Z'

function skyPoints(circle: number, n: number): [number, number][] {
  if (n <= 0) return []
  if (n === 1) return [[50, 30]]
  const base = SKY[circle] ?? SKY[1]
  const pts =
    n <= base.length
      ? base.slice(0, n)
      : Array.from({ length: n }, (_, i): [number, number] => [10 + (i * 80) / (n - 1), 30 + Math.sin(i * 1.7) * 18])
  // вписать фигуру в поле с отступами
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return pts.map(([x, y]) => [
    x1 > x0 ? 12 + ((x - x0) / (x1 - x0)) * 76 : 50,
    y1 > y0 ? 10 + ((y - y0) / (y1 - y0)) * 40 : 30,
  ])
}

/** Созвездие круга: горящие звёзды — свободные ячейки; клик тратит или возвращает */
function Constellation({
  circle,
  max,
  used,
  locked = false,
  onToggle,
}: {
  circle: number
  max: number
  used: number
  /** ячейки меняет сервер — звёзды только показывают */
  locked?: boolean
  onToggle: (spent: boolean) => void
}) {
  const pts = skyPoints(circle, max)
  // used < 0 — ячейки сверх максимума (очки чародейства): все звёзды горят
  const lit = (i: number) => i < max - used
  const edges = pts.slice(1).map((_, i) => [i, i + 1] as const)
  if (CLOSED.has(circle) && pts.length >= 4) edges.push([pts.length - 1, 0] as const)
  const left = max - used
  const key = (spent: boolean) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle(spent)
    }
  }

  return (
    <div className={`cw-sky${left === 0 ? ' is-empty' : ''}${locked ? ' is-locked' : ''}${left > max ? ' is-over' : ''}`}>
      <svg viewBox="0 0 100 60" aria-label={`${circle} круг: ${left} из ${max} ячеек`}>
        <g className="cw-sky-dust" aria-hidden="true">
          {DUST.map(([x, y], i) => (
            <circle key={i} cx={(x + circle * 13) % 100} cy={y} r={i % 3 === 0 ? 0.7 : 0.45} />
          ))}
        </g>
        {edges.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            className={`cw-sky-edge${lit(a) && lit(b) ? '' : ' is-off'}`}
            x1={pts[a][0]}
            y1={pts[a][1]}
            x2={pts[b][0]}
            y2={pts[b][1]}
          />
        ))}
        {pts.map(([x, y], i) => {
          const spent = !lit(i)
          return (
            <g
              key={i}
              className={`cw-star${spent ? ' is-spent' : ''}`}
              transform={`translate(${x} ${y})`}
              role={locked ? undefined : 'button'}
              tabIndex={locked ? undefined : 0}
              aria-label={locked ? undefined : `${circle} круг: ${spent ? 'вернуть' : 'потратить'} ячейку`}
              onClick={locked ? undefined : () => onToggle(spent)}
              onKeyDown={locked ? undefined : key(spent)}
              style={{ '--twinkle': `${(i * 0.73 + circle * 0.41) % 3}s` } as CSSProperties}
            >
              <title>{locked ? (spent ? 'Потрачена' : 'Свободна') : spent ? 'Вернуть ячейку' : 'Потратить ячейку'}</title>
              <circle className="cw-star-hit" r="9" />
              <circle className="cw-star-ring" r="3.2" />
              <path className="cw-star-flare" d={STAR} />
              <circle className="cw-star-core" r="1.7" />
            </g>
          )
        })}
      </svg>
      <span className="cw-sky-cap">
        <b>{ROMAN[circle] ?? circle}</b>
        <i>
          {left}/{max}
        </i>
      </span>
    </div>
  )
}

function SchoolGlyph({ school, className }: { school: string | null | undefined; className?: string }) {
  const src = spellSchoolIcon(school)
  return src ? <img className={className} src={src} alt="" draggable={false} /> : <Sparkles className={className} aria-hidden="true" />
}

export function SpellBook({
  spellcasting: sc,
  play,
  roller,
}: {
  spellcasting: Spellcasting
  play: SheetPlay
  roller: SheetRoller
}) {
  const { slotsUsed, setSlotsUsed, racialUsed, setRacialUsed, slotsLocked = false } = play
  const [open, setOpen] = useState<Known | null>(null)
  const { items: catalog } = useCatalogList<Spell>('spells', sc.spells_known.length > 0)
  const lookup = useMemo(() => {
    const byId = new Map(catalog.map((s) => [s.id, s]))
    const byName = new Map(catalog.map((s) => [normSpellName(s.spell_name), s]))
    return (sp: Known): Spell | null =>
      byId.get((sp.snapshot as { spell_id?: string } | null)?.spell_id ?? '') ?? byName.get(normSpellName(sp.name)) ?? null
  }, [catalog])

  const slotCircles = Object.entries(sc.spell_slots)
    .map(([c, s]) => ({ circle: Number(c), max: s.max, used: Math.min(s.max, slotsUsed[c] ?? 0) }))
    .filter((s) => s.max > 0)
    .sort((a, b) => a.circle - b.circle)

  const byCircle = new Map<number, Known[]>()
  for (const sp of [...sc.spells_known].sort(
    (a, b) => Number(b.prepared) - Number(a.prepared) || a.name.localeCompare(b.name, 'ru'),
  )) {
    byCircle.set(sp.level, [...(byCircle.get(sp.level) ?? []), sp])
  }
  const circles = [...new Set([...byCircle.keys(), ...slotCircles.map((s) => s.circle)])].sort((a, b) => a - b)

  /** Клик по кристаллу: свободный — потратить, потраченный — восстановить */
  const toggleSlot = (circle: number, spent: boolean) =>
    setSlotsUsed((prev) => {
      const key = String(circle)
      const max = sc.spell_slots[key]?.max ?? 0
      const cur = prev[key] ?? 0
      return { ...prev, [key]: Math.max(0, Math.min(max, cur + (spent ? -1 : 1))) }
    })

  const left = (circle: number) => {
    const s = slotCircles.find((x) => x.circle === circle)
    return s ? s.max - s.used : 0
  }

  const castWith = (sp: Known, how: 'free' | 'racial' | 'ritual' | number) => {
    if (how === 'free') roller.note('◈', `Заговор: ${sp.name}`)
    else if (how === 'racial') {
      setRacialUsed((prev) => new Set(prev).add(sp.name))
      roller.note('✦', `${sp.name} · расовая магия`)
    } else if (how === 'ritual') roller.note('Р', `${sp.name} · ритуалом`)
    else {
      setSlotsUsed((prev) => ({ ...prev, [String(how)]: (prev[String(how)] ?? 0) + 1 }))
      roller.note(ROMAN[how] ?? String(how), `${sp.name}${how > sp.level ? ` · усилено до ${how} круга` : ''}`)
    }
    setOpen(null)
  }

  return (
    <div className="cw-book">
      {/* ---------- числа и ячейки — одной строкой, без рамки ---------- */}
      {(sc.is_spellcaster || slotCircles.length > 0) && (
        <div className="cw-book-top">
          {sc.is_spellcaster && (
            <div className="cw-bstats">
              <span className="cw-bstat cw-bstat--word">
                <i>базовая</i>
                <b>{sc.spellcasting_ability ? ABILITY_LABELS[sc.spellcasting_ability].label : '—'}</b>
              </span>
              <span className="cw-bstat">
                <i>Сл спасброска</i>
                <b>{sc.spell_save_dc ?? '—'}</b>
              </span>
              <button
                type="button"
                className="cw-bstat is-roll"
                onClick={() => void roller.rollD20('Атака заклинанием', sc.spell_attack_bonus ?? 0)}
                disabled={roller.rolling || sc.spell_attack_bonus == null}
                title="Бросок атаки заклинанием"
              >
                <i>атака</i>
                <b>
                  {signed(sc.spell_attack_bonus ?? 0)}
                  <Dices aria-hidden="true" />
                </b>
              </button>
            </div>
          )}

          {slotCircles.length > 0 && (
            <div className="cw-slot-rail" aria-label="Ячейки заклинаний">
              {slotCircles.map((s) => (
                <Constellation
                  key={s.circle}
                  circle={s.circle}
                  max={s.max}
                  used={s.used}
                  locked={slotsLocked}
                  onToggle={(spent) => toggleSlot(s.circle, spent)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- карточки по кругам ---------- */}
      {circles.map((circle) => {
        const list = byCircle.get(circle) ?? []
        return (
          <section key={circle} className="cw-book-circle">
            <header className="cw-book-circle-head">
              <span className="cw-book-circle-num">{circle === 0 ? '◈' : ROMAN[circle]}</span>
              <b>{circleName(circle)}</b>
              {circle > 0 && sc.spell_slots[String(circle)]?.max ? (
                <i>
                  ячеек {left(circle)} из {sc.spell_slots[String(circle)].max}
                </i>
              ) : null}
              <span className="cw-book-circle-line" aria-hidden="true" />
            </header>
            {list.length > 0 ? (
              <div className="cw-book-grid">
                {list.map((sp) => {
                  const data = lookup(sp)
                  const origin = grantedOrigin(sp)
                  const spent = origin === 'race' && racialUsed.has(sp.name)
                  return (
                    <button
                      key={sp.name}
                      type="button"
                      className={`cw-scard${sp.prepared ? '' : ' is-unprepared'}${origin ? ` is-${origin}` : ''}${spent ? ' is-spent' : ''}`}
                      onClick={() => setOpen(sp)}
                    >
                      <SpellSchoolMark school={data?.school} className="cw-scard-mark" />
                      <span className="cw-scard-glyph">
                        <SchoolGlyph school={data?.school} />
                      </span>
                      <span className="cw-scard-body">
                        <b>{sp.name}</b>
                        <i>{[data?.casting_time, data?.range].filter(Boolean).join(' · ') || data?.school || ' '}</i>
                      </span>
                      <span className="cw-scard-tags">
                        {data?.concentration && <em title="Концентрация">К</em>}
                        {data?.ritual && <em title="Ритуал">Р</em>}
                        {origin && <em className="is-origin">{origin === 'race' ? 'раса' : 'подкласс'}</em>}
                        {!sp.prepared && <em className="is-off">не подготовлено</em>}
                        {spent && <em className="is-off">использовано</em>}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="cw-field-note">Заклинаний этого круга нет.</p>
            )}
          </section>
        )
      })}

      {open && (
        <SpellModal
          sp={open}
          data={lookup(open)}
          sc={sc}
          slotsLeft={left}
          racialSpent={racialUsed.has(open.name)}
          slotsLocked={slotsLocked}
          roller={roller}
          onCast={(how) => castWith(open, how)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function SpellModal({
  sp,
  data,
  sc,
  slotsLeft,
  racialSpent,
  slotsLocked,
  roller,
  onCast,
  onClose,
}: {
  sp: Known
  data: Spell | null
  sc: Spellcasting
  slotsLeft: (circle: number) => number
  racialSpent: boolean
  slotsLocked: boolean
  roller: SheetRoller
  onCast: (how: 'free' | 'racial' | 'ritual' | number) => void
  onClose: () => void
}) {
  const origin = grantedOrigin(sp)
  const text = `${data?.description ?? ''}\n${data?.higher_levels ?? ''}`
  const attack = /атак\S*\s+заклинани/i.test(text)
  const save = /спасбросок|спасброск/i.test(text)
  // первая формула урона/лечения в описании — «3к10», «1к4 + 4»
  const dmg = /(\d+)\s*к\s*(\d+)(?:\s*([+\-−])\s*(\d+))?/i.exec(data?.description ?? '')
  const formula = dmg ? `${dmg[1]}к${dmg[2]}${dmg[3] ? `${dmg[3]}${dmg[4]}` : ''}` : null
  const comps = [data?.components?.verbal && 'В', data?.components?.somatic && 'С', data?.components?.material && 'М']
    .filter(Boolean)
    .join(', ')
  // ячейки этого круга и выше — сотворить можно и усиленным
  const options = Object.entries(sc.spell_slots)
    .map(([c, s]) => ({ circle: Number(c), max: s.max, left: slotsLeft(Number(c)) }))
    .filter((o) => o.max > 0 && o.circle >= sp.level)
    .sort((a, b) => a.circle - b.circle)
  const firstFree = options.find((o) => o.left > 0)?.circle

  let cast: ReactNode
  if (!sp.prepared) {
    cast = <span className="cw-field-note">Не подготовлено — подготовьте после продолжительного отдыха.</span>
  } else if (sp.level === 0) {
    cast = (
      <button type="button" className="cs-btn cw-next" onClick={() => onCast('free')}>
        <Wand2 aria-hidden="true" /> Сотворить
      </button>
    )
  } else if (origin === 'race') {
    cast = (
      <button type="button" className="cs-btn cw-next" onClick={() => onCast('racial')} disabled={racialSpent}>
        <Wand2 aria-hidden="true" /> {racialSpent ? 'Использовано до отдыха' : 'Сотворить · раз до отдыха'}
      </button>
    )
  } else {
    cast = (
      <span className="cw-cast-opts">
        {slotsLocked && (
          <span className="cw-field-note">Ячейки тратятся действиями способностей на листе; вернуть их — отдыхом.</span>
        )}
        {!slotsLocked && options.length === 0 && <span className="cw-field-note">Нет ячеек подходящего круга.</span>}
        {!slotsLocked && options.map((o) => (
          <button
            key={o.circle}
            type="button"
            className={`cw-cast-opt${o.circle === firstFree ? ' is-main' : ''}`}
            onClick={() => onCast(o.circle)}
            disabled={o.left === 0}
            title={o.circle > sp.level ? 'Усиленное — ячейкой выше' : 'Сотворить'}
          >
            <span className="cw-cast-opt-num">{ROMAN[o.circle]}</span>
            <span>
              <b>{o.circle > sp.level ? 'Усилить' : 'Сотворить'}</b>
              <i>
                {o.circle} круг · {o.left}/{o.max}
              </i>
            </span>
          </button>
        ))}
        {data?.ritual && (
          <button type="button" className="cw-cast-opt" onClick={() => onCast('ritual')} title="Без ячейки, на 10 минут дольше">
            <span className="cw-cast-opt-num">Р</span>
            <span>
              <b>Ритуалом</b>
              <i>без ячейки</i>
            </span>
          </button>
        )}
      </span>
    )
  }

  return (
    <SheetModal
      title={sp.name}
      kicker={[sp.level === 0 ? 'заговор' : `${sp.level} круг`, data?.school, origin === 'race' ? 'расовая магия' : origin === 'subclass' ? 'от подкласса' : null]
        .filter(Boolean)
        .join(' · ')}
      tone="magic"
      visual={<SchoolGlyph school={data?.school} className="cw-smodal-glyph" />}
      onClose={onClose}
      facts={
        data && (
          <>
            {data.casting_time && <FactChip icon={Hourglass}>{data.casting_time}</FactChip>}
            {data.range && <FactChip icon={Target}>{data.range}</FactChip>}
            {data.duration && <FactChip icon={Timer}>{data.duration}</FactChip>}
            {comps && <FactChip>{comps}</FactChip>}
            {data.concentration && <FactChip icon={Eye}>концентрация</FactChip>}
            {data.ritual && <FactChip icon={Star}>ритуал</FactChip>}
            {save && sc.spell_save_dc != null && <FactChip icon={BookOpen}>Сл {sc.spell_save_dc}</FactChip>}
          </>
        )
      }
      actions={
        <>
          {attack && sc.spell_attack_bonus != null && (
            <button
              type="button"
              className="cw-mini-btn"
              onClick={() => void roller.rollD20(`${sp.name}, атака`, sc.spell_attack_bonus!, `spell-${sp.name}`)}
              disabled={roller.rolling}
            >
              <Dices aria-hidden="true" /> атака {signed(sc.spell_attack_bonus)}
            </button>
          )}
          {formula && (
            <button
              type="button"
              className="cw-mini-btn"
              onClick={() => void roller.rollDamage(`${sp.name}`, formula, `spell-${sp.name}`)}
              disabled={roller.rolling}
            >
              <Dices aria-hidden="true" /> {formula}
            </button>
          )}
          <span className="cw-smodal-spacer" />
          {cast}
        </>
      }
    >
      {data ? (
        <>
          {data.material_components && <p className="cw-field-note">Материальные компоненты: {data.material_components}</p>}
          <RichText text={data.description} />
          {data.higher_levels && (
            <div className="cw-smodal-higher">
              <b>На больших уровнях</b>
              <RichText text={data.higher_levels} />
            </div>
          )}
        </>
      ) : (
        <p className="cw-field-note">Описание заклинания не найдено в каталоге.</p>
      )}
    </SheetModal>
  )
}
