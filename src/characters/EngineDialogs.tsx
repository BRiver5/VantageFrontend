/**
 * Окна игровых операций: короткий отдых (сколько костей хитов тратить),
 * журнал действий (панель справа) и журнал хитов с отменой последнего,
 * плашка отложенных решений над листом. Повышение уровня — отдельный мастер
 * (create/LevelUpWizard).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BellRing, Check, Coffee, Loader2, ScrollText, Undo2, X } from 'lucide-react'
import { listEvents } from '../api'
import type { Character, CharacterEvent, PendingDecision, Sheet } from '../types/character'
import { Stepper } from './editorFields'
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

/* ---------- журнал ---------- */

const clock = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  return today ? time : `${d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}, ${time}`
}

/** Виды событий журнала хитов: урон, лечение, временные хиты, отдых */
export const HP_EVENT_KINDS = new Set(['hp', 'rest'])

const KIND_LABEL: Record<string, string> = {
  action: 'действие',
  hp: 'хиты',
  rest: 'отдых',
  event: 'ход',
  pending: 'выбор',
  level_up: 'уровень',
  attach: 'умение',
  detach: 'умение',
  toggle: 'умение',
  sync: 'умения',
  override: 'мастер',
}

/** Лента событий: новые первыми, отменить можно только верхнюю неотменённую */
function JournalList({
  characterId,
  revision,
  canUndo,
  onUndo,
  filter,
}: {
  characterId: string
  revision: number
  canUndo: boolean
  onUndo: (eventId: string) => void
  filter?: (ev: CharacterEvent) => boolean
}) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listEvents(characterId, 100)
      .then((list) => alive && setEvents(list))
      .catch((e) => alive && setError(errorText(e)))
    return () => {
      alive = false
    }
  }, [characterId, revision])

  const top = events?.[0]
  const shown = events?.filter((ev) => !filter || filter(ev)) ?? null
  return (
    <>
      {error && <p className="act-message">{error}</p>}
      {!events && !error && (
        <p className="muted act-wait">
          <Loader2 className="cw-spin" aria-hidden="true" /> Загрузка…
        </p>
      )}
      {shown?.length === 0 && <p className="cw-field-note">Пока пусто.</p>}
      {shown && shown.length > 0 && (
        <ol className="eng-journal">
          {shown.map((ev) => (
            <li key={ev.id} className={`${ev.undone ? 'is-undone' : ''} is-${ev.kind}`}>
              <header>
                <span className="eng-journal-kind">{KIND_LABEL[ev.kind] ?? ev.kind}</span>
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
    </>
  )
}

interface JournalProps {
  characterId: string
  /** ревизия листа: журнал перечитывается после каждого действия и отмены */
  revision: number
  canUndo: boolean
  onUndo: (eventId: string) => void
  onClose: () => void
}

/** Журнал хитов — окно у шестигранника: только урон, лечение и отдых */
export function JournalModal(props: JournalProps) {
  return (
    <SheetModal
      title="Журнал хитов"
      kicker="урон, лечение, отдых"
      tone="journal"
      visual={<ScrollText className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={props.onClose}
      actions={
        <button type="button" className="cs-btn cw-next" onClick={props.onClose}>
          Закрыть
        </button>
      }
    >
      <JournalList {...props} filter={(ev) => HP_EVENT_KINDS.has(ev.kind)} />
    </SheetModal>
  )
}

/** Журнал действий — панель справа: всё, что делал герой, с отменой последнего */
export function JournalDrawer(props: JournalProps) {
  const { onClose } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="jr-layer" onClick={onClose}>
      <aside className="jr-drawer" role="dialog" aria-label="Журнал действий" onClick={(e) => e.stopPropagation()}>
        <header className="jr-head">
          <ScrollText aria-hidden="true" />
          <b>Журнал действий</b>
          <button type="button" className="cw-mini-btn" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="jr-body">
          <JournalList {...props} />
        </div>
      </aside>
    </div>,
    document.body,
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
