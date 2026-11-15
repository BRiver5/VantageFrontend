/**
 * Редактор таблицы: название, папка, формула, возвращение, кто видит и строки
 * результатов (диапазон, вес, тип, текст, ссылка, картинка). Ссылку берут из
 * панели справа нажатием или перетаскиванием на строку; страницу можно
 * перетащить и прямо из дерева базы знаний.
 */
import { useState } from 'react'
import { ImagePlus, Link2, Plus, Save, Scale, Trash2, X } from 'lucide-react'
import { uploadMedia } from '../../api'
import { Img } from '../../media'
import { useKnowledge } from '../kb/context'
import { errText } from '../table/parts'
import { applyRef, defaultFormula, KB_PAGE_DRAG, newResult, normalizeResults, rangeIssues, REF_MIME, refFromDrop, TYPE_RU } from './logic'
import { RefPicker } from './RefPicker'
import { VisibilityPicker } from './VisibilityPicker'
import type { ResultType, RollTable, TableBody, TableResult } from './types'

const TYPES = Object.keys(TYPE_RU) as ResultType[]

function ImageCell({ value, onChange }: { value: string | null | undefined; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  if (value)
    return (
      <span className="rt-img">
        <Img src={value} alt="" />
        <button type="button" aria-label="Убрать картинку" onClick={() => onChange(null)}>
          <X aria-hidden="true" />
        </button>
      </span>
    )
  return (
    <label className={`rt-img is-empty${busy ? ' is-busy' : ''}${failed ? ' is-failed' : ''}`} title={failed ?? 'Картинка результата'}>
      <ImagePlus aria-hidden="true" />
      <input
        type="file"
        accept="image/*"
        hidden
        aria-label="Картинка результата"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setBusy(true)
          setFailed(null)
          try {
            onChange((await uploadMedia(f)).url)
          } catch (err) {
            setFailed(errText(err))
          } finally {
            setBusy(false)
          }
        }}
      />
    </label>
  )
}

export function TableEditor({ table, tables, onSave, onDelete, onClose }: { table: RollTable; tables: RollTable[]; onSave: (body: TableBody) => Promise<void>; onDelete: () => Promise<void>; onClose: () => void }) {
  const kb = useKnowledge()
  const [draft, setDraft] = useState<RollTable>(table)
  const [target, setTarget] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<RollTable>) => setDraft((d) => ({ ...d, ...patch }))
  const setRow = (id: string, patch: Partial<TableResult>) => setDraft((d) => ({ ...d, results: d.results.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  const issues = rangeIssues(draft.results)
  const pageTitle = (id: string) => kb?.notes?.find((n) => n.id === id)?.title

  const save = async () => {
    if (!draft.name.trim()) return setError('Назовите таблицу')
    setBusy(true)
    setError(null)
    try {
      const { name, description, formula, replacement, results, folder, visibility, shared_with, image } = draft
      await onSave({ name: name.trim(), description, formula: formula.trim(), replacement, results, folder: folder?.trim() || null, visibility, shared_with, image })
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rt-editor">
      <div className="rt-editor-main">
        <div className="rt-fields">
          <input className="rt-name" value={draft.name} maxLength={200} placeholder="Название таблицы" aria-label="Название" onChange={(e) => set({ name: e.target.value })} />
          <label>
            Папка
            <input value={draft.folder ?? ''} placeholder="Встречи/Лес" onChange={(e) => set({ folder: e.target.value })} />
          </label>
          <label>
            Формула
            <input value={draft.formula} placeholder={defaultFormula(draft.results)} onChange={(e) => set({ formula: e.target.value })} />
          </label>
          <label className="rt-check">
            <input type="checkbox" checked={!draft.replacement} onChange={(e) => set({ replacement: !e.target.checked })} />
            без возвращения
          </label>
          <VisibilityPicker value={draft.visibility} sharedWith={draft.shared_with ?? []} onChange={(visibility, shared_with) => set({ visibility, shared_with })} />
        </div>
        <textarea className="rt-desc" value={draft.description} placeholder="Описание: когда бросать, что значат результаты…" aria-label="Описание" onChange={(e) => set({ description: e.target.value })} />

        <table className="rt-rows">
          <thead>
            <tr>
              <th>Диапазон</th>
              <th>Вес</th>
              <th>Тип</th>
              <th>Текст и ссылка</th>
              <th aria-label="Картинка" />
              <th aria-label="Удалить" />
            </tr>
          </thead>
          <tbody>
            {draft.results.map((r) => (
              <tr
                key={r.id}
                className={`${target === r.id ? 'is-target' : ''}${over === r.id ? ' is-over' : ''}`}
                onClick={() => setTarget(r.id)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(REF_MIME) || e.dataTransfer.types.includes(KB_PAGE_DRAG)) {
                    e.preventDefault()
                    setOver(r.id)
                  }
                }}
                onDragLeave={() => setOver((o) => (o === r.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(null)
                  const pick = refFromDrop((t) => e.dataTransfer.getData(t), pageTitle)
                  if (pick) setDraft((d) => ({ ...d, results: d.results.map((x) => (x.id === r.id ? applyRef(x, pick) : x)) }))
                }}
              >
                <td className="rt-range">
                  <input type="number" min={0} aria-label="От" value={r.range?.[0] ?? ''} onChange={(e) => setRow(r.id, { range: [Number(e.target.value), Math.max(Number(e.target.value), r.range?.[1] ?? 0)] })} />
                  <span>–</span>
                  <input type="number" min={0} aria-label="До" value={r.range?.[1] ?? ''} onChange={(e) => setRow(r.id, { range: [r.range?.[0] ?? 1, Number(e.target.value)] })} />
                </td>
                <td>
                  <input className="rt-weight" type="number" min={1} max={1000} aria-label="Вес" value={r.weight} onChange={(e) => setRow(r.id, { weight: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
                </td>
                <td>
                  <select aria-label="Тип" value={r.type} onChange={(e) => setRow(r.id, { type: e.target.value as ResultType, ref_id: null, ref_kind: null })}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_RU[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="rt-text">
                  <input value={r.text} maxLength={2000} placeholder="Что выпало" aria-label="Текст" onChange={(e) => setRow(r.id, { text: e.target.value })} />
                  {r.type !== 'text' &&
                    (r.ref_id ? (
                      <span className="rt-ref" title="Ссылка задана">
                        <Link2 aria-hidden="true" /> {TYPE_RU[r.type]}
                        <button type="button" aria-label="Убрать ссылку" onClick={() => setRow(r.id, { ref_id: null, ref_kind: null })}>
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    ) : (
                      <span className="rt-ref is-empty">выберите справа или перетащите</span>
                    ))}
                </td>
                <td>
                  <ImageCell value={r.image} onChange={(image) => setRow(r.id, { image })} />
                </td>
                <td>
                  <button type="button" className="rt-del" aria-label="Удалить строку" onClick={() => set({ results: draft.results.filter((x) => x.id !== r.id) })}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rt-editor-bar">
          <button
            type="button"
            className="tb-linkbtn"
            onClick={() => {
              const row = newResult(draft.results)
              set({ results: [...draft.results, row] })
              setTarget(row.id)
            }}
          >
            <Plus aria-hidden="true" /> строка
          </button>
          <button type="button" className="tb-linkbtn" onClick={() => set({ results: normalizeResults(draft.results) })} title="Диапазоны подряд от 1 по весам">
            <Scale aria-hidden="true" /> нормализовать
          </button>
          {(issues.overlap || issues.gaps) && <span className="rt-warn">{issues.overlap ? 'Диапазоны пересекаются' : 'В диапазонах есть пропуски'}</span>}
          <span className="rt-spacer" />
          <button
            type="button"
            className="tb-linkbtn is-danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`Удалить таблицу «${table.name}»?`)) void onDelete().catch((e) => setError(errText(e)))
            }}
          >
            <Trash2 aria-hidden="true" /> удалить
          </button>
          <button type="button" className="tb-linkbtn" onClick={onClose}>
            отмена
          </button>
          <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void save()}>
            <Save aria-hidden="true" /> Сохранить
          </button>
        </div>
        {error && <p className="tb-err">{error}</p>}
      </div>
      <RefPicker
        tables={tables}
        selfId={table.id}
        onPick={(pick) => {
          const id = target && draft.results.some((x) => x.id === target) ? target : null
          if (id) setDraft((d) => ({ ...d, results: d.results.map((x) => (x.id === id ? applyRef(x, pick) : x)) }))
          else {
            const row = applyRef(newResult(draft.results), pick)
            set({ results: [...draft.results, row] })
            setTarget(row.id)
          }
        }}
      />
    </div>
  )
}
