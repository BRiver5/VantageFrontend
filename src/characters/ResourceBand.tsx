/**
 * Ресурсы класса — ярость, дикий облик, ци, очки чародейства, кости
 * превосходства — крупной полосой под сценой героя. Каждый — карточка с
 * кольцом заряда и большим числом, значком восстановления и зарядами-кружками;
 * включённое состояние (ярость идёт) светится. Клик — карточка способности,
 * там же кнопки «Начать ярость» и т.п.
 */
import type { CSSProperties } from 'react'
import { Coffee, Infinity as InfinityIcon, Moon, Sun, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SheetResource } from '../types/character'

const RECHARGE: Record<string, { icon: LucideIcon; label: string }> = {
  'rest.short': { icon: Coffee, label: 'короткий отдых' },
  short_rest: { icon: Coffee, label: 'короткий отдых' },
  'rest.long': { icon: Moon, label: 'продолжительный отдых' },
  long_rest: { icon: Moon, label: 'продолжительный отдых' },
  dawn: { icon: Sun, label: 'рассвет' },
  'turn.start': { icon: Timer, label: 'начало хода' },
}

/** Кольцо заряда: доля текущего от максимума — длиной дуги */
function Ring({ ratio }: { ratio: number }) {
  const r = 30
  const len = 2 * Math.PI * r
  return (
    <svg className="rb-ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle className="rb-ring-track" cx="36" cy="36" r={r} />
      <circle
        className="rb-ring-fill"
        cx="36"
        cy="36"
        r={r}
        style={{ strokeDasharray: len, strokeDashoffset: len * (1 - ratio) } as CSSProperties}
      />
    </svg>
  )
}

export function ResourceBand({
  resources,
  activeKeys,
  onOpen,
}: {
  resources: SheetResource[]
  /** включённые состояния (state.<ключ>.active): у ярости ключ ресурса и состояния один */
  activeKeys: Set<string>
  /** открыть карточку способности, объявившей ресурс */
  onOpen?: (slug: string) => void
}) {
  if (resources.length === 0) return null
  return (
    <div className="rb" role="list" aria-label="Ресурсы класса">
      {resources.map((r) => {
        const unlimited = r.max >= 99
        const ratio = unlimited ? 1 : r.max > 0 ? Math.max(0, Math.min(1, r.current / r.max)) : 0
        const rech = r.recharge.map((x) => RECHARGE[x]).filter(Boolean)
        // сервер сам связывает ресурс с состоянием своей способности; старый лист — по совпадению ключей
        const on = r.active ?? activeKeys.has(r.key)
        return (
          <button
            key={r.key}
            type="button"
            role="listitem"
            className={`rb-card${r.current <= 0 && !unlimited ? ' is-empty' : ''}${on ? ' is-active' : ''}`}
            onClick={onOpen ? () => onOpen(r.declared_by) : undefined}
            title={rech.length ? `Восстановление: ${rech.map((x) => x.label).join(', ')}` : undefined}
          >
            <span className="rb-dial">
              <Ring ratio={ratio} />
              <span className="rb-num">
                {unlimited ? <InfinityIcon aria-label="без ограничений" /> : <b key={r.current}>{r.current}</b>}
                {!unlimited && <i>из {r.max}</i>}
              </span>
            </span>
            <span className="rb-text">
              <b>{r.label}</b>
              {!unlimited && r.max > 0 && r.max <= 6 && (
                <span className="rb-pips" aria-hidden="true">
                  {Array.from({ length: r.max }, (_, i) => (
                    <i key={i} className={i < r.current ? 'is-on' : ''} />
                  ))}
                </span>
              )}
              <span className="rb-rech">
                {rech.map(({ icon: Icon, label }) => (
                  <Icon key={label} aria-label={label} />
                ))}
                {on && <em>активно</em>}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
