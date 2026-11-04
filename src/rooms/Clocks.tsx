/**
 * Часы: «Ритуал завершится через 6 ходов», «Погоня: 3 из 5», «Яд действует
 * ещё 4 раунда». Тонкое кольцо из делений и подпись капителью — без плашек.
 *
 * Три вида:
 *  - этапы (progress) — мастер продвигает сам;
 *  - время (countdown) — кольцо тает до ends_at;
 *  - раунды — делениями служат раунды боя: часы сами делают шаг, когда
 *    начинается новый раунд. Сервер таких часов не знает (это progress с
 *    невидимой меткой в названии), шаг делает браузер мастера — см.
 *    docs/BACKEND_REQUESTS.md, там просьба сделать это на сервере.
 */
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Hourglass, Minus, Plus, Swords, Timer, Trash2 } from 'lucide-react'
import type { RoomClock } from '../types/rooms'
import { useRoom } from './RoomProvider'
import { createClock, deleteClock, patchClock, tickClock } from './roomsApi'
import { errText } from './table/parts'

/** Невидимая метка «раундовых» часов в конце названия */
const ROUND_MARK = '⁣'
const isRounds = (c: Pick<RoomClock, 'name'>) => c.name.endsWith(ROUND_MARK)
const nameOf = (c: Pick<RoomClock, 'name'>) => c.name.replace(new RegExp(`${ROUND_MARK}+$`), '')

type Kind = 'progress' | 'countdown' | 'rounds'

/** 1 раунд, 2 раунда, 5 раундов */
const roundsWord = (n: number) => {
  const d = n % 10
  const h = n % 100
  return d === 1 && h !== 11 ? 'раунд' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'раунда' : 'раундов'
}
const kindOf = (c: RoomClock): Kind => (isRounds(c) ? 'rounds' : c.kind)

/** Остаток отсчёта: тикает раз в секунду */
function useLeft(endsAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!endsAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [endsAt])
  return endsAt ? Math.max(0, Date.parse(endsAt) - now) : null
}

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Кольцо: деления с зазором; у отсчёта — сплошная дуга, которая тает */
function Ring({ clock, left }: { clock: RoomClock; left: number | null }) {
  const kind = kindOf(clock)
  const r = 15
  const C = 2 * Math.PI * r
  // сколько было в начале, сервер не хранит: берём длительность из делений (минуты)
  // или самый большой остаток, который видели
  const start = useRef(0)
  if (left != null && left > start.current) start.current = left
  if (kind === 'countdown') {
    const total = Math.max(1, (clock.segments || 1) * 60000, start.current)
    const frac = left == null ? 0 : Math.min(1, left / total)
    return (
      <svg className="ck-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle className="ck-track" cx="20" cy="20" r={r} />
        <circle className="ck-fill" cx="20" cy="20" r={r} style={{ strokeDasharray: `${C * frac} ${C}` }} />
      </svg>
    )
  }
  const n = Math.max(1, Math.min(24, clock.segments))
  const gap = n > 1 ? Math.min(2.2, C / n / 3) : 0
  const seg = C / n - gap
  return (
    <svg className="ck-ring" viewBox="0 0 40 40" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          className={`ck-seg${i < clock.filled ? ' is-on' : ''}`}
          cx="20"
          cy="20"
          r={r}
          style={{ strokeDasharray: `${seg} ${C - seg}`, strokeDashoffset: -(i * (seg + gap)), animationDelay: `${i * 30}ms` }}
        />
      ))}
    </svg>
  )
}

function ClockMark({ clock, open, onToggle }: { clock: RoomClock; open: boolean; onToggle?: () => void }) {
  const kind = kindOf(clock)
  const left = useLeft(kind === 'countdown' ? clock.ends_at : null)
  const done = kind === 'countdown' ? left === 0 : clock.filled >= clock.segments
  const center = kind === 'countdown' ? (left != null ? mmss(left) : '') : kind === 'rounds' ? String(Math.max(0, clock.segments - clock.filled)) : `${clock.filled}`
  const left_ = Math.max(0, clock.segments - clock.filled)
  const sub = kind === 'countdown' ? 'время' : kind === 'rounds' ? (done ? 'раунды вышли' : roundsWord(left_)) : `из ${clock.segments}`
  const Tag = onToggle ? 'button' : 'div'
  return (
    <Tag
      type={onToggle ? 'button' : undefined}
      className={`ck-mark is-${kind}${done ? ' is-done' : ''}${clock.visible ? '' : ' is-secret'}${open ? ' is-open' : ''}`}
      onClick={onToggle}
      aria-expanded={onToggle ? open : undefined}
      title={`${nameOf(clock)}${clock.visible ? '' : ' (скрыты от игроков)'}`}
    >
      <span className="ck-dial">
        <Ring clock={clock} left={left} />
        <b className={center.length > 3 ? 'is-long' : ''}>{center}</b>
      </span>
      <span className="ck-cap">
        <i>{nameOf(clock)}</i>
        <small>{sub}</small>
      </span>
    </Tag>
  )
}

/** Правка мастера — маленькое окошко рядом с часами */
function ClockPop({ clock, onClose }: { clock: RoomClock; onClose: () => void }) {
  const { roomId } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = (e: PointerEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose()
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [onClose])
  const run = async (fn: () => Promise<unknown>, close = false) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (close) onClose()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const kind = kindOf(clock)
  return (
    <div className="ck-pop" ref={ref} role="dialog" aria-label={nameOf(clock)}>
      {kind !== 'countdown' && (
        <div className="ck-step">
          <button type="button" disabled={busy || clock.filled <= 0} onClick={() => void run(() => tickClock(roomId, clock.id, -1))} aria-label="Шаг назад">
            <Minus aria-hidden="true" />
          </button>
          <b>
            {clock.filled}
            <i>/{clock.segments}</i>
          </b>
          <button type="button" disabled={busy || clock.filled >= clock.segments} onClick={() => void run(() => tickClock(roomId, clock.id, 1))} aria-label="Шаг вперёд">
            <Plus aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="ck-acts">
        <button type="button" disabled={busy} onClick={() => void run(() => patchClock(roomId, clock.id, { visible: !clock.visible }))} title={clock.visible ? 'Спрятать от игроков' : 'Показать игрокам'}>
          {clock.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {clock.visible ? 'видят все' : 'только вы'}
        </button>
        <button type="button" className="is-danger" disabled={busy} onClick={() => void run(() => deleteClock(roomId, clock.id), true)} title="Убрать часы">
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      {error && <p className="tb-err">{error}</p>}
    </div>
  )
}

/** Новые часы: название, вид, сколько делений */
function NewClock({ inCombat, onClose }: { inCombat: boolean; onClose: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>(inCombat ? 'rounds' : 'progress')
  const [count, setCount] = useState(inCombat ? 3 : 6)
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const off = (e: PointerEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose()
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [onClose])
  const KINDS: { k: Kind; label: string; icon: typeof Timer; unit: string }[] = [
    { k: 'progress', label: 'этапы', icon: Hourglass, unit: 'этапов' },
    { k: 'rounds', label: 'раунды', icon: Swords, unit: 'раундов' },
    { k: 'countdown', label: 'минуты', icon: Timer, unit: 'минут' },
  ]
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const title = name.trim() || (kind === 'rounds' ? 'Эффект' : kind === 'countdown' ? 'Время' : 'Часы')
      await createClock(roomId, {
        name: kind === 'rounds' ? `${title}${ROUND_MARK}` : title,
        kind: kind === 'countdown' ? 'countdown' : 'progress',
        segments: kind === 'countdown' ? Math.min(24, Math.max(1, count)) : count,
        filled: 0,
        visible,
        ends_at: kind === 'countdown' ? new Date(Date.now() + count * 60000).toISOString() : null,
      })
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }
  const unit = KINDS.find((x) => x.k === kind)!.unit
  return (
    <form
      className="ck-pop is-new"
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input className="ck-name" value={name} maxLength={60} placeholder="Ритуал, погоня, рассвет…" onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="ck-kinds" role="radiogroup" aria-label="Вид часов">
        {KINDS.map(({ k, label, icon: Icon }) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="ck-step">
        <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Меньше">
          <Minus aria-hidden="true" />
        </button>
        <b>
          {count}
          <i> {unit}</i>
        </b>
        <button type="button" onClick={() => setCount((n) => Math.min(kind === 'countdown' ? 600 : 24, n + 1))} aria-label="Больше">
          <Plus aria-hidden="true" />
        </button>
      </div>
      <div className="ck-acts">
        <button type="button" onClick={() => setVisible((v) => !v)}>
          {visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {visible ? 'видят все' : 'только вы'}
        </button>
        <button type="submit" className="is-go" disabled={busy}>
          повесить
        </button>
      </div>
      {error && <p className="tb-err">{error}</p>}
    </form>
  )
}

/**
 * Раундовые часы делают шаг с началом нового раунда. Шагает браузер мастера:
 * игроки и второй экран мастера только смотрят.
 */
function useRoundTicks() {
  const { data, roomId, isDm } = useRoom()
  const round = data?.combat && data.combat.status === 'active' ? data.combat.round : null
  const prev = useRef<number | null>(round)
  const clocks = data?.clocks
  useEffect(() => {
    const was = prev.current
    prev.current = round
    if (!isDm || round == null || was == null || round <= was) return
    for (const c of clocks ?? []) if (isRounds(c) && c.filled < c.segments) void tickClock(roomId, c.id, Math.min(round - was, c.segments - c.filled)).catch(() => undefined)
  }, [round, isDm, roomId, clocks])
}

/** Часы на сцене: столбик тонких колец слева сверху */
export function RoomClocks() {
  const { data, isDm } = useRoom()
  const [open, setOpen] = useState<string | null>(null)
  useRoundTicks()
  const clocks = data?.clocks ?? []
  const inCombat = !!data?.combat && data.combat.status !== 'ended'
  if (!isDm && clocks.length === 0) return null
  return (
    <div className="ck-strip" aria-label="Часы">
      {clocks.map((c) => (
        <div key={c.id} className="ck-slot">
          <ClockMark clock={c} open={open === c.id} onToggle={isDm ? () => setOpen((o) => (o === c.id ? null : c.id)) : undefined} />
          {open === c.id && isDm && <ClockPop clock={c} onClose={() => setOpen(null)} />}
        </div>
      ))}
      {isDm && (
        <div className="ck-slot">
          <button type="button" className={`ck-new${open === 'new' ? ' is-open' : ''}`} onClick={() => setOpen((o) => (o === 'new' ? null : 'new'))} aria-expanded={open === 'new'} title="Повесить часы">
            <Plus aria-hidden="true" />
          </button>
          {open === 'new' && <NewClock inCombat={inCombat} onClose={() => setOpen(null)} />}
        </div>
      )}
    </div>
  )
}
