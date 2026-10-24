/**
 * Игровая панель листа: ход и бой, отдых, ресурсы способностей, кнопки
 * действий и активные эффекты. Всё это — с сервера: кнопка шлёт действие,
 * сервер решает, можно ли (enabled/reason), и возвращает новый лист.
 */
import {
  Coffee,
  Flag,
  Hourglass,
  Moon,
  Play,
  ScrollText,
  Sparkles,
  Square,
  Swords,
  TimerReset,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TurnEvent } from '../api'
import type { Sheet, SheetAction, SheetResource } from '../types/character'
import { Corners } from '../ornaments'

/** Что видит панель и что она умеет; без onAction — лист только для просмотра */
export interface EngineView {
  sheet: Sheet
  busy: boolean
  /** свой персонаж — можно действовать */
  canPlay: boolean
  onAction: (a: SheetAction) => void
  onTurn: (name: TurnEvent, title: string) => void
  onLongRest: () => void
  onShortRest: () => void
  onJournal: () => void
}

const ECONOMY: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'action', label: 'Действие', icon: Swords },
  { key: 'bonus_action', label: 'Бонусное действие', icon: Zap },
  { key: 'reaction', label: 'Реакция', icon: TimerReset },
  { key: 'free', label: 'Свободно', icon: Sparkles },
  { key: 'none', label: 'Вне хода', icon: Hourglass },
]

const TURN: { name: TurnEvent; title: string; icon: LucideIcon }[] = [
  { name: 'combat.start', title: 'Начало боя', icon: Flag },
  { name: 'turn.start', title: 'Начало хода', icon: Play },
  { name: 'turn.end', title: 'Конец хода', icon: Square },
  { name: 'combat.end', title: 'Конец боя', icon: Flag },
]

const RECHARGE: Record<string, string> = {
  short_rest: 'короткий отдых',
  long_rest: 'продолжительный отдых',
  'rest.short': 'короткий отдых',
  'rest.long': 'продолжительный отдых',
  turn_start: 'начало хода',
  'turn.start': 'начало хода',
  dawn: 'рассвет',
}

const EXPIRES: Record<string, string> = {
  never: 'пока не снят',
  short_rest: 'до короткого отдыха',
  long_rest: 'до продолжительного отдыха',
  turn_start: 'до начала хода',
  turn_end: 'до конца хода',
}

/** Счётчик ресурса: кружки до 12, дальше числом; max ≥ 99 — без ограничений */
function ResourceMeter({ r }: { r: SheetResource }) {
  const unlimited = r.max >= 99
  const pips = !unlimited && r.max > 0 && r.max <= 12
  const recharge = r.recharge.map((x) => RECHARGE[x] ?? x).join(', ')
  return (
    <div className="eng-res" title={recharge ? `Восстановление: ${recharge}` : undefined}>
      <span className="eng-res-label">{r.label}</span>
      {unlimited ? (
        <b className="eng-res-num">∞</b>
      ) : pips ? (
        <span className="eng-pips" aria-label={`${r.current} из ${r.max}`}>
          {Array.from({ length: r.max }, (_, i) => (
            <i key={i} className={i < r.current ? 'is-on' : ''} />
          ))}
        </span>
      ) : (
        <b className="eng-res-num">
          {r.current}
          <em>/{r.max}</em>
        </b>
      )}
    </div>
  )
}

export function EnginePanel({ engine }: { engine: EngineView }) {
  const { sheet, busy, canPlay } = engine
  const groups = ECONOMY.map((g) => ({ ...g, list: sheet.actions.filter((a) => (a.action_economy || 'none') === g.key) }))
  // неизвестная экономика действия — в «Вне хода», чтобы кнопка не потерялась
  const known = new Set(ECONOMY.map((g) => g.key))
  groups[groups.length - 1].list.push(...sheet.actions.filter((a) => a.action_economy && !known.has(a.action_economy)))

  return (
    <section className="beast-card cw-sheet-card eng">
      <Corners size={18} />
      <h3 className="beast-card-title">
        <Zap aria-hidden="true" /> Ход и действия
        <span className="cw-sheet-aside">
          <button type="button" className="cw-mini-btn" onClick={engine.onJournal}>
            <ScrollText aria-hidden="true" /> журнал
          </button>
        </span>
      </h3>

      {canPlay && (
        <div className="eng-bar">
          <span className="eng-turn" role="group" aria-label="Ход в бою">
            {TURN.map(({ name, title, icon: Icon }) => (
              <button key={name} type="button" className="cw-mini-btn" disabled={busy} onClick={() => engine.onTurn(name, title)}>
                <Icon aria-hidden="true" /> {title}
              </button>
            ))}
          </span>
          <span className="eng-rest" role="group" aria-label="Отдых">
            <button type="button" className="cw-mini-btn" disabled={busy} onClick={engine.onShortRest}>
              <Coffee aria-hidden="true" /> короткий отдых
            </button>
            <button type="button" className="cw-mini-btn" disabled={busy} onClick={engine.onLongRest}>
              <Moon aria-hidden="true" /> продолжительный отдых
            </button>
          </span>
        </div>
      )}

      {sheet.resources.length > 0 && (
        <div className="eng-resources">
          {sheet.resources.map((r) => (
            <ResourceMeter key={r.key} r={r} />
          ))}
        </div>
      )}

      {sheet.active_effects.length > 0 && (
        <ul className="eng-effects" aria-label="Активные эффекты">
          {sheet.active_effects.map((e) => (
            <li key={e.id}>
              <Sparkles aria-hidden="true" />
              <b>{e.label}</b>
              <i>{e.rounds_left != null ? `раундов: ${e.rounds_left}` : (EXPIRES[e.expires] ?? e.expires)}</i>
            </li>
          ))}
        </ul>
      )}

      {sheet.actions.length > 0 ? (
        <div className="eng-groups">
          {groups
            .filter((g) => g.list.length > 0)
            .map(({ key, label, icon: Icon, list }) => (
              <div key={key} className={`eng-group eng-group--${key}`}>
                <h4>
                  <Icon aria-hidden="true" /> {label}
                </h4>
                <div className="eng-actions">
                  {list.map((a) => (
                    <button
                      key={`${a.grant_id}:${a.key}`}
                      type="button"
                      className="eng-action"
                      disabled={!canPlay || !a.enabled || busy}
                      title={!a.enabled && a.reason ? a.reason : (a.description ?? undefined)}
                      onClick={() => engine.onAction(a)}
                    >
                      <b>{a.label}</b>
                      <i>{a.ability_name}</i>
                      {!a.enabled && a.reason && <em>{a.reason}</em>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="cw-field-note">
          Активных действий нет: умения героя пока описаны только текстом — они на странице «Умения».
        </p>
      )}
    </section>
  )
}
