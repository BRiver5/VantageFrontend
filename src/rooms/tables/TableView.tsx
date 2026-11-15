/**
 * Таблица в режиме броска: строки (выпавшие приглушены), замок на строке —
 * следующий бросок выдаст её без кубика, кнопка «Тянуть» и карточки итога.
 */
import { useState } from 'react'
import { Dices, Eye, EyeOff, Lock, LockOpen, Pencil, RotateCcw, Scale } from 'lucide-react'
import { useRoom } from '../RoomProvider'
import { errText } from '../table/parts'
import { drawTable, normalizeTable, patchTable, resetTable } from './api'
import { chance, defaultFormula, rangeLabel, TYPE_RU } from './logic'
import { DrawCards } from './ResultCard'
import { VisibilityPicker } from './VisibilityPicker'
import type { RollTable, TableDraw } from './types'

export function TableView({ table, onChange, onEdit }: { table: RollTable; onChange: (t: RollTable) => void; onEdit: () => void }) {
  const { roomId } = useRoom()
  const [count, setCount] = useState(1)
  const [mode, setMode] = useState<'public' | 'gm'>('gm')
  const [locked, setLocked] = useState<string | null>(null)
  const [draws, setDraws] = useState<TableDraw[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const left = table.replacement ? table.results.length : table.results.filter((r) => !r.drawn).length

  const act = async (fn: () => Promise<RollTable>) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await fn())
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const draw = () =>
    act(async () => {
      const out = await drawTable(roomId, table.id, { count: locked ? 1 : count, mode, force_result_id: locked })
      setDraws(out.draws)
      setLocked(null)
      return out.table
    })

  return (
    <div className="rt-view">
      <header className="rt-view-head">
        <div>
          <h3 className="sc-subtitle">{table.name}</h3>
          <p className="rt-meta">
            {table.formula || defaultFormula(table.results)} · {table.replacement ? 'с возвращением' : `без возвращения, осталось ${left} из ${table.results.length}`}
          </p>
          {table.description && <p className="rt-descr">{table.description}</p>}
        </div>
        <button type="button" className="tb-linkbtn" onClick={onEdit}>
          <Pencil aria-hidden="true" /> править
        </button>
      </header>

      <ol className="rt-list">
        {table.results.map((r) => (
          <li key={r.id} className={`${r.drawn ? 'is-drawn' : ''}${locked === r.id ? ' is-locked' : ''}`}>
            <span className="rt-list-range">{rangeLabel(r)}</span>
            <span className="rt-list-text">
              {r.text || TYPE_RU[r.type]}
              {r.type !== 'text' && <i>{TYPE_RU[r.type]}</i>}
            </span>
            {!table.formula && <span className="rt-list-chance">{chance(r, table.results)}%</span>}
            <button type="button" className="rt-lock" aria-pressed={locked === r.id} title={locked === r.id ? 'Снять выбор' : 'Следующим выпадет этот результат'} onClick={() => setLocked((l) => (l === r.id ? null : r.id))}>
              {locked === r.id ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
            </button>
          </li>
        ))}
        {table.results.length === 0 && <li className="tb-hint">Пока пусто: добавьте результаты в редакторе.</li>}
      </ol>

      <div className="rt-drawbar">
        <span className="sc-count" aria-label="Сколько тянуть">
          <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Меньше" disabled={!!locked}>
            −
          </button>
          <b>×{locked ? 1 : count}</b>
          <button type="button" onClick={() => setCount((n) => Math.min(20, n + 1))} aria-label="Больше" disabled={!!locked}>
            +
          </button>
        </span>
        <div className="tb-tri" role="radiogroup" aria-label="Кто увидит итог">
          <button type="button" role="radio" aria-checked={mode === 'gm'} className={mode === 'gm' ? 'is-on' : ''} onClick={() => setMode('gm')}>
            <EyeOff aria-hidden="true" /> мастеру
          </button>
          <button type="button" role="radio" aria-checked={mode === 'public'} className={mode === 'public' ? 'is-on' : ''} onClick={() => setMode('public')}>
            <Eye aria-hidden="true" /> всем
          </button>
        </div>
        <button type="button" className="tb-goldbtn" disabled={busy || left === 0} onClick={() => void draw()}>
          <Dices aria-hidden="true" /> {locked ? 'Выдать выбранное' : 'Тянуть'}
        </button>
        <span className="rt-spacer" />
        <button type="button" className="tb-linkbtn" disabled={busy || !table.results.some((r) => r.drawn)} onClick={() => void act(() => resetTable(roomId, table.id))} title="Вернуть выпавшее в таблицу">
          <RotateCcw aria-hidden="true" /> сбросить
        </button>
        <button type="button" className="tb-linkbtn" disabled={busy} onClick={() => void act(() => normalizeTable(roomId, table.id))} title="Диапазоны подряд от 1 по весам">
          <Scale aria-hidden="true" /> нормализовать
        </button>
      </div>
      <VisibilityPicker value={table.visibility} sharedWith={table.shared_with ?? []} onChange={(visibility, shared_with) => void act(() => patchTable(roomId, table.id, { visibility, shared_with }))} />
      {table.visibility !== 'gm' && !table.replacement && <p className="tb-hint">Игроки видят таблицу, но тянуть из неё не смогут: она без возвращения.</p>}
      {error && <p className="tb-err">{error}</p>}

      {draws && (
        <section className="rt-outcome" aria-live="polite">
          {draws.map((d, i) => (
            <DrawCards key={i} draw={d} />
          ))}
        </section>
      )}
    </div>
  )
}
