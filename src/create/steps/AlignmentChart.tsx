/**
 * Схема мировоззрений: квадрат, разделённый на девять областей — четыре
 * «лепестка» по углам, полосы нейтральности между ними и восьмиугольник
 * истинной нейтральности в центре. Открывается попапом с кнопки.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface AlignmentInfo {
  name: string
  abbr: string
  about: string
}

export const ALIGNMENTS: Record<string, AlignmentInfo> = {
  lg: { name: 'Законопослушный добрый', abbr: 'ЗД', about: 'Поступает правильно и так, как того ждёт общество: честь, долг и сострадание.' },
  ng: { name: 'Нейтральный добрый', abbr: 'НД', about: 'Делает лучшее, что может, помогая другим, — без оглядки на законы и бунт.' },
  cg: { name: 'Хаотичный добрый', abbr: 'ХД', about: 'Следует совести, а не чужим ожиданиям: добр, но свободолюбив и своенравен.' },
  ln: { name: 'Законопослушный нейтральный', abbr: 'ЗН', about: 'Живёт по закону, традиции или личному кодексу — порядок важнее добра и зла.' },
  n: { name: 'Истинно нейтральный', abbr: 'Н', about: 'Избегает крайностей и чужих споров о морали, держится середины.' },
  cn: { name: 'Хаотичный нейтральный', abbr: 'ХН', about: 'Следует своим прихотям и ценит свободу превыше всего остального.' },
  le: { name: 'Законопослушный злой', abbr: 'ЗЗ', about: 'Методично берёт желаемое в рамках традиции, верности или порядка.' },
  ne: { name: 'Нейтральный злой', abbr: 'НЗ', about: 'Делает всё, что сойдёт с рук, без жалости и без лишних угрызений.' },
  ce: { name: 'Хаотичный злой', abbr: 'ХЗ', about: 'Действует со злобой и жестокостью, движимый жадностью, ненавистью или жаждой крови.' },
}

const BY_NAME = new Map(Object.values(ALIGNMENTS).map((a) => [a.name, a]))

export function alignmentAbbr(name: string): string | null {
  return BY_NAME.get(name)?.abbr ?? null
}

/* Формы областей в квадрате 500×500. Центр — восьмиугольник с вершинами на
   206/232/268/294; кривые выходят из середин его скошенных граней (219,219). */
const PETAL = 'M0,0 L180,0 C185,150 205,205 219,219 C205,205 150,185 0,180 Z'
const STRIP = 'M180,0 L320,0 C315,150 295,205 281,219 L268,206 L232,206 L219,219 C205,205 185,150 180,0 Z'
const BAND = 'M0,180 C150,185 205,205 219,219 L206,232 L206,268 L219,281 C205,295 150,315 0,320 Z'
const OCTAGON = 'M232,206 L268,206 L294,232 L294,268 L268,294 L232,294 L206,268 L206,232 Z'

const FLIP_X = 'matrix(-1 0 0 1 500 0)'
const FLIP_Y = 'matrix(1 0 0 -1 0 500)'
const FLIP_XY = 'matrix(-1 0 0 -1 500 500)'

const REGIONS: { key: keyof typeof ALIGNMENTS; d: string; transform?: string }[] = [
  { key: 'lg', d: PETAL },
  { key: 'cg', d: PETAL, transform: FLIP_X },
  { key: 'le', d: PETAL, transform: FLIP_Y },
  { key: 'ce', d: PETAL, transform: FLIP_XY },
  { key: 'ng', d: STRIP },
  { key: 'ne', d: STRIP, transform: FLIP_Y },
  { key: 'ln', d: BAND },
  { key: 'cn', d: BAND, transform: FLIP_X },
  { key: 'n', d: OCTAGON },
]

/** Подписи: [x, y, поворот] для каждой области */
const LABELS: Record<string, [number, number, number]> = {
  lg: [96, 104, 0],
  cg: [404, 104, 0],
  le: [96, 404, 0],
  ce: [404, 404, 0],
  ln: [100, 250, 0],
  cn: [400, 250, 0],
  ng: [250, 100, -90],
  ne: [250, 400, -90],
  n: [250, 250, 0],
}

const CORNERS: [string, number, number, 'start' | 'end'][] = [
  ['Святой', 14, 26, 'start'],
  ['Блаженный', 486, 26, 'end'],
  ['Дьявольский', 14, 486, 'start'],
  ['Демонический', 486, 486, 'end'],
]

export function AlignmentChart({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (name: string) => void
  onClose: () => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const current = BY_NAME.get(value) ?? null
  const shown = hover ? ALIGNMENTS[hover] : current

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="cw-modal-layer" onClick={onClose}>
      <div
        className="cw-modal cw-align-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Мировоззрение"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cw-modal-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
        <div className="cw-modal-scroll">
          <h3 className="cw-modal-title gold-text">Мировоззрение</h3>
          <div className="cw-align-chart-wrap">
            <svg className="cw-align-chart" viewBox="0 0 500 500" role="radiogroup" aria-label="Схема мировоззрений">
              <rect className="cw-align-frame" x="1" y="1" width="498" height="498" />
              {REGIONS.map(({ key, d, transform }) => {
                const a = ALIGNMENTS[key]
                const on = value === a.name
                return (
                  <path
                    key={key}
                    d={d}
                    transform={transform}
                    className={`cw-align-region${on ? ' is-on' : ''}${hover === key ? ' is-hover' : ''}`}
                    role="radio"
                    aria-checked={on}
                    aria-label={a.name}
                    tabIndex={0}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(key)}
                    onBlur={() => setHover(null)}
                    onClick={() => onChange(a.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onChange(a.name)
                      }
                    }}
                  />
                )
              })}
              {Object.entries(LABELS).map(([key, [x, y, rot]]) => {
                const a = ALIGNMENTS[key]
                const words = a.name.split(' ')
                const on = value === a.name
                return (
                  <g
                    key={key}
                    className={`cw-align-text${on ? ' is-on' : ''}`}
                    transform={`translate(${x} ${y}) rotate(${rot})`}
                    aria-hidden="true"
                  >
                    {key === 'n' ? (
                      <text className="cw-align-abbr" y="7">Н</text>
                    ) : rot ? (
                      <text className="cw-align-name" y="5">{a.name}</text>
                    ) : (
                      <>
                        <text className="cw-align-abbr" y="-6">{a.abbr}</text>
                        {words.map((w, i) => (
                          <text key={w} className="cw-align-name" y={14 + i * 15}>
                            {w}
                          </text>
                        ))}
                      </>
                    )}
                  </g>
                )
              })}
              {CORNERS.map(([label, x, y, anchor]) => (
                <text key={label} className="cw-align-corner" x={x} y={y} textAnchor={anchor} aria-hidden="true">
                  {label}
                </text>
              ))}
            </svg>
          </div>
          <div className="cw-align-about">
            {shown ? (
              <>
                <b>{shown.name}</b>
                <p>{shown.about}</p>
              </>
            ) : (
              <p>Наведите на область схемы, чтобы прочитать о мировоззрении, и нажмите, чтобы выбрать.</p>
            )}
          </div>
        </div>
        <footer className="cw-modal-foot">
          {value && (
            <button type="button" className="cs-btn cs-btn--ghost" onClick={() => onChange('')}>
              Без мировоззрения
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
