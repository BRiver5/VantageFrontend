/**
 * Раздел «Все значения» (режим разработчика): каждая величина листа, как её считает движок,
 * и ручное значение поверх. Число, да/нет, текст или JSON — по типу текущего значения.
 */
import { useMemo, useState } from 'react'
import { RotateCcw, Wrench } from 'lucide-react'
import type { Sheet } from '../../../types/character'
import { EdSection } from '../../editorFields'

type Props = {
  sheet: Sheet
  labels: Record<string, string>
  overrides: Record<string, unknown>
  manual: Record<string, unknown>
  setManual: (path: string, value: unknown) => void
}

/** пути, которые сервер разрешает переписать */
const OVERRIDABLE = /^(char|slots|res|var)\.[A-Za-z0-9_.]+$/
const PAGE = 60

const show = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? '')

/** текст поля → значение того же типа, что у вычисленного; undefined — не разобрать */
function parse(text: string, like: unknown): unknown {
  const t = text.trim()
  if (typeof like === 'number') return t !== '' && Number.isFinite(Number(t)) ? Number(t) : undefined
  if (typeof like === 'string') return text
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}

export function ValuesSection({ sheet, labels, overrides, manual, setManual }: Props) {
  const [q, setQ] = useState('')
  const [onlyManual, setOnlyManual] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const effective = (path: string): unknown => (path in manual ? manual[path] : overrides[path])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const paths = new Set([...Object.keys(sheet.values), ...Object.keys(overrides)])
    return [...paths]
      .filter((p) => OVERRIDABLE.test(p))
      .filter((p) => !needle || p.toLowerCase().includes(needle) || (labels[p] ?? '').toLowerCase().includes(needle))
      .filter((p) => !onlyManual || (effective(p) !== undefined && effective(p) !== null))
      .sort()
  }, [sheet.values, overrides, manual, labels, q, onlyManual])

  return (
    <EdSection
      id="values"
      icon={Wrench}
      title="Все значения"
      lead="Режим разработчика: любая величина листа вручную. Слева — путь и подпись, справа — значение. Пустое поле или ↺ возвращает расчёт."
    >
      <div className="ed-values-bar">
        <input
          className="ed-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="Путь или подпись: ac, speed, skills.stealth, Класс доспеха…"
          aria-label="Найти значение"
        />
        <label className="ed-check">
          <input type="checkbox" checked={onlyManual} onChange={(e) => setOnlyManual(e.target.checked)} /> только ручные
        </label>
      </div>
      <div className="ed-values">
        {rows.slice(0, limit).map((path) => {
          const computed = sheet.values[path]
          const ov = effective(path)
          const isManual = ov !== undefined && ov !== null
          const text = drafts[path] ?? (isManual ? show(ov) : '')
          const bad = drafts[path] !== undefined && drafts[path].trim() !== '' && parse(drafts[path], computed ?? ov) === undefined
          const commit = (raw: string) => {
            setDrafts(({ [path]: _, ...rest }) => rest)
            if (!raw.trim()) return setManual(path, overrides[path] !== undefined ? null : undefined)
            const v = parse(raw, computed ?? ov)
            if (v !== undefined) setManual(path, v)
          }
          return (
            <div key={path} className={`ed-value${isManual ? ' is-manual' : ''}`}>
              <span className="ed-value-name">
                <code>{path}</code>
                {labels[path] && <i>{labels[path]}</i>}
              </span>
              <span className="ed-value-auto" title="Расчёт листа">
                {show(computed) || '—'}
              </span>
              {typeof computed === 'boolean' ? (
                <select
                  className="ed-input"
                  value={isManual ? String(ov) : ''}
                  onChange={(e) => setManual(path, e.target.value === '' ? (overrides[path] !== undefined ? null : undefined) : e.target.value === 'true')}
                  aria-label={`Значение ${path}`}
                >
                  <option value="">авто</option>
                  <option value="true">да</option>
                  <option value="false">нет</option>
                </select>
              ) : (
                <input
                  className={`ed-input${bad ? ' is-bad' : ''}`}
                  value={text}
                  placeholder="авто"
                  onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))}
                  onBlur={(e) => commit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
                  aria-label={`Значение ${path}`}
                />
              )}
              <button
                type="button"
                className="ed-btn ed-btn--icon"
                disabled={!isManual}
                onClick={() => {
                  setDrafts(({ [path]: _, ...rest }) => rest)
                  setManual(path, overrides[path] !== undefined ? null : undefined)
                }}
                title="Вернуть расчёт"
                aria-label={`Вернуть расчёт для ${path}`}
              >
                <RotateCcw aria-hidden="true" />
              </button>
            </div>
          )
        })}
        {rows.length === 0 && <p className="ed-empty">Ничего не найдено.</p>}
      </div>
      {rows.length > limit && (
        <button type="button" className="ed-btn" onClick={() => setLimit((l) => l + PAGE * 2)}>
          Показать ещё ({rows.length - limit})
        </button>
      )}
    </EdSection>
  )
}
