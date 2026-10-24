/**
 * Окна игровых операций: короткий отдых (сколько костей хитов тратить),
 * повышение уровня (класс, подкласс, хиты и список изменений), журнал
 * действий с отменой последнего и плашка отложенных решений над листом.
 */
import { useEffect, useMemo, useState } from 'react'
import { BellRing, Check, Coffee, Dices, GraduationCap, Loader2, ScrollText, Undo2, X } from 'lucide-react'
import { getSubList, listEvents, type GameClass, type Subclass } from '../api'
import { useDice } from '../dice/diceControl'
import type { Character, CharacterEvent, PendingDecision, Sheet } from '../types/character'
import { Segmented, Stepper } from './editorFields'
import { SheetModal } from './SheetModal'
import { classSlugs, valuesOf, type Names } from './sheetView'

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка сервера')

/* ---------- короткий отдых ---------- */

export function ShortRestDialog({
  character,
  sheet,
  names,
  onRest,
  onClose,
}: {
  character: Character
  sheet: Sheet
  names: Names
  onRest: (hitDice: Record<string, number>) => void
  onClose: () => void
}) {
  const { num } = valuesOf(sheet)
  const slugs = classSlugs(character, sheet, names)
  const rows = character.classes.map((cl, i) => ({
    slug: slugs[i],
    name: names.cls(cl.class_id)?.class_name ?? slugs[i],
    die: num(`char.class.${slugs[i]}.hit_die`, 8),
    left: num(`char.hit_dice.${slugs[i]}.current`),
    max: num(`char.hit_dice.${slugs[i]}.max`, cl.level),
  }))
  const [spend, setSpend] = useState<Record<string, number>>({})
  const total = Object.values(spend).reduce((a, b) => a + b, 0)

  return (
    <SheetModal
      title="Короткий отдых"
      kicker="кости хитов"
      tone="rest"
      visual={<Coffee className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="cs-btn cw-next"
            onClick={() => {
              onRest(Object.fromEntries(Object.entries(spend).filter(([, n]) => n > 0)))
              onClose()
            }}
          >
            <Check aria-hidden="true" /> Отдохнуть{total ? ` · ${total} к.` : ''}
          </button>
        </>
      }
    >
      <p className="act-desc">Сколько костей хитов потратить? Бросает сервер, к каждой прибавится модификатор Телосложения.</p>
      <div className="eng-hd">
        {rows.map((r) => (
          <div key={r.slug} className="eng-hd-row">
            <span>
              <b>{r.name}</b>
              <i>
                к{r.die} · осталось {r.left} из {r.max}
              </i>
            </span>
            <Stepper value={spend[r.slug] ?? 0} min={0} max={r.left} onChange={(v) => setSpend((s) => ({ ...s, [r.slug]: v }))} />
          </div>
        ))}
      </div>
    </SheetModal>
  )
}

/* ---------- повышение уровня ---------- */

/** «+ phb14.druid.wild_shape» → «Wild shape» с плюсом; минус — снятое умение */
function changeRow(change: string) {
  const m = /^([+\-−])\s*(.+)$/.exec(change.trim())
  const sign = m?.[1] === '+' ? '+' : m ? '−' : ''
  const slug = m?.[2] ?? change
  const name = slug.split('.').pop()?.replace(/_/g, ' ') ?? slug
  return { sign, name: name.charAt(0).toUpperCase() + name.slice(1), slug }
}

export function LevelUpDialog({
  character,
  names,
  classes,
  onLevelUp,
  onClose,
}: {
  character: Character
  names: Names
  classes: GameClass[]
  onLevelUp: (body: { class_id: string; subclass_id?: string | null; hp_roll?: number | null }) => Promise<string[] | null>
  onClose: () => void
}) {
  const dice = useDice()
  const total = character.classes.reduce((s, c) => s + c.level, 0)
  const [classId, setClassId] = useState(character.classes[0]?.class_id ?? '')
  const [subclassId, setSubclassId] = useState<string | null>(null)
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average')
  const [hpRoll, setHpRoll] = useState<number | null>(null)
  const [subclasses, setSubclasses] = useState<Subclass[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changes, setChanges] = useState<string[] | null>(null)

  const cls = classes.find((c) => c.id === classId) ?? null
  const own = character.classes.find((c) => c.class_id === classId)
  const nextLevel = (own?.level ?? 0) + 1
  const subLevel = cls?.subclass_level ?? 3
  const needSubclass = !own?.subclass_id && nextLevel >= subLevel
  const die = cls?.hit_dice ?? 8

  useEffect(() => {
    setSubclassId(null)
    setHpRoll(null)
    if (!classId) return
    let alive = true
    getSubList<Subclass>('classes', classId, 'subclasses')
      .then((list) => alive && setSubclasses(list))
      .catch(() => alive && setSubclasses([]))
    return () => {
      alive = false
    }
  }, [classId])

  // свои классы — первыми; остальное — мультикласс
  const options = useMemo(() => {
    const mine = new Set(character.classes.map((c) => c.class_id))
    return [...classes].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || a.class_name.localeCompare(b.class_name, 'ru'))
  }, [classes, character.classes])

  const roll = async () => {
    try {
      const [v] = await dice.roll(`1d${die}`)
      setHpRoll(v)
    } catch {
      setHpRoll(1 + Math.floor(Math.random() * die))
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await onLevelUp({
      class_id: classId,
      subclass_id: needSubclass ? subclassId : undefined,
      hp_roll: hpMode === 'roll' ? hpRoll : null,
    })
    setBusy(false)
    if (res) setChanges(res)
    else setError('Не удалось повысить уровень — подробности над листом.')
  }

  if (changes) {
    const rows = changes.map(changeRow)
    return (
      <SheetModal
        title={`Уровень ${total + 1}`}
        kicker={cls ? `${cls.class_name} ${nextLevel}` : undefined}
        tone="level"
        visual={<GraduationCap className="cw-smodal-glyph" aria-hidden="true" />}
        onClose={onClose}
        actions={
          <button type="button" className="cs-btn cw-next" onClick={onClose}>
            Готово
          </button>
        }
      >
        {rows.length === 0 ? (
          <p className="act-desc">Новых умений на этом уровне нет.</p>
        ) : (
          <ul className="eng-changes">
            {rows.map((r) => (
              <li key={r.slug} className={r.sign === '+' ? 'is-add' : r.sign ? 'is-del' : ''} title={r.slug}>
                <b>{r.sign}</b> {r.name}
              </li>
            ))}
          </ul>
        )}
        <p className="cw-field-note">Если умения требуют выбора, он появится плашкой «Требует решения» над листом.</p>
      </SheetModal>
    )
  }

  return (
    <SheetModal
      title="Повышение уровня"
      kicker={`сейчас ${total} ур.`}
      tone="level"
      visual={<GraduationCap className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="cs-btn cw-next"
            disabled={busy || total >= 20 || !classId || (needSubclass && subclasses.length > 0 && !subclassId) || (hpMode === 'roll' && hpRoll == null)}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="cw-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Повысить
          </button>
        </>
      }
    >
      {total >= 20 && <p className="act-message">Герой уже 20 уровня.</p>}
      <div className="act-form">
        <label className="act-field">
          <span className="act-label">Класс</span>
          <select className="ed-input ed-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {options.map((c) => {
              const lvl = character.classes.find((x) => x.class_id === c.id)?.level
              return (
                <option key={c.id} value={c.id}>
                  {c.class_name} {lvl ? `${lvl} → ${lvl + 1}` : '— мультикласс'}
                </option>
              )
            })}
          </select>
        </label>

        {needSubclass && (
          <label className="act-field">
            <span className="act-label">Подкласс</span>
            <span className="act-hint">выбирается на {subLevel} уровне класса</span>
            <select className="ed-input ed-select" value={subclassId ?? ''} onChange={(e) => setSubclassId(e.target.value || null)}>
              <option value="">— выберите —</option>
              {subclasses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subclass_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {own?.subclass_id && <p className="cw-field-note">Подкласс: {names.subclass(own.subclass_id) ?? '—'}</p>}

        <div className="act-field">
          <span className="act-label">Хиты за уровень</span>
          <span className="act-hint">к{die}; Телосложение прибавит сервер</span>
          <span className="eng-hp">
            <Segmented
              value={hpMode}
              onChange={setHpMode}
              options={[
                { value: 'average', label: `среднее (${Math.floor(die / 2) + 1})` },
                { value: 'roll', label: 'бросок' },
              ]}
            />
            {hpMode === 'roll' && (
              <button type="button" className="cw-mini-btn" onClick={() => void roll()} disabled={dice.rolling}>
                <Dices aria-hidden="true" /> {hpRoll == null ? `бросить к${die}` : `выпало ${hpRoll} — перебросить`}
              </button>
            )}
          </span>
        </div>
        {error && <p className="act-message">{error}</p>}
      </div>
    </SheetModal>
  )
}

/* ---------- журнал ---------- */

const clock = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  return today ? time : `${d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}, ${time}`
}

export function JournalModal({
  characterId,
  revision,
  canUndo,
  onUndo,
  onClose,
}: {
  characterId: string
  /** ревизия листа: журнал перечитывается после каждого действия и отмены */
  revision: number
  canUndo: boolean
  onUndo: (eventId: string) => void
  onClose: () => void
}) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listEvents(characterId, 50)
      .then((list) => alive && setEvents(list))
      .catch((e) => alive && setError(errorText(e)))
    return () => {
      alive = false
    }
  }, [characterId, revision])

  // отменить можно только верхнюю, ещё не отменённую запись
  const top = events?.[0]
  return (
    <SheetModal
      title="Журнал"
      kicker="действия, отдых, уровни"
      tone="journal"
      visual={<ScrollText className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <button type="button" className="cs-btn cw-next" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      {error && <p className="act-message">{error}</p>}
      {!events && !error && (
        <p className="muted act-wait">
          <Loader2 className="cw-spin" aria-hidden="true" /> Загрузка…
        </p>
      )}
      {events?.length === 0 && <p className="cw-field-note">Пока пусто.</p>}
      {events && events.length > 0 && (
        <ol className="eng-journal">
          {events.map((ev) => (
            <li key={ev.id} className={ev.undone ? 'is-undone' : ''}>
              <header>
                <b>{ev.label}</b>
                <time>{clock(ev.created_at)}</time>
                {ev.undone && <em>отменено</em>}
                {canUndo && ev === top && !ev.undone && (
                  <button type="button" className="cw-mini-btn" onClick={() => onUndo(ev.id)}>
                    <Undo2 aria-hidden="true" /> отменить
                  </button>
                )}
              </header>
              {ev.log.length > 0 && (
                <ul>
                  {ev.log.map((l, i) => (
                    <li key={i} className={`eng-log--${l.kind}`}>
                      {l.message}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </SheetModal>
  )
}

/* ---------- отложенные решения ---------- */

export function PendingBanner({
  decisions,
  canPlay,
  busy,
  onDecide,
  onDismiss,
}: {
  decisions: PendingDecision[]
  canPlay: boolean
  busy: boolean
  onDecide: (d: PendingDecision) => void
  onDismiss: (d: PendingDecision) => void
}) {
  if (decisions.length === 0) return null
  return (
    <div className="eng-pending" role="region" aria-label="Требует решения">
      <span className="eng-pending-title">
        <BellRing aria-hidden="true" /> Требует решения · {decisions.length}
      </span>
      <ul>
        {decisions.map((d) => (
          <li key={d.id}>
            <span>
              <b>{d.label}</b>
              <i>{d.kind === 'listener' ? 'реакция на событие' : 'выбор при получении умения'}</i>
            </span>
            {canPlay && (
              <>
                <button type="button" className="cs-btn" disabled={busy} onClick={() => onDecide(d)}>
                  Решить
                </button>
                <button type="button" className="cw-mini-btn" disabled={busy} onClick={() => onDismiss(d)} title="Отклонить">
                  <X aria-hidden="true" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
