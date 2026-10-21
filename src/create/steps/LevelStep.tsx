/**
 * Шаг «Уровень» — до какой ступени дойти. Дорога из 20 узлов, разбитая на
 * четыре ступени игры (PHB); под узлами — вехи класса: подкласс, усиления,
 * новые круги заклинаний и рост бонуса мастерства. Прокачка всё равно пойдёт
 * по одному уровню, здесь игрок лишь выбирает цель и видит, что его ждёт.
 */
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Award, Shield, Sparkles, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StepProps } from '../draft'
import { resizeLevels } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import { asiLevels, casterKind, proficiencyBonus, spellSlotsAt, subclassLevelFallback } from '../dnd5e'
import { StepHeader } from './ui'

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)

/** Ступени игры из Книги игрока */
const TIERS = [
  { from: 1, to: 4, roman: 'I', name: 'Местный герой', about: 'спасает деревни и расчищает окрестные подземелья' },
  { from: 5, to: 10, roman: 'II', name: 'Герой королевства', about: 'решает судьбы городов и целых земель' },
  { from: 11, to: 16, roman: 'III', name: 'Повелитель края', about: 'вершит дела, о которых слагают легенды' },
  { from: 17, to: 20, roman: 'IV', name: 'Властитель мира', about: 'сражается за судьбу мира и планов' },
]

type Milestone = { icon: LucideIcon; label: string; kind: string }

/** Наибольший доступный круг заклинаний на уровне */
function topCircle(kind: ReturnType<typeof casterKind>, level: number): number {
  return Math.max(0, ...Object.keys(spellSlotsAt(kind, level)).map(Number))
}

export default function LevelStep({
  draft,
  update,
  bundle,
}: StepProps & { bundle: ClassBundle | null }) {
  const className = draft.cls?.class_name ?? ''
  const level = draft.targetLevel
  const kind = casterKind(className, draft.cls?.is_caster)
  const tier = TIERS.find((t) => level >= t.from && level <= t.to) ?? TIERS[0]

  // уровень подкласса: у API он на самих подклассах, иначе таблица PHB
  const subclassLevel =
    bundle?.subs.find((s) => s.level_available != null)?.level_available ??
    subclassLevelFallback(className)

  /** Вехи по уровням: что впервые появляется на каждом */
  const milestones = useMemo(() => {
    const asi = new Set(asiLevels(className))
    const out = new Map<number, Milestone[]>()
    const add = (l: number, m: Milestone) => out.set(l, [...(out.get(l) ?? []), m])
    for (const l of LEVELS) {
      if (draft.cls && l === subclassLevel) add(l, { icon: Shield, label: 'подкласс', kind: 'sub' })
      if (asi.has(l)) add(l, { icon: Award, label: 'усиление характеристик', kind: 'asi' })
      const circle = topCircle(kind, l)
      if (circle > topCircle(kind, l - 1)) {
        add(l, { icon: Sparkles, label: `заклинания ${circle} круга`, kind: 'spell' })
      }
      if (l > 1 && proficiencyBonus(l) > proficiencyBonus(l - 1)) {
        add(l, { icon: TrendingUp, label: `бонус мастерства +${proficiencyBonus(l)}`, kind: 'pb' })
      }
    }
    return out
  }, [className, draft.cls, kind, subclassLevel])

  const asiCount = asiLevels(className).filter((l) => l <= level).length
  const circle = topCircle(kind, level)
  const pick = (l: number) => update({ targetLevel: l, levels: resizeLevels(draft.levels, l) })

  return (
    <div className="cw-step cw-path-step">
      <StepHeader title="До какой ступени подняться?" />

      {/* медальон выбранного уровня */}
      <div className="cw-path-hero">
        <span className="cw-path-medal">
          <span>
            <b key={level}>{level}</b>
            <i>уровень</i>
          </span>
        </span>
        <div className="cw-path-tier">
          <span className="cw-path-tier-roman">ступень {tier.roman}</span>
          <b className="gold-text">{tier.name}</b>
          <i>{tier.about}</i>
        </div>
      </div>

      {/* дорога: четыре ступени, узлы уровней и вехи под ними */}
      <div className="cw-path" style={{ '--fill': `${((level - 1) / 19) * 100}%` } as CSSProperties}>
        <div className="cw-path-tiers" aria-hidden="true">
          {TIERS.map((t) => (
            <span
              key={t.roman}
              className={`cw-path-tierband${t === tier ? ' is-current' : ''}`}
              style={{ gridColumn: `${t.from} / ${t.to + 1}` }}
            >
              {t.roman} · {t.name}
            </span>
          ))}
        </div>

        <div className="cw-path-track">
          <span className="cw-path-line" aria-hidden="true" />
          {LEVELS.map((l) => {
            const marks = milestones.get(l) ?? []
            const state = l === level ? ' is-active' : l < level ? ' is-passed' : ''
            return (
              <div key={l} className={`cw-path-node${state}`}>
                <button
                  type="button"
                  className="cw-path-hex"
                  onClick={() => pick(l)}
                  aria-pressed={l === level}
                  aria-label={`${l} уровень`}
                >
                  {l}
                </button>
                <span className="cw-path-marks">
                  {marks.map(({ icon: Icon, label, kind: k }) => (
                    <span key={k} className={`cw-path-mark cw-path-mark--${k}`} title={`${l} ур.: ${label}`}>
                      <Icon aria-hidden="true" />
                    </span>
                  ))}
                </span>
              </div>
            )
          })}
        </div>

        <div className="cw-path-legend" aria-label="Обозначения">
          {draft.cls && (
            <span className="cw-path-mark--sub">
              <Shield aria-hidden="true" /> подкласс
            </span>
          )}
          <span className="cw-path-mark--asi">
            <Award aria-hidden="true" /> усиление характеристик
          </span>
          {kind !== 'none' && (
            <span className="cw-path-mark--spell">
              <Sparkles aria-hidden="true" /> новый круг заклинаний
            </span>
          )}
          <span className="cw-path-mark--pb">
            <TrendingUp aria-hidden="true" /> бонус мастерства
          </span>
        </div>
      </div>

      {/* сводка строкой, без рамки */}
      <div className="cw-path-stats">
        <span>
          <b>+{proficiencyBonus(level)}</b>
          <i>бонус мастерства</i>
        </span>
        <span>
          <b>{level}</b>
          <i>{level === 1 ? 'шаг прокачки' : 'шагов прокачки'}</i>
        </span>
        <span>
          <b>{asiCount}</b>
          <i>усилений характеристик</i>
        </span>
        {draft.cls && (
          <span className={level >= subclassLevel ? '' : 'is-off'}>
            <b>{level >= subclassLevel ? 'есть' : `с ${subclassLevel}`}</b>
            <i>подкласс</i>
          </span>
        )}
        {kind !== 'none' && (
          <span className={circle ? '' : 'is-off'}>
            <b>{circle || '—'}</b>
            <i>{kind === 'pact' ? 'круг ячеек договора' : 'высший круг заклинаний'}</i>
          </span>
        )}
      </div>
    </div>
  )
}
