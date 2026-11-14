/**
 * @Embed[table:id] в базе знаний: карточка таблицы случайных результатов с кнопкой «Тянуть».
 * Сервер сам отдаёт игроку только открытые ему таблицы и решает, можно ли тянуть
 * (игроку — только с возвращением); ошибка показывается в карточке.
 */
import { useEffect, useState } from 'react'
import { Dices } from 'lucide-react'
import { useRoom } from '../RoomProvider'
import { drawTable, listTables } from '../tables/api'
import { drawnSummary } from '../tables/logic'
import type { RollTable } from '../tables/types'

export function TableEmbed({ id }: { id: string }) {
  const { roomId } = useRoom()
  const [table, setTable] = useState<RollTable | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listTables(roomId).then(
      (items) => alive && setTable(items.find((t) => t.id === id) ?? null),
      () => alive && setTable(null),
    )
    return () => {
      alive = false
    }
  }, [roomId, id])

  if (table === undefined) {
    return (
      <span className="kb-card is-loading">
        <Dices aria-hidden="true" />
        <span>Достаём таблицу…</span>
      </span>
    )
  }
  if (table === null) {
    return (
      <span className="kb-card is-missing">
        <Dices aria-hidden="true" />
        <span>Таблица недоступна: её убрали или не открыли вам</span>
      </span>
    )
  }

  const draw = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await drawTable(roomId, table.id, { mode: 'public' })
      setTable(res.table)
      setLast(drawnSummary(res))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вышло тянуть из таблицы')
    } finally {
      setBusy(false)
    }
  }

  const left = table.replacement ? null : table.results.filter((r) => !r.drawn).length
  return (
    <span className="kb-card is-table">
      <span className="kb-card-art">
        <Dices aria-hidden="true" />
      </span>
      <span className="kb-card-main">
        <span className="kb-card-kind">Таблица</span>
        <b className="kb-card-title">{table.name}</b>
        <span className="kb-card-facts">
          {[`${table.results.length} результатов`, table.formula || null, left != null ? `осталось ${left}` : null].filter(Boolean).join(' · ')}
        </span>
        {table.description && <span className="kb-card-text">{table.description}</span>}
        {last && <span className="kb-card-text">{last}</span>}
        {error && <span className="kb-card-text is-error">{error}</span>}
        <button type="button" className="kb-card-action" onClick={() => void draw()} disabled={busy || left === 0}>
          {busy ? 'Тянем…' : 'Тянуть'}
        </button>
      </span>
    </span>
  )
}
