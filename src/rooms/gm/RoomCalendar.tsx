/**
 * Игровое время на сцене (как Simple Calendar и SmallTime в Foundry): маленькие
 * часы с датой для всех; мастер по клику двигает время (+10 мин, +1 ч, +8 ч
 * отдыха, +1 день), ставит дату, ведёт заметки к датам и включает связь
 * «время суток управляет темнотой активной карты». Сервер шлёт calendar.updated.
 *
 * Здесь же — перечитать комнату после content.imported (загрузка пакета или
 * восстановление снимка): часы и календарь видны всем, поэтому живут на сцене всегда.
 */
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Eye, EyeOff, Moon, Plus, Sun, Sunrise, Sunset, Trash2 } from 'lucide-react'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { errText } from '../table/parts'
import { addCalendarNote, advanceTime, deleteCalendarNote, getCalendar, patchCalendar, setDate, type CalendarView } from './api'

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const parseHhmm = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  return m ? Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2])) : null
}

const SHIFTS: { label: string; minutes: number; title: string }[] = [
  { label: '+10 мин', minutes: 10, title: 'Ход разведки, короткий разговор' },
  { label: '+1 ч', minutes: 60, title: 'Короткий отдых' },
  { label: '+8 ч', minutes: 480, title: 'Продолжительный отдых' },
  { label: '+1 день', minutes: 1440, title: 'Сутки пути' },
]

function PeriodIcon({ period }: { period?: string }) {
  if (period === 'рассвет') return <Sunrise aria-hidden="true" />
  if (period === 'сумерки') return <Sunset aria-hidden="true" />
  if (period === 'ночь' || period === 'вечер') return <Moon aria-hidden="true" />
  return <Sun aria-hidden="true" />
}

export function RoomCalendar() {
  const { roomId, isDm, viewAs, refresh } = useRoom()
  const preview = viewAs?.calendar as CalendarView | undefined
  const [cal, setCal] = useState<CalendarView | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (viewAs) return
    let alive = true
    getCalendar(roomId).then(
      (c) => alive && setCal(c),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [roomId, viewAs])

  useRoomEvents((msg) => {
    if (viewAs) return
    if (msg.type === 'calendar.updated') setCal((msg.payload as { calendar: CalendarView }).calendar)
    if (msg.type === 'content.imported') void refresh().catch(() => undefined)
  })

  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [open])

  const view = preview ?? cal
  if (!view || (!view.visible && !isDm) || view.minute == null) return null
  const today = (view.notes ?? []).filter((n) => n.year === view.year && n.day === view.day)
  return (
    <div className={`cal-root${view.visible ? '' : ' is-hidden'}`} ref={ref}>
      <button type="button" className="cal-chip" onClick={() => setOpen((v) => !v)} aria-expanded={open} title={view.label}>
        <PeriodIcon period={view.period} />
        <b>{hhmm(view.minute)}</b>
        <span>{view.date?.festival ? view.date.month_name : `${view.date?.day} ${view.months?.[view.date?.month ?? 0]?.name ?? ''}`}</span>
        {today.length > 0 && <em aria-label={`Заметок на сегодня: ${today.length}`}>{today.length}</em>}
      </button>
      {open && (isDm ? <GmPanel cal={view} onChange={setCal} /> : <PlayerPanel cal={view} />)}
    </div>
  )
}

function PlayerPanel({ cal }: { cal: CalendarView }) {
  const notes = cal.notes ?? []
  return (
    <div className="cal-pop">
      <p className="cal-date">{cal.label}</p>
      <p className="cal-sub">
        {cal.period} · {cal.calendar_label}
      </p>
      <NotesList cal={cal} notes={notes} />
    </div>
  )
}

function NotesList({ cal, notes, onDelete }: { cal: CalendarView; notes: CalendarView['notes']; onDelete?: (id: string) => void }) {
  const list = (notes ?? []).filter((n) => n.year > (cal.year ?? 0) || (n.year === cal.year && n.day >= (cal.day ?? 0))).slice(0, 8)
  if (list.length === 0) return <p className="cal-empty">Впереди ничего не отмечено.</p>
  return (
    <ul className="cal-notes">
      {list.map((n) => (
        <li key={n.id} className={n.year === cal.year && n.day === cal.day ? 'is-today' : ''}>
          <span className="cal-when">{n.year === cal.year && n.day === cal.day ? 'сегодня' : `через ${dayGap(cal, n.year, n.day)} дн.`}</span>
          <b>{n.title}</b>
          {n.visibility === 'gm' && <EyeOff aria-label="только мастер" />}
          {n.text && <p>{n.text}</p>}
          {onDelete && (
            <button type="button" className="cal-x" onClick={() => onDelete(n.id)} aria-label="Удалить заметку">
              <Trash2 aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Дней до даты: в пределах года точно, через год — по длине текущего года (подсказка, не расчёт) */
const dayGap = (cal: CalendarView, year: number, day: number) => (year - (cal.year ?? 0)) * (cal.year_length ?? 365) + day - (cal.day ?? 0)

function GmPanel({ cal, onChange }: { cal: CalendarView; onChange: (c: CalendarView) => void }) {
  const { roomId } = useRoom()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'time' | 'date' | 'notes' | 'setup'>('time')
  const run = async (fn: () => Promise<CalendarView>) => {
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
  return (
    <div className="cal-pop is-gm">
      <p className="cal-date">{cal.label}</p>
      <p className="cal-sub">
        {cal.period} · темнота по времени {Math.round((cal.darkness ?? 0) * 100)}%{cal.link_darkness ? ' · управляет картой' : ''}
      </p>
      <div className="cal-tabs" role="tablist">
        {(
          [
            ['time', 'Время'],
            ['date', 'Дата'],
            ['notes', 'Заметки'],
            ['setup', 'Настройки'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'time' && (
        <div className="cal-shifts">
          {SHIFTS.map((s) => (
            <button key={s.minutes} type="button" disabled={busy} title={s.title} onClick={() => void run(() => advanceTime(roomId, s.minutes))}>
              {s.label}
            </button>
          ))}
          <button type="button" disabled={busy} title="Отмотать час назад" onClick={() => void run(() => advanceTime(roomId, -60))}>
            −1 ч
          </button>
        </div>
      )}
      {tab === 'date' && <DateForm cal={cal} busy={busy} onSet={(body) => void run(() => setDate(roomId, body))} />}
      {tab === 'notes' && (
        <>
          <NoteForm busy={busy} onAdd={(title, visibility) => void run(() => addCalendarNote(roomId, { title, visibility }))} />
          <NotesList cal={cal} notes={cal.notes} onDelete={(id) => void run(() => deleteCalendarNote(roomId, id))} />
        </>
      )}
      {tab === 'setup' && <SetupForm cal={cal} busy={busy} onPatch={(body) => void run(() => patchCalendar(roomId, body))} />}
      {error && <p className="tb-err">{error}</p>}
    </div>
  )
}

function DateForm({ cal, busy, onSet }: { cal: CalendarView; busy: boolean; onSet: (b: { year: number; month: number; day: number; hour: number; minute: number }) => void }) {
  const [year, setYear] = useState(String(cal.year ?? 0))
  const [month, setMonth] = useState(cal.date?.month ?? 0)
  const [day, setDay] = useState(String(cal.date?.day ?? 1))
  const [time, setTime] = useState(hhmm(cal.minute ?? 0))
  const months = cal.months ?? []
  const max = months[month]?.days ?? 30
  return (
    <form
      className="cal-form"
      onSubmit={(e) => {
        e.preventDefault()
        const t = parseHhmm(time) ?? 0
        onSet({ year: Number(year) || 0, month, day: Math.min(max, Math.max(1, Number(day) || 1)), hour: Math.floor(t / 60), minute: t % 60 })
      }}
    >
      <label>
        День
        <input type="number" min={1} max={max} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label>
        Месяц
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {months.map((m, i) => (
            <option key={i} value={i}>
              {m.festival ? `✦ ${m.name}` : m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Год {cal.year_suffix}
        <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
      </label>
      <label>
        Время
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="08:00" pattern="\d{1,2}:\d{2}" />
      </label>
      <button type="submit" className="is-go" disabled={busy}>
        поставить
      </button>
    </form>
  )
}

function NoteForm({ busy, onAdd }: { busy: boolean; onAdd: (title: string, visibility: 'gm' | 'all') => void }) {
  const [title, setTitle] = useState('')
  const [all, setAll] = useState(false)
  return (
    <form
      className="cal-form is-note"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        onAdd(title.trim(), all ? 'all' : 'gm')
        setTitle('')
      }}
    >
      <input value={title} maxLength={200} placeholder="Ярмарка, срок ультиматума…" onChange={(e) => setTitle(e.target.value)} />
      <button type="button" onClick={() => setAll((v) => !v)} title={all ? 'Видят все' : 'Только мастер'}>
        {all ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      </button>
      <button type="submit" className="is-go" disabled={busy || !title.trim()} aria-label="Добавить на сегодня">
        <Plus aria-hidden="true" />
      </button>
    </form>
  )
}

function SetupForm({ cal, busy, onPatch }: { cal: CalendarView; busy: boolean; onPatch: (b: Parameters<typeof patchCalendar>[1]) => void }) {
  const [dawn, setDawn] = useState(hhmm(cal.dawn ?? 360))
  const [dusk, setDusk] = useState(hhmm(cal.dusk ?? 1080))
  return (
    <div className="cal-form is-setup">
      <label>
        <CalendarDays aria-hidden="true" /> Календарь
        <select value={cal.calendar} disabled={busy} onChange={(e) => onPatch({ calendar: e.target.value as 'harptos' | 'gregorian' })}>
          <option value="harptos">Харптос (Забытые королевства)</option>
          <option value="gregorian">Григорианский</option>
        </select>
      </label>
      <label className="ck-check">
        <input type="checkbox" checked={!!cal.link_darkness} disabled={busy} onChange={(e) => onPatch({ link_darkness: e.target.checked })} />
        время суток управляет темнотой активной карты
      </label>
      <label className="ck-check">
        <input type="checkbox" checked={cal.visible} disabled={busy} onChange={(e) => onPatch({ visible: e.target.checked })} />
        игроки видят дату и время
      </label>
      <div className="cal-pair">
        <label>
          Рассвет
          <input value={dawn} onChange={(e) => setDawn(e.target.value)} onBlur={() => parseHhmm(dawn) != null && parseHhmm(dawn) !== cal.dawn && onPatch({ dawn: parseHhmm(dawn)! })} />
        </label>
        <label>
          Закат
          <input value={dusk} onChange={(e) => setDusk(e.target.value)} onBlur={() => parseHhmm(dusk) != null && parseHhmm(dusk) !== cal.dusk && onPatch({ dusk: parseHhmm(dusk)! })} />
        </label>
        <label>
          Ночью темно на
          <select value={Math.round((cal.night_darkness ?? 0.9) * 10)} disabled={busy} onChange={(e) => onPatch({ night_darkness: Number(e.target.value) / 10 })}>
            {[5, 6, 7, 8, 9, 10].map((v) => (
              <option key={v} value={v}>
                {v * 10}%
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
