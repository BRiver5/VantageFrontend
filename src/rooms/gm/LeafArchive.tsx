/**
 * Створка ширмы «Архив» (как Adventure-документы и бэкапы Foundry):
 *  - выгрузить содержимое комнаты пакетом приключения (JSON, картинки и звуки — ссылками);
 *  - загрузить пакет: предпросмотр по типам — что добавится, что перезапишется,
 *    галочки по типам, явное подтверждение перезаписи; повторная загрузка обновляет, а не дублирует;
 *  - снимки комнаты: сервер снимает их сам перед загрузкой и массовыми удалениями
 *    (последние 5), их можно скачать, восстановить или удалить.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Archive, Download, History, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useRoom } from '../RoomProvider'
import { errText } from '../table/parts'
import {
  CONTENT_TYPES,
  createSnapshot,
  deleteSnapshot,
  downloadSnapshot,
  exportAdventure,
  importAdventure,
  listSnapshots,
  previewAdventure,
  restoreSnapshot,
  type AdventureBundle,
  type AdventurePreview,
  type ContentType,
  type ImportResult,
  type Snapshot,
} from './api'
import { countLabel, plural } from '../../lib/plural'

const REASON_RU: Record<string, string> = {
  manual: 'вручную',
  import: 'перед загрузкой',
  restore: 'перед восстановлением',
  delete_map: 'перед удалением карты',
  clear_drawings: 'перед очисткой рисунков',
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`)
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const labelOf = (t: string) => CONTENT_TYPES.find((c) => c.id === t)?.label ?? t
const countsText = (counts: Partial<Record<string, number>>) =>
  Object.entries(counts)
    .filter(([, n]) => n)
    .map(([t, n]) => `${labelOf(t).toLowerCase()}: ${n}`)
    .join(', ') || 'пусто'

function saveJson(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const fileName = (name: string, suffix: string) => `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'room'}-${suffix}.json`

export function LeafArchive() {
  return (
    <div className="ar-leaf">
      <ExportPane />
      <ImportPane />
      <SnapshotsPane />
    </div>
  )
}

function ExportPane() {
  const { roomId, data } = useRoom()
  const [types, setTypes] = useState<ContentType[]>(CONTENT_TYPES.map((c) => c.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="ar-pane">
      <h4>
        <Download aria-hidden="true" /> Выгрузить приключение
      </h4>
      <p className="tb-hint">Пакет JSON с версией формата. Картинки и звуки идут ссылками — сами файлы остаются на сервере.</p>
      <div className="ar-types">
        {CONTENT_TYPES.map((c) => (
          <label key={c.id} className="ck-check">
            <input type="checkbox" checked={types.includes(c.id)} onChange={(e) => setTypes((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))} />
            {c.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="tb-goldbtn"
        disabled={busy || types.length === 0}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const bundle = await exportAdventure(roomId, types)
            saveJson(bundle, fileName(data?.room.name ?? 'room', 'adventure'))
          } catch (e) {
            setError(errText(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Download aria-hidden="true" /> Скачать пакет
      </button>
      {error && <p className="tb-err">{error}</p>}
    </section>
  )
}

function ImportPane() {
  const { roomId, refresh } = useRoom()
  const input = useRef<HTMLInputElement>(null)
  const [bundle, setBundle] = useState<AdventureBundle | null>(null)
  const [preview, setPreview] = useState<AdventurePreview | null>(null)
  const [types, setTypes] = useState<ContentType[]>([])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)

  const available = preview ? (Object.keys(preview.types) as ContentType[]) : []
  const overwrites = available.filter((t) => types.includes(t)).reduce((n, t) => n + (preview?.types[t]?.update.length ?? 0), 0)

  const pick = async (file: File) => {
    setError(null)
    setDone(null)
    setPreview(null)
    setConfirm(false)
    try {
      const parsed = JSON.parse(await file.text()) as AdventureBundle
      const p = await previewAdventure(roomId, parsed)
      setBundle(parsed)
      setPreview(p)
      setTypes(Object.keys(p.types) as ContentType[])
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Файл не похож на JSON' : errText(e))
    }
  }

  return (
    <section className="ar-pane">
      <h4>
        <Upload aria-hidden="true" /> Загрузить пакет
      </h4>
      <p className="tb-hint">Сначала покажем, что добавится и что перезапишется. Перед загрузкой комната сохранится снимком.</p>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />
      <button type="button" className="tb-linkbtn" onClick={() => input.current?.click()}>
        <Upload aria-hidden="true" /> Выбрать файл…
      </button>
      {preview && bundle && (
        <div className="ar-preview">
          <p className="ar-source">
            «{preview.source.room_name || 'без названия'}» · версия {preview.version}
          </p>
          <ul>
            {available.map((t) => {
              const row = preview.types[t]!
              return (
                <li key={t}>
                  <label className="ck-check">
                    <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((x) => (e.target.checked ? [...x, t] : x.filter((y) => y !== t)))} />
                    <b>{labelOf(t)}</b>
                  </label>
                  <span className="ar-diff">
                    {row.add.length > 0 && <i className="is-add">+{row.add.length} новых</i>}
                    {row.update.length > 0 && <i className="is-upd">{row.update.length} {plural(row.update.length, ['перезапишется', 'перезапишутся', 'перезапишутся'])}</i>}
                  </span>
                  {(row.add.length > 0 || row.update.length > 0) && (
                    <details>
                      <summary>что именно</summary>
                      <p>{[...row.update.map((r) => `↻ ${r.label}`), ...row.add.map((r) => `+ ${r.label}`)].slice(0, 60).join(' · ')}</p>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
          {overwrites > 0 && (
            <label className="ar-warn">
              <AlertTriangle aria-hidden="true" />
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              Перезаписать {countLabel(overwrites, ['существующую запись', 'существующие записи', 'существующих записей'])} (их прежний вид останется в снимке)
            </label>
          )}
          <button
            type="button"
            className="tb-goldbtn"
            disabled={busy || types.length === 0 || (overwrites > 0 && !confirm)}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const r = await importAdventure(roomId, bundle, types, overwrites > 0)
                setDone(r)
                setPreview(null)
                setBundle(null)
                await refresh()
              } catch (e) {
                setError(errText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            <Upload aria-hidden="true" /> Загрузить выбранное
          </button>
        </div>
      )}
      {done && (
        <div className="ar-done" role="status">
          <p>Загружено: {countsText(done.counts)}. Снимок «{REASON_RU[done.snapshot.reason] ?? done.snapshot.reason}» сохранён.</p>
          {done.errors.length > 0 && (
            <ul className="ar-errors">
              {done.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="tb-err">{error}</p>}
    </section>
  )
}

function SnapshotsPane() {
  const { roomId, data, refresh, subscribe } = useRoom()
  const [items, setItems] = useState<Snapshot[]>([])
  const [keep, setKeep] = useState(5)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)

  const load = useCallback(() => {
    listSnapshots(roomId).then(
      (r) => {
        setItems(r.items)
        setKeep(r.keep)
      },
      (e) => setError(errText(e)),
    )
  }, [roomId])
  useEffect(load, [load])
  // снимки появляются и от действий в других местах (удаление карты, загрузка)
  useEffect(() => subscribe((msg) => msg.type === 'content.imported' && load()), [subscribe, load])

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    setError(null)
    try {
      await fn()
      load()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="ar-pane">
      <h4>
        <History aria-hidden="true" /> Снимки комнаты
        <i>последние {keep}</i>
      </h4>
      <p className="tb-hint">Сервер снимает их сам перед загрузкой пакета, восстановлением, удалением карты и очисткой рисунков.</p>
      <button type="button" className="tb-linkbtn" disabled={busy === 'new'} onClick={() => void act('new', () => createSnapshot(roomId))}>
        <Archive aria-hidden="true" /> Снять снимок сейчас
      </button>
      <ul className="ar-snaps">
        {items.length === 0 && <li className="tb-hint">Снимков пока нет.</li>}
        {items.map((s) => (
          <li key={s.id}>
            <div>
              <b>{when(s.created_at)}</b> <i>{REASON_RU[s.reason] ?? s.reason}</i>
              <span title={s.label}>
                {kb(s.size)} · {countsText(s.counts)}
              </span>
            </div>
            <div className="ar-acts">
              <button type="button" title="Скачать пакетом" disabled={!!busy} onClick={() => void act(s.id, async () => saveJson(await downloadSnapshot(roomId, s.id), fileName(data?.room.name ?? 'room', `snapshot-${s.created_at.slice(0, 16)}`)))}>
                <Download aria-hidden="true" />
              </button>
              {asking === s.id ? (
                <button
                  type="button"
                  className="is-danger"
                  disabled={!!busy}
                  onClick={() =>
                    void act(s.id, async () => {
                      setAsking(null)
                      await restoreSnapshot(roomId, s.id)
                      await refresh()
                    })
                  }
                >
                  <RotateCcw aria-hidden="true" /> Точно вернуть?
                </button>
              ) : (
                <button type="button" title="Вернуть комнату к этому снимку" disabled={!!busy} onClick={() => setAsking(s.id)}>
                  <RotateCcw aria-hidden="true" />
                </button>
              )}
              <button type="button" title="Удалить снимок" disabled={!!busy} onClick={() => void act(s.id, () => deleteSnapshot(roomId, s.id))}>
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="tb-err">{error}</p>}
    </section>
  )
}
